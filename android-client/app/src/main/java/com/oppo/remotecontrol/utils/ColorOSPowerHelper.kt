package com.oppo.remotecontrol.utils

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Trợ thủ tối ưu hóa nguồn và chống đóng băng ứng dụng chuyên dụng cho OPPO ColorOS
 */
object ColorOSPowerHelper {

    private const val TAG = "ColorOSPowerHelper"

    /**
     * Kiểm tra ứng dụng đã được miễn trừ tối ưu hóa pin chưa
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Yêu cầu người dùng miễn trừ tối ưu hóa pin trực tiếp
     */
    @SuppressLint("BatteryLife")
    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (!isIgnoringBatteryOptimizations(context)) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.w(TAG, "Standard battery optimization intent failed, falling back to general settings", e)
                try {
                    val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallbackIntent)
                } catch (ex: Exception) {
                    Log.e(TAG, "Cannot open battery settings", ex)
                }
            }
        }
    }

    /**
     * Mở màn hình quản lý tự khởi chạy của OPPO ColorOS (Startup Manager / Auto-launch)
     */
    fun openColorOSAutoLaunchSettings(context: Context): Boolean {
        val oppoIntents = listOf(
            // ColorOS 11 / 12 / 13 / 14 Auto Start & Background Management
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.oppoguardelf", "com.coloros.powermanager.fuelga设置ge.PowerUsageModelActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.sysfloatview.FloatSysViewActivity"))
        )

        for (intent in oppoIntents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.i(TAG, "Opened ColorOS AutoLaunch settings via ${intent.component?.className}")
                return true
            } catch (e: Exception) {
                // Thử intent tiếp theo nếu phiên bản ColorOS khác
            }
        }
        return false
    }

    /**
     * Mở cài đặt Dịch vụ Trợ năng
     */
    fun openAccessibilitySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open accessibility settings", e)
        }
    }
}
