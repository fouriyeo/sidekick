package dev.sidekick.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.io.File
import java.io.FileOutputStream

/**
 * 电脑遥控麦克风的「待命 + 录音」前台服务。
 *
 * 为什么需要它：Android 12+ 不允许 App 在后台新建 microphone 前台服务，所以手机必须在
 * 前台时先把本服务挂起来（待命）；之后 Mac 发 `mic.remote.start` 才能直接开 AudioRecord。
 * 待命期间不碰麦克风、不亮绿点，只保留一条常驻通知。
 *
 * 音频以 16k mono PCM16 原样写入 [capturePath]；Rust 侧 tail 这个文件，按 100ms 组帧
 * 走现有 `mic.start` / `SK01` 协议发给电脑。停止时写 `<path>.stop`（内容为原因），
 * Rust 读到后发 `mic.stop`，所以通知栏「停止」也能结束会话。
 */
class RemoteMicService : Service() {
  enum class State {
    IDLE,
    STANDBY,
    RECORDING,
  }

  data class Snapshot(
    val state: State,
    val session: String?,
    val startedAt: Long,
    val bytes: Long,
  )

  private var captureThread: Thread? = null
  @Volatile
  private var audioRecord: AudioRecord? = null
  @Volatile
  private var captureRunning = false
  @Volatile
  private var captureReason = "release"
  private var wakeLock: PowerManager.WakeLock? = null
  private var standbyRequested = false

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STANDBY_START -> startStandby()
      ACTION_STANDBY_STOP -> stopStandby()
      ACTION_START_CAPTURE -> startCapture(intent)
      ACTION_STOP_CAPTURE -> stopCapture(intent.getStringExtra(EXTRA_REASON) ?: "release", false)
      else -> if (state == State.IDLE) startStandby()
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    captureRunning = false
    try {
      audioRecord?.stop()
    } catch (_: Exception) {
    }
    try {
      captureThread?.join(800)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    releaseWakeLock()
    state = State.IDLE
    session = null
    super.onDestroy()
  }

  private fun startStandby() {
    standbyRequested = true
    if (state == State.RECORDING) {
      updateNotification(buildRecordingNotification())
      return
    }
    state = State.STANDBY
    startForegroundCompat(buildStandbyNotification())
  }

  private fun stopStandby() {
    standbyRequested = false
    if (state == State.RECORDING) {
      stopCapture("cancel", true)
    }
    stopForegroundCompat()
    state = State.IDLE
    session = null
    stopSelf()
  }

  private fun startCapture(intent: Intent) {
    val nextSession = intent.getStringExtra(EXTRA_SESSION) ?: return
    val path = intent.getStringExtra(EXTRA_PATH) ?: return
    val maxMs = intent.getLongExtra(EXTRA_MAX_MS, 60_000L).coerceIn(1_000L, 60_000L)

    if (state == State.RECORDING) {
      stopCapture("cancel", true)
    }
    standbyRequested = true
    state = State.RECORDING
    session = nextSession
    startedAt = SystemClock.elapsedRealtime()
    bytes = 0L
    captureReason = "release"
    captureRunning = true
    // 服务已在待命前台状态，只更新通知；不要再 startForeground 一次（避开 Android 14+
    // 对后台 while-in-use 服务重复 startForeground 的额外校验）。
    updateNotification(buildRecordingNotification())
    captureThread =
      Thread({ captureLoop(path, maxMs) }, "sidekick-remote-mic").also {
        it.start()
      }
  }

  /**
   * 停止采集。`reason` 会写进 `<path>.stop` 让 Rust 发给电脑；`join` 用于关闭待命时
   * 等线程把最后一段写完（通知栏「停止」不阻塞主线程）。
   */
  private fun stopCapture(reason: String, join: Boolean) {
    captureReason = reason
    captureRunning = false
    try {
      audioRecord?.stop()
    } catch (_: Exception) {
    }
    if (join) {
      try {
        captureThread?.join(800)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
  }

  private fun captureLoop(path: String, maxMs: Long) {
    var record: AudioRecord? = null
    var output: FileOutputStream? = null
    var reason = captureReason
    val localStartedAt = SystemClock.elapsedRealtime()
    try {
      val file = File(path)
      file.parentFile?.mkdirs()
      if (file.exists()) file.delete()
      File("$path$STOP_SUFFIX").delete()
      output = FileOutputStream(file, false)

      record = buildAudioRecord()
      audioRecord = record
      record.startRecording()
      if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("录音未启动")
      }
      acquireWakeLock(maxMs + 5_000)
      Log.i(TAG, "capture start session=$session path=$path")

      val buffer = ByteArray(FRAME_BYTES)
      val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      while (captureRunning) {
        if (SystemClock.elapsedRealtime() - localStartedAt >= maxMs) {
          reason = "timeout"
          break
        }
        // 来电/通话/VoIP 抢占麦克风时停止；不要继续录一段静音。
        if (audioManager.mode == AudioManager.MODE_IN_CALL ||
          audioManager.mode == AudioManager.MODE_IN_COMMUNICATION ||
          audioManager.mode == AudioManager.MODE_RINGTONE
        ) {
          reason = "mic_lost"
          break
        }
        val count = record.read(buffer, 0, buffer.size)
        if (count < 0) {
          reason = "mic_lost"
          break
        }
        if (count == 0) {
          Thread.sleep(10)
          continue
        }
        output.write(buffer, 0, count)
        output.flush()
        bytes += count.toLong()
      }
      if (reason == "release" && !captureRunning) reason = captureReason
    } catch (error: Exception) {
      Log.w(TAG, "capture failed: ${error.message}")
      if (reason == "release") reason = "mic_lost"
    } finally {
      captureRunning = false
      try {
        output?.flush()
      } catch (_: Exception) {
      }
      try {
        output?.close()
      } catch (_: Exception) {
      }
      try {
        record?.stop()
      } catch (_: Exception) {
      }
      try {
        record?.release()
      } catch (_: Exception) {
      }
      audioRecord = null
      releaseWakeLock()
      writeStopMarker(path, reason)
      session = null
      state = if (standbyRequested) State.STANDBY else State.IDLE
      Log.i(TAG, "capture stop reason=$reason bytes=$bytes")
      if (standbyRequested) {
        updateNotification(buildStandbyNotification())
      } else {
        stopForegroundCompat()
        stopSelf()
      }
    }
  }

  private fun buildAudioRecord(): AudioRecord {
    val sources =
      listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC)
    var lastError: Exception? = null
    for (source in sources) {
      try {
        val format =
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val min =
          AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
          )
        val buffer = if (min > 0) maxOf(min * 2, 8192) else 8192
        val candidate =
          AudioRecord.Builder()
            .setAudioSource(source)
            .setAudioFormat(format)
            .setBufferSizeInBytes(buffer)
            .build()
        if (candidate.state == AudioRecord.STATE_INITIALIZED) return candidate
        candidate.release()
      } catch (error: Exception) {
        lastError = error
        Log.w(TAG, "source $source init failed: ${error.message}")
      }
    }
    throw IllegalStateException("无法初始化 16k 单声道录音：${lastError?.message ?: "未知错误"}")
  }

  private fun acquireWakeLock(timeoutMs: Long) {
    try {
      val manager = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock =
        manager
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sidekick:remote-mic")
          .also {
            it.setReferenceCounted(false)
            it.acquire(timeoutMs)
          }
    } catch (error: Exception) {
      Log.w(TAG, "wake lock failed: ${error.message}")
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  private fun writeStopMarker(path: String, reason: String) {
    try {
      File("$path$STOP_SUFFIX").writeText(reason)
    } catch (error: Exception) {
      Log.w(TAG, "stop marker failed: ${error.message}")
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, "电脑遥控录音", NotificationManager.IMPORTANCE_LOW).apply {
        description = "电脑快捷键遥控手机麦克风时的待命/录音提示"
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) {
    }
  }

  private fun updateNotification(notification: Notification) {
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, notification)
    } catch (error: Exception) {
      Log.w(TAG, "notify failed: ${error.message}")
    }
  }

  private fun buildStandbyNotification(): Notification =
    baseNotification()
      .setContentTitle("电脑遥控待命")
      .setContentText("切到别的 App 也能用电脑快捷键录音")
      .setOngoing(true)
      .setShowWhen(false)
      .addAction(0, "关闭待命", servicePendingIntent(ACTION_STANDBY_STOP, 2, null))
      .build()

  private fun buildRecordingNotification(): Notification =
    baseNotification()
      .setContentTitle("正在录音")
      .setContentText("电脑遥控 · 点按回到小跟班")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setUsesChronometer(true)
      .setWhen(System.currentTimeMillis() - (SystemClock.elapsedRealtime() - startedAt))
      .addAction(0, "停止", servicePendingIntent(ACTION_STOP_CAPTURE, 3, "release"))
      .build()

  private fun baseNotification(): NotificationCompat.Builder =
    NotificationCompat
      .Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setColor(0xFF3DD6C4.toInt())
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(contentPendingIntent())

  private fun contentPendingIntent(): PendingIntent {
    val intent =
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
    return PendingIntent.getActivity(
      this,
      1,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun servicePendingIntent(action: String, requestCode: Int, reason: String?): PendingIntent {
    val intent =
      Intent(this, RemoteMicService::class.java).apply {
        this.action = action
        if (reason != null) putExtra(EXTRA_REASON, reason)
      }
    return PendingIntent.getService(
      this,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    const val ACTION_STANDBY_START = "dev.sidekick.app.remote_mic.STANDBY_START"
    const val ACTION_STANDBY_STOP = "dev.sidekick.app.remote_mic.STANDBY_STOP"
    const val ACTION_START_CAPTURE = "dev.sidekick.app.remote_mic.START_CAPTURE"
    const val ACTION_STOP_CAPTURE = "dev.sidekick.app.remote_mic.STOP_CAPTURE"
    const val EXTRA_SESSION = "session"
    const val EXTRA_PATH = "path"
    const val EXTRA_MAX_MS = "maxMs"
    const val EXTRA_REASON = "reason"

    private const val TAG = "RemoteMicService"
    private const val CHANNEL_ID = "sidekick-remote-mic"
    private const val NOTIFICATION_ID = 4783
    private const val SAMPLE_RATE = 16_000
    private const val FRAME_BYTES = 3_200
    private const val STOP_SUFFIX = ".stop"

    @Volatile
    private var state = State.IDLE

    @Volatile
    private var session: String? = null

    @Volatile
    private var startedAt = 0L

    @Volatile
    private var bytes = 0L

    fun snapshot(): Snapshot = Snapshot(state, session, startedAt, bytes)
  }
}
