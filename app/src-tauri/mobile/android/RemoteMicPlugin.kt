package dev.sidekick.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * 手机端「后台待命」插件的薄命令层。
 *
 * 真正的常驻/录音在 [RemoteMicService]；这里只负责：
 * - 首次开启时申请 RECORD_AUDIO / POST_NOTIFICATIONS；
 * - 启动/关闭待命；
 * - 把待命状态、开始/停止采集转给 Service；
 * - 给 Rust 返回可序列化的状态。
 */
@InvokeArg
class RemoteMicStartArgs {
  var session: String = ""
  var path: String = ""
  var maxMs: Long = 60_000L
}

@InvokeArg
class RemoteMicStopArgs {
  var reason: String = "release"
}

@TauriPlugin
class RemoteMicPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun prepare(invoke: Invoke) {
    val missing = mutableListOf<String>()
    if (!granted(Manifest.permission.RECORD_AUDIO)) {
      missing.add(Manifest.permission.RECORD_AUDIO)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !granted(Manifest.permission.POST_NOTIFICATIONS)
    ) {
      missing.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    if (missing.isEmpty()) {
      invoke.resolve(prepareResult(true))
      return
    }

    val wry = activity as? WryActivity
    if (wry == null) {
      invoke.reject("当前 Activity 不支持权限申请")
      return
    }
    wry.requestPermissions(missing.toTypedArray()) {
      val mic = granted(Manifest.permission.RECORD_AUDIO)
      val notifications =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          granted(Manifest.permission.POST_NOTIFICATIONS)
      val result = prepareResult(mic && notifications)
      activity.runOnUiThread { invoke.resolve(result) }
    }
  }

  @Command
  fun standbyStart(invoke: Invoke) {
    // 幂等：服务已经在待命/录音时不要重复 startForegroundService（后台重入可能被系统拒）。
    if (RemoteMicService.snapshot().state != RemoteMicService.State.IDLE) {
      invoke.resolve(statusResult())
      return
    }
    if (!granted(Manifest.permission.RECORD_AUDIO)) {
      invoke.resolve(errorResult("permission_denied"))
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !granted(Manifest.permission.POST_NOTIFICATIONS)
    ) {
      invoke.resolve(errorResult("notification_denied"))
      return
    }
    val intent =
      Intent(activity, RemoteMicService::class.java)
        .setAction(RemoteMicService.ACTION_STANDBY_START)
    try {
      ContextCompat.startForegroundService(activity, intent)
      invoke.resolve(statusResult())
    } catch (error: Exception) {
      Log.w(TAG, "standby start failed: ${error.message}")
      invoke.resolve(errorResult("service_failed"))
    }
  }

  @Command
  fun standbyStop(invoke: Invoke) {
    try {
      activity.startService(
        Intent(activity, RemoteMicService::class.java)
          .setAction(RemoteMicService.ACTION_STANDBY_STOP),
      )
      invoke.resolve(okResult())
    } catch (error: Exception) {
      Log.w(TAG, "standby stop failed: ${error.message}")
      invoke.resolve(errorResult("service_failed"))
    }
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(statusResult())
  }

  @Command
  fun startCapture(invoke: Invoke) {
    val args =
      try {
        invoke.parseArgs(RemoteMicStartArgs::class.java)
      } catch (error: Exception) {
        invoke.resolve(errorResult("bad_request"))
        return
      }
    if (args.session.isBlank() || args.path.isBlank()) {
      invoke.resolve(errorResult("bad_request"))
      return
    }
    val snapshot = RemoteMicService.snapshot()
    if (snapshot.state == RemoteMicService.State.IDLE) {
      invoke.resolve(errorResult("standby_off"))
      return
    }
    try {
      activity.startService(
        Intent(activity, RemoteMicService::class.java)
          .setAction(RemoteMicService.ACTION_START_CAPTURE)
          .putExtra(RemoteMicService.EXTRA_SESSION, args.session)
          .putExtra(RemoteMicService.EXTRA_PATH, args.path)
          .putExtra(RemoteMicService.EXTRA_MAX_MS, args.maxMs),
      )
      invoke.resolve(statusResult())
    } catch (error: Exception) {
      Log.w(TAG, "start capture failed: ${error.message}")
      invoke.resolve(errorResult("service_failed"))
    }
  }

  @Command
  fun stopCapture(invoke: Invoke) {
    val reason =
      try {
        invoke.parseArgs(RemoteMicStopArgs::class.java).reason
      } catch (_: Exception) {
        "release"
      }
    try {
      activity.startService(
        Intent(activity, RemoteMicService::class.java)
          .setAction(RemoteMicService.ACTION_STOP_CAPTURE)
          .putExtra(RemoteMicService.EXTRA_REASON, reason),
      )
      invoke.resolve(statusResult())
    } catch (error: Exception) {
      Log.w(TAG, "stop capture failed: ${error.message}")
      invoke.resolve(errorResult("service_failed"))
    }
  }

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED

  private fun okResult(): JSObject =
    JSObject().apply {
      put("ok", true)
    }

  private fun prepareResult(ok: Boolean): JSObject =
    JSObject().apply {
      put("ok", ok)
      put("mic", granted(Manifest.permission.RECORD_AUDIO))
      put(
        "notifications",
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          granted(Manifest.permission.POST_NOTIFICATIONS),
      )
    }

  private fun statusResult(): JSObject {
    val snapshot = RemoteMicService.snapshot()
    return JSObject().apply {
      put("ok", true)
      put("standby", snapshot.state != RemoteMicService.State.IDLE)
      put("recording", snapshot.state == RemoteMicService.State.RECORDING)
      put("session", snapshot.session ?: "")
      put("startedAt", snapshot.startedAt)
      put("bytes", snapshot.bytes)
    }
  }

  private fun errorResult(code: String): JSObject =
    JSObject().apply {
      put("ok", false)
      put("code", code)
      put("standby", false)
      put("recording", false)
    }

  private companion object {
    const val TAG = "RemoteMicPlugin"
  }
}
