package com.oppo.remotecontrol.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioManager
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.gson.Gson
import com.oppo.remotecontrol.MainActivity
import com.oppo.remotecontrol.R
import com.oppo.remotecontrol.model.DeviceAuthPayload
import com.oppo.remotecontrol.model.DeviceStatusUpdate
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Dịch vụ Trung tâm Giữ Sống Kết Nối & Truyền Màn Hình OPPO
 * Chống ColorOS đóng băng ngầm bằng Dual Hardware Locks và Persistent MediaProjection
 */
class CoreKeepAliveService : Service() {

    companion object {
        private const val TAG = "CoreKeepAliveService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "oppo_keepalive_channel"

        const val ACTION_START = "com.oppo.remotecontrol.ACTION_START"
        const val ACTION_STOP = "com.oppo.remotecontrol.ACTION_STOP"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_RESULT_DATA = "EXTRA_RESULT_DATA"
        const val EXTRA_SERVER_URL = "EXTRA_SERVER_URL"
        const val EXTRA_SECRET_PIN = "EXTRA_SECRET_PIN"

        @Volatile
        var instance: CoreKeepAliveService? = null
            private set

        val isServiceRunning: Boolean
            get() = instance != null

        @Volatile
        var isConnectedToSocket: Boolean = false
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.Default + Job())
    private var captureJob: Job? = null
    private var statusBroadcastJob: Job? = null

    // Phần cứng: Khóa nguồn & Khóa Wi-Fi chống tắt ngầm của ColorOS
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    // MediaProjection & VirtualDisplay
    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    // Kích thước & Cấu hình màn hình
    private var screenWidth = 1080
    private var screenHeight = 2412
    private var screenDensity = 400
    private var currentQuality = 60 // 20 - 80%

    // Trạng thái stream
    @Volatile
    private var isStreamingPaused = false

    // WebSocket Socket.IO Client
    private var socket: Socket? = null
    private var serverUrl = "http://192.168.1.5:3000"
    private var secretPin = "123456"
    private val gson = Gson()

    // Battery Monitor
    private var currentBattery = 100
    private var isCharging = false

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.let {
                val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                if (level >= 0 && scale > 0) {
                    currentBattery = (level * 100) / scale
                }
                val status = it.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
            }
        }
    }

    // Tự động hồi sinh luồng VirtualDisplay khi mở màn hình vật lý
    private val screenStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                    Log.i(TAG, ">>> Physical screen ON / User Present detected! Triggering stream recovery...")
                    serviceScope.launch {
                        delay(250) // Chờ hệ điều hành Android đánh thức Display Compositor
                        refreshStream()
                    }
                }
                Intent.ACTION_SCREEN_OFF -> {
                    Log.i(TAG, ">>> Physical screen OFF detected.")
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        acquireHardwareLocks()
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

        val screenFilter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenStateReceiver, screenFilter)

        Log.i(TAG, "CoreKeepAliveService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_STICKY

        when (intent.action) {
            ACTION_START -> {
                serverUrl = intent.getStringExtra(EXTRA_SERVER_URL) ?: serverUrl
                secretPin = intent.getStringExtra(EXTRA_SECRET_PIN) ?: secretPin
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val resultData = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_RESULT_DATA)
                }

                startForegroundNotification()

                if (resultCode != 0 && resultData != null && mediaProjection == null) {
                    setupMediaProjection(resultCode, resultData)
                }

                connectSocket()
                startFrameCaptureLoop()
                startStatusHeartbeat()
            }
            ACTION_STOP -> {
                stopSelf()
            }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopFrameCaptureLoop()
        disconnectSocket()
        releaseMediaProjection()
        releaseHardwareLocks()
        try {
            unregisterReceiver(batteryReceiver)
        } catch (_: Exception) {}
        try {
            unregisterReceiver(screenStateReceiver)
        } catch (_: Exception) {}
        instance = null
        isConnectedToSocket = false
        Log.i(TAG, "CoreKeepAliveService destroyed")
    }

    // =========================================================================
    // 1. DUAL HARDWARE LOCKS (CPU WAKELOCK + WIFI LOW LATENCY LOCK)
    // =========================================================================

    @SuppressLint("WakelockTimeout")
    private fun acquireHardwareLocks() {
        try {
            // 1. Khóa CPU giữ thức (PARTIAL_WAKE_LOCK)
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (pm != null && (wakeLock == null || !wakeLock!!.isHeld)) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OPPO:KeepAliveCpuLock").apply {
                    setReferenceCounted(false)
                    acquire()
                }
                Log.i(TAG, "CPU PARTIAL_WAKE_LOCK acquired successfully")
            }

            // 2. Khóa Wi-Fi ngăn ColorOS tự động sleep chip Wi-Fi
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wm != null && (wifiLock == null || !wifiLock!!.isHeld)) {
                val wifiMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                } else {
                    @Suppress("DEPRECATION")
                    WifiManager.WIFI_MODE_FULL_HIGH_PERF
                }
                wifiLock = wm.createWifiLock(wifiMode, "OPPO:KeepAliveWifiLock").apply {
                    setReferenceCounted(false)
                    acquire()
                }
                Log.i(TAG, "Wi-Fi Lock (Low Latency) acquired successfully")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire hardware locks", e)
        }
    }

    private fun releaseHardwareLocks() {
        try {
            wakeLock?.let {
                if (it.isHeld) it.release()
            }
            wakeLock = null

            wifiLock?.let {
                if (it.isHeld) it.release()
            }
            wifiLock = null
            Log.i(TAG, "Hardware locks released")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to release hardware locks", e)
        }
    }

    // =========================================================================
    // 2. FOREGROUND SERVICE NOTIFICATION (ANDROID 14+ STANDARD)
    // =========================================================================

    private fun startForegroundNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_desc)
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_stat_screen)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()

        val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        } else {
            0
        }

        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType)
        Log.i(TAG, "Foreground notification started with type: $serviceType")
    }

    // =========================================================================
    // 3. MEDIA PROJECTION & VIRTUAL DISPLAY
    // =========================================================================

    private fun setupMediaProjection(resultCode: Int, resultData: Intent) {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)

        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels
        screenDensity = metrics.densityDpi

        Log.i(TAG, "Device resolution: ${screenWidth}x$screenHeight, DPI: $screenDensity")

        val projectionCallback = object : MediaProjection.Callback() {
            override fun onStop() {
                super.onStop()
                Log.w(TAG, "MediaProjection was stopped by system")
            }
        }

        mediaProjection = mediaProjectionManager?.getMediaProjection(resultCode, resultData)
        mediaProjection?.registerCallback(projectionCallback, null)

        imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "OPPO_REMOTE_DISPLAY",
            screenWidth,
            screenHeight,
            screenDensity,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface,
            null,
            null
        )

        Log.i(TAG, "VirtualDisplay created successfully")
    }

    private fun releaseMediaProjection() {
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
            mediaProjection?.stop()
            mediaProjection = null
            Log.i(TAG, "MediaProjection resources cleaned")
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning MediaProjection", e)
        }
    }

    /**
     * Khắc phục hiện tượng đen màn hình khi bật lại màn hình vật lý:
     * Tái liên kết Surface của ImageReader và kích hoạt VirtualDisplay resize
     */
    fun refreshStream() {
        try {
            Log.i(TAG, ">>> [refreshStream] Re-linking ImageReader and triggering VirtualDisplay resize...")
            val oldReader = imageReader
            val newReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)
            virtualDisplay?.surface = newReader.surface
            imageReader = newReader
            oldReader?.close()

            virtualDisplay?.resize(screenWidth, screenHeight, screenDensity)

            // Khởi động lại vòng lặp capture nếu đang bị gián đoạn
            startFrameCaptureLoop()
            Log.i(TAG, ">>> [refreshStream] Stream refreshed and buffer active.")
        } catch (e: Exception) {
            Log.e(TAG, "Error during stream refresh", e)
        }
    }

    // =========================================================================
    // 4. KHUNG HÌNH STREAM & TỐI ƯU HÓA TIẾT KIỆM TÀI NGUYÊN
    // =========================================================================

    fun setStreamingPaused(paused: Boolean) {
        isStreamingPaused = paused
        Log.i(TAG, "Streaming paused changed to: $paused")
    }

    private fun startFrameCaptureLoop() {
        stopFrameCaptureLoop()
        captureJob = serviceScope.launch {
            Log.i(TAG, "Starting screen capture loop...")
            var lastFrameTime = 0L

            while (isActive) {
                // Nếu đang ở chế độ Smart Blackout hoặc Socket chưa kết nối, ngủ tiết kiệm pin
                if (isStreamingPaused || socket == null || socket?.connected() != true) {
                    delay(150)
                    continue
                }

                val now = System.currentTimeMillis()
                // Giới hạn FPS ở mức ~25 FPS (40ms/frame) để cân bằng mượt mà và nhiệt độ máy OPPO
                val elapsed = now - lastFrameTime
                if (elapsed < 35) {
                    delay(35 - elapsed)
                }

                val reader = imageReader ?: run {
                    delay(50)
                    return@launch
                }

                val image = try {
                    reader.acquireLatestImage()
                } catch (e: Exception) {
                    null
                }

                if (image != null) {
                    try {
                        val planes = image.planes
                        val buffer = planes[0].buffer
                        val pixelStride = planes[0].pixelStride
                        val rowStride = planes[0].rowStride
                        val rowPadding = rowStride - pixelStride * screenWidth

                        // Tạo Bitmap từ buffer
                        val bitmap = Bitmap.createBitmap(
                            screenWidth + rowPadding / pixelStride,
                            screenHeight,
                            Bitmap.Config.ARGB_8888
                        )
                        bitmap.copyPixelsFromBuffer(buffer)

                        val cleanBitmap = if (rowPadding == 0) {
                            bitmap
                        } else {
                            val cropped = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight)
                            bitmap.recycle()
                            cropped
                        }

                        // Nén ảnh sang JPEG
                        val stream = ByteArrayOutputStream()
                        cleanBitmap.compress(Bitmap.CompressFormat.JPEG, currentQuality, stream)
                        val jpegBytes = stream.toByteArray()
                        cleanBitmap.recycle()

                        // Gửi frame qua WebSocket dưới dạng Binary Buffer trực tiếp
                        socket?.emit("stream_frame", jpegBytes)
                        lastFrameTime = System.currentTimeMillis()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error encoding frame", e)
                    } finally {
                        image.close()
                    }
                } else {
                    delay(15)
                }
            }
        }
    }

    private fun stopFrameCaptureLoop() {
        captureJob?.cancel()
        captureJob = null
    }

    // =========================================================================
    // 5. WEBSOCKET SOCKET.IO & RECONNECT VÔ HẠN
    // =========================================================================

    private fun connectSocket() {
        disconnectSocket()

        try {
            val options = IO.Options().apply {
                reconnection = true
                reconnectionDelay = 1000
                reconnectionDelayMax = 5000
                timeout = 5000
                transports = arrayOf("websocket", "polling")
            }

            Log.i(TAG, "Connecting to Socket.IO server: $serverUrl")
            socket = IO.socket(serverUrl, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.i(TAG, ">>> [Socket Connected] Authenticating with PIN...")
                isConnectedToSocket = true

                // Gửi thông tin xác thực thiết bị
                val authPayload = DeviceAuthPayload(
                    pin = secretPin,
                    model = "${Build.MANUFACTURER.uppercase()} ${Build.MODEL}",
                    androidVersion = "Android ${Build.VERSION.RELEASE} (ColorOS)",
                    width = screenWidth,
                    height = screenHeight,
                    battery = currentBattery,
                    isCharging = isCharging,
                    isBlackout = RemoteAccessibilityService.instance?.isBlackoutActive ?: false,
                    quality = currentQuality,
                    fps = 25
                )

                val json = JSONObject(gson.toJson(authPayload))
                socket?.emit("auth_device", json)
            }

            socket?.on("auth_result") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val success = obj?.optBoolean("success") ?: false
                    Log.i(TAG, "Authentication result from server: $success")
                }
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.w(TAG, "<<< [Socket Disconnected]")
                isConnectedToSocket = false
            }

            // Nhận lệnh TOUCH_TAP từ Web
            socket?.on("TOUCH_TAP") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val x = obj?.optDouble("x", 0.0)?.toFloat() ?: 0f
                    val y = obj?.optDouble("y", 0.0)?.toFloat() ?: 0f
                    Log.d(TAG, "Dispatching TOUCH_TAP ($x, $y)")
                    RemoteAccessibilityService.instance?.performTap(x, y)
                }
            }

            // Nhận lệnh TOUCH_SWIPE từ Web
            socket?.on("TOUCH_SWIPE") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val startX = obj?.optDouble("startX", 0.0)?.toFloat() ?: 0f
                    val startY = obj?.optDouble("startY", 0.0)?.toFloat() ?: 0f
                    val endX = obj?.optDouble("endX", 0.0)?.toFloat() ?: 0f
                    val endY = obj?.optDouble("endY", 0.0)?.toFloat() ?: 0f
                    val duration = obj?.optLong("duration", 300L) ?: 300L
                    Log.d(TAG, "Dispatching TOUCH_SWIPE ($startX, $startY) -> ($endX, $endY)")
                    RemoteAccessibilityService.instance?.performSwipe(startX, startY, endX, endY, duration)
                }
            }

            // Nhận lệnh cuộn chuột mượt (TOUCH_SCROLL)
            socket?.on("TOUCH_SCROLL") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val direction = obj?.optString("direction", "DOWN") ?: "DOWN"
                    val x = obj?.optDouble("x", screenWidth / 2.0)?.toFloat() ?: (screenWidth / 2f)
                    val y = obj?.optDouble("y", screenHeight / 2.0)?.toFloat() ?: (screenHeight / 2f)
                    Log.d(TAG, "Dispatching TOUCH_SCROLL $direction at ($x, $y)")
                    RemoteAccessibilityService.instance?.performScroll(direction, x, y)
                }
            }

            // Nhận lệnh nhập chữ bàn phím PC (INPUT_TEXT)
            socket?.on("INPUT_TEXT") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val text = obj?.optString("text", "") ?: ""
                    val mode = obj?.optString("mode", "append") ?: "append"
                    if (text.isNotEmpty()) {
                        Log.d(TAG, "Dispatching INPUT_TEXT ($mode): $text")
                        RemoteAccessibilityService.instance?.inputText(text, mode)
                    }
                }
            }

            // Đồng bộ dữ liệu Clipboard từ PC sang điện thoại (SET_CLIPBOARD)
            socket?.on("SET_CLIPBOARD") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val text = obj?.optString("text", "") ?: ""
                    if (text.isNotEmpty()) {
                        Log.d(TAG, "Dispatching SET_CLIPBOARD: $text")
                        RemoteAccessibilityService.instance?.setClipboardText(text)
                    }
                }
            }

            // Nhận lệnh đồng bộ lại luồng màn hình (RESET_STREAM) khi vừa bật lại màn hình
            socket?.on("RESET_STREAM") {
                Log.i(TAG, ">>> Received RESET_STREAM command from dashboard")
                refreshStream()
            }

            // Nhận phím điều hướng hệ thống
            socket?.on("KEY_EVENT") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val action = obj?.optString("action", "") ?: ""
                    handleKeyEvent(action)
                }
            }

            // Nhận chế độ nguồn / Màn hình (POWER_MODE)
            socket?.on("POWER_MODE") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val mode = obj?.optString("mode", "") ?: ""
                    handlePowerMode(mode)
                }
            }

            // Nhận lệnh Tự động mở khóa (AUTO_UNLOCK)
            socket?.on("AUTO_UNLOCK") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val pin = obj?.optString("pin", null)
                    Log.i(TAG, "Executing AUTO_UNLOCK with PIN: ${if (pin != null) "******" else "None"}")
                    RemoteAccessibilityService.instance?.performAutoUnlock(pin)
                }
            }

            // Cập nhật chất lượng ảnh (SET_QUALITY)
            socket?.on("SET_QUALITY") { args ->
                if (args.isNotEmpty()) {
                    val obj = args[0] as? JSONObject
                    val quality = obj?.optInt("quality", 60) ?: 60
                    currentQuality = quality.coerceIn(10, 95)
                    Log.i(TAG, "Quality updated to: $currentQuality%")
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Socket.IO client", e)
        }
    }

    private fun disconnectSocket() {
        try {
            socket?.disconnect()
            socket?.off()
            socket = null
            isConnectedToSocket = false
        } catch (e: Exception) {
            Log.e(TAG, "Error disconnecting socket", e)
        }
    }

    private fun handleKeyEvent(action: String) {
        when (action.uppercase()) {
            "VOLUME_UP" -> {
                val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                am?.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
            }
            "VOLUME_DOWN" -> {
                val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                am?.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
            }
            else -> {
                RemoteAccessibilityService.instance?.performGlobal(action)
            }
        }
    }

    private fun handlePowerMode(mode: String) {
        when (mode.uppercase()) {
            "SCREEN_OFF_SMART" -> {
                RemoteAccessibilityService.instance?.showSmartBlackout()
            }
            "SCREEN_ON_SMART" -> {
                RemoteAccessibilityService.instance?.hideSmartBlackout()
            }
            "HARDWARE_WAKE" -> {
                RemoteAccessibilityService.instance?.wakePhysicalScreen()
            }
            else -> Log.w(TAG, "Unknown power mode: $mode")
        }
    }

    private fun startStatusHeartbeat() {
        statusBroadcastJob?.cancel()
        statusBroadcastJob = serviceScope.launch {
            while (isActive) {
                delay(10000) // Mỗi 10 giây gửi Heartbeat & Battery status
                if (socket?.connected() == true) {
                    val update = DeviceStatusUpdate(
                        battery = currentBattery,
                        isCharging = isCharging,
                        isBlackout = RemoteAccessibilityService.instance?.isBlackoutActive ?: false,
                        fps = if (isStreamingPaused) 0 else 25
                    )
                    val json = JSONObject(gson.toJson(update))
                    socket?.emit("device_status_update", json)
                }
            }
        }
    }
}
