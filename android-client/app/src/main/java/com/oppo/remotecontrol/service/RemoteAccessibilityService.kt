package com.oppo.remotecontrol.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Dịch vụ Trợ năng thực thi thao tác chạm/vuốt, điều hướng hệ thống,
 * và quản lý chế độ Ngủ đông giả lập (AMOLED Blackout) trên OPPO ColorOS.
 */
class RemoteAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "RemoteAccessibility"

        @Volatile
        var instance: RemoteAccessibilityService? = null
            private set

        val isServiceRunning: Boolean
            get() = instance != null
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var blackoutOverlayView: View? = null
    var isBlackoutActive: Boolean = false
        private set

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        Log.i(TAG, ">>> RemoteAccessibilityService connected successfully")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Có thể mở rộng để theo dõi các sự kiện đổi cửa sổ nếu cần
    }

    override fun onInterrupt() {
        Log.w(TAG, "RemoteAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        hideSmartBlackout()
        instance = null
        Log.i(TAG, "RemoteAccessibilityService destroyed")
    }

    // =========================================================================
    // 1. THAO TÁC CẢM ỨNG (TOUCH TAP & SWIPE)
    // =========================================================================

    /**
     * Thực hiện chạm đơn tại tọa độ (x, y) trong thời gian 50ms
     */
    fun performTap(x: Float, y: Float, onComplete: ((Boolean) -> Unit)? = null) {
        val path = Path().apply {
            moveTo(x, y)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "performTap succeeded at ($x, $y)")
                onComplete?.invoke(true)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "performTap cancelled at ($x, $y)")
                onComplete?.invoke(false)
            }
        }, null)
    }

    /**
     * Thực hiện vuốt theo quỹ đạo từ (startX, startY) đến (endX, endY)
     */
    fun performSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        duration: Long = 300L,
        onComplete: ((Boolean) -> Unit)? = null
    ) {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, duration.coerceIn(50L, 1000L))
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                Log.d(TAG, "performSwipe succeeded from ($startX, $startY) to ($endX, $endY)")
                onComplete?.invoke(true)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                Log.w(TAG, "performSwipe cancelled")
                onComplete?.invoke(false)
            }
        }, null)
    }

    /**
     * Thực hiện cuộn mượt (Scroll Wheel) theo hướng UP hoặc DOWN
     */
    fun performScroll(direction: String, x: Float, y: Float) {
        val metrics = resources.displayMetrics
        val width = metrics.widthPixels.toFloat()
        val height = metrics.heightPixels.toFloat()

        // Cố định vị trí cuộn ở trục giữa màn hình để thao tác lướt trang / TikTok tự nhiên nhất
        val scrollX = if (x > 50f && x < width - 50f) x else (width / 2f)
        val startY: Float
        val endY: Float

        if (direction.uppercase() == "DOWN") {
            // Cuộn xuống (ngón tay vuốt từ dưới lên trên để nội dung trôi xuống)
            startY = height * 0.70f
            endY = height * 0.28f
        } else {
            // Cuộn lên (ngón tay vuốt từ trên xuống dưới)
            startY = height * 0.28f
            endY = height * 0.70f
        }

        Log.d(TAG, "performScroll $direction: ($scrollX, $startY) -> ($scrollX, $endY)")
        performSwipe(scrollX, startY, scrollX, endY, 140L)
    }

    /**
     * Nhập văn bản hoặc dán clipboard vào ô đang focus trên điện thoại
     */
    fun inputText(text: String, mode: String = "append"): Boolean {
        mainHandler.post {
            try {
                val root = rootInActiveWindow
                val focusedNode = root?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                    ?: root?.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)

                if (focusedNode != null) {
                    when (mode) {
                        "set" -> {
                            val args = Bundle().apply {
                                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                            }
                            val ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                            Log.d(TAG, "inputText (set): $text -> result: $ok")
                        }
                        "paste" -> {
                            setClipboardText(text)
                            val ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                            Log.d(TAG, "inputText (paste): $text -> result: $ok")
                        }
                        else -> { // "append"
                            val current = focusedNode.text?.toString() ?: ""
                            val combined = current + text
                            val args = Bundle().apply {
                                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, combined)
                            }
                            var ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                            if (!ok) {
                                // Nếu không hỗ trợ set_text, thử qua clipboard paste
                                setClipboardText(text)
                                ok = focusedNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                            }
                            Log.d(TAG, "inputText (append): $text -> result: $ok")
                        }
                    }
                } else {
                    // Không tìm thấy ô focus, lưu vào clipboard để người dùng dán thủ công
                    setClipboardText(text)
                    Log.i(TAG, "No focused input found. Text saved to clipboard: $text")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in inputText", e)
            }
        }
        return true
    }

    /**
     * Xóa 1 ký tự cuối (Backspace) tại ô input đang focus
     */
    fun deleteLastChar(): Boolean {
        mainHandler.post {
            try {
                val root = rootInActiveWindow ?: return@post
                val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return@post
                val current = focused.text?.toString() ?: ""
                if (current.isNotEmpty()) {
                    val remaining = current.substring(0, current.length - 1)
                    val args = Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, remaining)
                    }
                    focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    Log.d(TAG, "deleteLastChar executed, remaining length: ${remaining.length}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in deleteLastChar", e)
            }
        }
        return true
    }

    /**
     * Nhấn Enter hoặc xuống dòng tại ô input đang focus
     */
    fun handleEnterKey(): Boolean {
        mainHandler.post {
            try {
                val root = rootInActiveWindow ?: return@post
                val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return@post
                val current = focused.text?.toString() ?: ""
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "$current\n")
                }
                focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                Log.d(TAG, "handleEnterKey executed")
            } catch (e: Exception) {
                Log.e(TAG, "Error in handleEnterKey", e)
            }
        }
        return true
    }

    /**
     * Đồng bộ văn bản vào khay nhớ tạm (Clipboard) của điện thoại
     */
    fun setClipboardText(text: String) {
        mainHandler.post {
            try {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                if (clipboard != null) {
                    val clip = ClipData.newPlainText("OPPORemote", text)
                    clipboard.setPrimaryClip(clip)
                    Log.i(TAG, "Successfully copied to phone clipboard: $text")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to copy to clipboard", e)
            }
        }
    }

    /**
     * Thực hiện phím hệ thống toàn cục
     */
    fun performGlobal(action: String) {
        when (action.uppercase()) {
            "BACK" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "HOME" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "RECENTS" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "LOCK" -> performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            "NOTIFICATIONS" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            "QUICK_SETTINGS" -> performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
            "BACKSPACE" -> deleteLastChar()
            "ENTER" -> handleEnterKey()
            else -> Log.w(TAG, "Unknown global action: $action")
        }
    }

    // =========================================================================
    // 2. GIẢI PHÁP TẮT/BẬT MÀN HÌNH BẤT TỬ (AMOLED BLACKOUT MODE)
    // =========================================================================

    /**
     * Bật chế độ Tắt màn hình Ngủ Đông Giả Lập:
     * - Phủ một View đen tuyệt đối (#000000) toàn màn hình bằng TYPE_ACCESSIBILITY_OVERLAY
     * - Hạ screenBrightness = 0.001f (tối hoàn toàn trên màn hình OLED)
     * - Báo CoreKeepAliveService tạm dừng luồng capture frame để tiết kiệm 100% tài nguyên
     * - Android và ColorOS vẫn xem màn hình là ACTIVE -> MediaProjection KHÔNG BAO GIỜ BỊ HỦY!
     */
    fun showSmartBlackout() {
        mainHandler.post {
            if (isBlackoutActive || blackoutOverlayView != null) return@post
            val wm = windowManager ?: return@post

            val layoutParams = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                        WindowManager.LayoutParams.FLAG_FULLSCREEN or
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                screenBrightness = 0.001f // Hạ độ sáng phần cứng mức tối thiểu
            }

            val overlay = View(this).apply {
                setBackgroundColor(Color.BLACK)
                // Chặn mọi chạm vô tình lên màn hình vật lý khi đang tắt
                isClickable = true
                isFocusable = false
            }

            try {
                wm.addView(overlay, layoutParams)
                blackoutOverlayView = overlay
                isBlackoutActive = true

                // Tạm dừng capture frame trên CoreKeepAliveService
                CoreKeepAliveService.instance?.setStreamingPaused(true)
                Log.i(TAG, ">>> [Smart Blackout ON] Screen is fully black & brightness minimized.")
            } catch (e: Exception) {
                Log.e(TAG, "Error enabling Smart Blackout overlay", e)
            }
        }
    }

    /**
     * Bật lại màn hình từ chế độ Blackout:
     * - Gỡ bỏ lớp phủ đen
     * - Phục hồi độ sáng bình thường
     * - Tiếp tục truyền stream tức thì trong 0.1s
     */
    fun hideSmartBlackout() {
        mainHandler.post {
            if (!isBlackoutActive && blackoutOverlayView == null) return@post
            val wm = windowManager ?: return@post

            try {
                blackoutOverlayView?.let {
                    wm.removeViewImmediate(it)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error removing blackout overlay", e)
            } finally {
                blackoutOverlayView = null
                isBlackoutActive = false
                CoreKeepAliveService.instance?.setStreamingPaused(false)
                Log.i(TAG, ">>> [Smart Blackout OFF] Screen restored to normal state.")
            }
        }
    }

    // =========================================================================
    // 3. ĐÁNH THỨC PHẦN CỨNG & TỰ ĐỘNG MỞ KHÓA (HARDWARE WAKE & AUTO-UNLOCK)
    // =========================================================================

    /**
     * Đánh thức màn hình khi máy bị bấm khóa thật bằng nút nguồn vật lý
     */
    fun wakePhysicalScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (pm != null && !pm.isInteractive) {
                @Suppress("DEPRECATION")
                val wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                            PowerManager.ACQUIRE_CAUSES_WAKEUP or
                            PowerManager.ON_AFTER_RELEASE,
                    "OPPO:HardwareWakeLock"
                )
                wakeLock.acquire(3000)
                wakeLock.release()
                Log.i(TAG, "Physical screen awakened via SCREEN_BRIGHT_WAKE_LOCK")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to wake physical screen", e)
        }
    }

    /**
     * Đánh thức màn hình, vuốt mở khóa và tự động nhập PIN (nếu có)
     */
    fun performAutoUnlock(pin: String?) {
        wakePhysicalScreen()

        // Lấy kích thước màn hình thực tế
        val metrics = resources.displayMetrics
        val width = metrics.widthPixels.toFloat()
        val height = metrics.heightPixels.toFloat()

        // Bước 1: Chờ 600ms để màn hình sáng lên hoàn toàn, sau đó vuốt từ dưới lên để hiển thị bàn phím mã PIN
        mainHandler.postDelayed({
            val startX = width / 2f
            val startY = height * 0.82f
            val endX = width / 2f
            val endY = height * 0.22f

            Log.i(TAG, "AutoUnlock: Swiping up from ($startX, $startY) to ($endX, $endY)")
            performSwipe(startX, startY, endX, endY, 300) { success ->
                if (success && !pin.isNullOrEmpty()) {
                    // Bước 2: Chờ 500ms cho bàn phím số xuất hiện, sau đó tự động nhập các số trong PIN
                    mainHandler.postDelayed({
                        enterPinDigits(pin, width, height)
                    }, 500)
                }
            }
        }, 600)
    }

    /**
     * Tự động nhập dãy số PIN mở khóa màn hình
     */
    private fun enterPinDigits(pin: String, screenWidth: Float, screenHeight: Float) {
        var delay = 0L
        for (char in pin) {
            if (char.isDigit()) {
                mainHandler.postDelayed({
                    val clicked = tryClickNodeForDigit(char.toString())
                    if (!clicked) {
                        // Nếu không tìm thấy AccessibilityNode, fallback vào tọa độ bàn phím số tiêu chuẩn
                        tapKeypadCoordinate(char, screenWidth, screenHeight)
                    }
                }, delay)
                delay += 250L // Cách nhau 250ms giữa mỗi số
            }
        }
    }

    /**
     * Tìm kiếm View bàn phím số qua cây AccessibilityNode
     */
    private fun tryClickNodeForDigit(digit: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(digit)
        if (!nodes.isNullOrEmpty()) {
            for (node in nodes) {
                if (node.text?.toString() == digit || node.contentDescription?.toString() == digit) {
                    val clicked = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    if (clicked) {
                        Log.d(TAG, "Clicked node for digit $digit")
                        return true
                    }
                }
            }
        }
        return false
    }

    /**
     * Tọa độ fallback cho bàn phím số 3x4 tiêu chuẩn của Android/ColorOS
     */
    private fun tapKeypadCoordinate(digit: Char, width: Float, height: Float) {
        val col1 = width * 0.25f
        val col2 = width * 0.50f
        val col3 = width * 0.75f

        val startRowY = height * 0.55f
        val rowSpacing = height * 0.09f

        val row1 = startRowY
        val row2 = startRowY + rowSpacing
        val row3 = startRowY + rowSpacing * 2
        val row4 = startRowY + rowSpacing * 3

        val (tapX, tapY) = when (digit) {
            '1' -> Pair(col1, row1)
            '2' -> Pair(col2, row1)
            '3' -> Pair(col3, row1)
            '4' -> Pair(col1, row2)
            '5' -> Pair(col2, row2)
            '6' -> Pair(col3, row2)
            '7' -> Pair(col1, row3)
            '8' -> Pair(col2, row3)
            '9' -> Pair(col3, row3)
            '0' -> Pair(col2, row4)
            else -> Pair(col2, row4)
        }

        Log.d(TAG, "Tapping fallback coordinate for '$digit' at ($tapX, $tapY)")
        performTap(tapX, tapY)
    }
}
