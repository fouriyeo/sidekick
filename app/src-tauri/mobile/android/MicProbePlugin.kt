// 手机端麦克风选择 spike：枚举 Android 暴露的内置输入设备，并按指定设备录一段 PCM。
//
// 注意：`gen/` 不入库。本文件在构建前由 `scripts/patch-android-manifest.mjs`
// 拷贝到 `app/src-tauri/gen/android/app/src/main/java/dev/sidekick/app/`；
// 直接跑 `pnpm tauri android dev` 前需先跑一次该脚本（或用 `scripts/build-android.sh`）。
package dev.sidekick.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.Locale

@InvokeArg
class MicProbeRecordArgs {
  var deviceId: Int = -1
  var seconds: Int = 3
  var source: Int? = null
}

@TauriPlugin
class MicProbePlugin(private val activity: Activity) : Plugin(activity) {
  @Volatile
  private var recording = false

  @Command
  fun listInputs(invoke: Invoke) {
    try {
      val manager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val devices = JSArray()
      for (device in manager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
        if (device.type != AudioDeviceInfo.TYPE_BUILTIN_MIC) continue
        val item = JSObject()
        item.put("id", device.id)
        item.put("address", addressOf(device))
        item.put("productName", device.productName?.toString() ?: "")
        item.put("channelCounts", JSArray(device.channelCounts.toList()))
        item.put("sampleRates", JSArray(device.sampleRates.toList()))
        devices.put(item)
      }
      val result = JSObject()
      result.put("devices", devices)
      invoke.resolve(result)
    } catch (error: Exception) {
      invoke.reject("枚举麦克风失败：${error.message ?: "未知错误"}")
    }
  }

  @Command
  fun record(invoke: Invoke) {
    if (recording) {
      invoke.reject("正在录音，请稍候")
      return
    }
    if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      invoke.reject("需要麦克风权限：请先在宠物页按一次麦克风授权")
      return
    }
    val args =
      try {
        invoke.parseArgs(MicProbeRecordArgs::class.java)
      } catch (error: Exception) {
        invoke.reject("录音参数无效")
        return
      }

    recording = true
    Thread({ runRecord(invoke, args) }, "sidekick-mic-probe").start()
  }

  private fun runRecord(invoke: Invoke, args: MicProbeRecordArgs) {
    var record: AudioRecord? = null
    try {
      val seconds = args.seconds.coerceIn(1, 5)
      val total = RATE * seconds
      val manager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val device =
        manager.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.id == args.deviceId }

      // UNPROCESSED 是“单麦原声”；万一机型不支持，再退到语音识别/默认源。
      val sources =
        buildList {
            args.source?.let { add(it) }
            add(MediaRecorder.AudioSource.UNPROCESSED)
            add(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            add(MediaRecorder.AudioSource.MIC)
          }
          .distinct()

      var picked: AudioRecord? = null
      var sourceUsed = 0
      var preferredApplied = false
      for (source in sources) {
        val candidate =
          try {
            buildRecord(source)
          } catch (error: Exception) {
            Log.w(TAG, "source $source 初始化失败: ${error.message}")
            null
          } ?: continue
        if (candidate.state != AudioRecord.STATE_INITIALIZED) {
          candidate.release()
          continue
        }
        if (device != null) {
          preferredApplied =
            try {
              candidate.setPreferredDevice(device)
            } catch (error: Exception) {
              Log.w(TAG, "setPreferredDevice 失败: ${error.message}")
              false
            }
        }
        picked = candidate
        sourceUsed = source
        break
      }
      record = picked ?: throw IllegalStateException("无法初始化 16k 单声道录音")

      val started = SystemClock.elapsedRealtime()
      record.startRecording()
      if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("录音未启动")
      }
      val routed = try {
        record.routedDevice
      } catch (error: Exception) {
        null
      }

      val samples = ShortArray(total)
      var read = 0
      while (read < total) {
        val count = record.read(samples, read, minOf(2048, total - read))
        if (count <= 0) break
        read += count
      }
      if (read <= 0) throw IllegalStateException("没有读到音频数据")
      val elapsed = SystemClock.elapsedRealtime() - started

      var sum = 0.0
      var peak = 0.0
      for (index in 0 until read) {
        val value = samples[index] / 32768.0
        sum += value * value
        val magnitude = kotlin.math.abs(value)
        if (magnitude > peak) peak = magnitude
      }
      val rms = kotlin.math.sqrt(sum / read)

      // Android 是 little-endian；PCM16 直接按低字节在前写。
      val bytes = ByteArray(read * 2)
      for (index in 0 until read) {
        val value = samples[index].toInt()
        bytes[index * 2] = (value and 0xFF).toByte()
        bytes[index * 2 + 1] = ((value shr 8) and 0xFF).toByte()
      }

      val result = JSObject()
      result.put("pcmBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
      result.put("sampleRate", RATE)
      result.put("samples", read)
      result.put("sourceUsed", sourceUsed)
      result.put("routedAddress", routed?.let { addressOf(it) } ?: "")
      result.put("preferredApplied", preferredApplied)
      result.put("rms", rms)
      result.put("peak", peak)
      result.put("elapsedMs", elapsed)
      Log.i(
        TAG,
        "record requested=${args.deviceId} source=$sourceUsed " +
          "routed=${routed?.let { addressOf(it) }} preferred=$preferredApplied " +
          "samples=$read rms=${String.format(Locale.US, "%.4f", rms)}",
      )
      activity.runOnUiThread { invoke.resolve(result) }
    } catch (error: Exception) {
      Log.w(TAG, "record failed: ${error.message}")
      activity.runOnUiThread {
        invoke.reject("录音失败：${error.message ?: "未知错误"}")
      }
    } finally {
      try {
        record?.stop()
      } catch (error: Exception) {
        // 未 start 时 stop 会抛；忽略。
      }
      try {
        record?.release()
      } catch (error: Exception) {
        // 释放失败不影响下一次。
      }
      recording = false
    }
  }

  private fun buildRecord(source: Int): AudioRecord {
    val format =
      AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(RATE)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build()
    val min =
      AudioRecord.getMinBufferSize(
        RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      )
    val buffer = if (min > 0) maxOf(min * 2, 4096) else 8192
    return AudioRecord.Builder()
      .setAudioSource(source)
      .setAudioFormat(format)
      .setBufferSizeInBytes(buffer)
      .build()
  }

  private fun addressOf(device: AudioDeviceInfo): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) device.address ?: "" else ""

  private companion object {
    const val TAG = "MicProbe"
    const val RATE = 16_000
  }
}
