package com.oppo.remotecontrol

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.oppo.remotecontrol.databinding.ActivityMainBinding
import com.oppo.remotecontrol.service.CoreKeepAliveService
import com.oppo.remotecontrol.service.RemoteAccessibilityService
import com.oppo.remotecontrol.utils.ColorOSPowerHelper

/**
 * Màn hình Cài đặt & Quản lý Quyền Chống Tắt Ngầm ColorOS
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private lateinit var mediaProjectionManager: MediaProjectionManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private val screenCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            startKeepAliveService(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, "Bạn đã từ chối quyền quay màn hình!", Toast.LENGTH_SHORT).show()
        }
    }

    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) {
            Toast.makeText(this, "Cần cấp quyền thông báo để dịch vụ không bị ColorOS dừng", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences("oppo_remote_prefs", Context.MODE_PRIVATE)
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        loadSavedSettings()
        setupListeners()
        requestNotificationPermissionIfNeeded()
    }

    override fun onResume() {
        super.onResume()
        refreshPermissionStates()
    }

    private fun loadSavedSettings() {
        val savedUrl = prefs.getString("server_url", "http://192.168.1.5:3000")
        val savedPin = prefs.getString("secret_pin", "123456")
        binding.etServerUrl.setText(savedUrl)
        binding.etSecretPin.setText(savedPin)
    }

    private fun saveCurrentSettings() {
        val url = binding.etServerUrl.text.toString().trim()
        val pin = binding.etSecretPin.text.toString().trim()
        prefs.edit()
            .putString("server_url", url)
            .putString("secret_pin", pin)
            .apply()
    }

    private fun setupListeners() {
        // Nút 1: Bỏ qua tối ưu hóa pin
        binding.btnIgnoreBattery.setOnClickListener {
            ColorOSPowerHelper.requestIgnoreBatteryOptimizations(this)
            // Thử mở thêm trang tự khởi chạy riêng của ColorOS nếu có
            ColorOSPowerHelper.openColorOSAutoLaunchSettings(this)
        }

        // Nút 2: Mở cài đặt Dịch vụ Trợ năng
        binding.btnOpenAccessibility.setOnClickListener {
            ColorOSPowerHelper.openAccessibilitySettings(this)
        }

        // Nút 3: Cấp quyền Ghi màn hình & Khởi chạy Service
        binding.btnStartProjection.setOnClickListener {
            saveCurrentSettings()

            if (!RemoteAccessibilityService.isServiceRunning) {
                Toast.makeText(this, "Vui lòng bật Dịch vụ Trợ năng (Bước 2) trước khi bắt đầu!", Toast.LENGTH_LONG).show()
                ColorOSPowerHelper.openAccessibilitySettings(this)
                return@setOnClickListener
            }

            // Mở hộp thoại xin quyền quay màn hình của hệ thống Android
            val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
            screenCaptureLauncher.launch(captureIntent)
        }

        // Nút Dừng Service
        binding.btnStopService.setOnClickListener {
            val stopIntent = Intent(this, CoreKeepAliveService::class.java).apply {
                action = CoreKeepAliveService.ACTION_STOP
            }
            startService(stopIntent)
            mainHandler.postDelayed({ refreshPermissionStates() }, 300)
            Toast.makeText(this, "Đã dừng dịch vụ điều khiển!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun startKeepAliveService(resultCode: Int, resultData: Intent) {
        val url = binding.etServerUrl.text.toString().trim()
        val pin = binding.etSecretPin.text.toString().trim()

        val serviceIntent = Intent(this, CoreKeepAliveService::class.java).apply {
            action = CoreKeepAliveService.ACTION_START
            putExtra(CoreKeepAliveService.EXTRA_RESULT_CODE, resultCode)
            putExtra(CoreKeepAliveService.EXTRA_RESULT_DATA, resultData)
            putExtra(CoreKeepAliveService.EXTRA_SERVER_URL, url)
            putExtra(CoreKeepAliveService.EXTRA_SECRET_PIN, pin)
        }

        ContextCompat.startForegroundService(this, serviceIntent)
        Toast.makeText(this, "Dịch vụ OPPO Remote đã kích hoạt thành công!", Toast.LENGTH_SHORT).show()
        mainHandler.postDelayed({ refreshPermissionStates() }, 500)
    }

    private fun refreshPermissionStates() {
        // 1. Trạng thái Tối ưu hóa Pin
        val isBatteryIgnored = ColorOSPowerHelper.isIgnoringBatteryOptimizations(this)
        if (isBatteryIgnored) {
            binding.tvBatteryStatus.text = "Đã cấp (Miễn trừ tối ưu hóa pin OK)"
            binding.tvBatteryStatus.setTextColor(ContextCompat.getColor(this, R.color.color_success))
            binding.btnIgnoreBattery.isEnabled = false
            binding.btnIgnoreBattery.text = "Đã Cấp"
        } else {
            binding.tvBatteryStatus.text = "Chưa cấp (Dễ bị ColorOS đóng băng)"
            binding.tvBatteryStatus.setTextColor(ContextCompat.getColor(this, R.color.color_warning))
            binding.btnIgnoreBattery.isEnabled = true
            binding.btnIgnoreBattery.text = "Cấp Quyền"
        }

        // 2. Trạng thái Dịch vụ Trợ năng
        val isAccessibilityEnabled = RemoteAccessibilityService.isServiceRunning
        if (isAccessibilityEnabled) {
            binding.tvAccessibilityStatus.text = "Đã bật (Sẵn sàng thực thi chạm/vuốt)"
            binding.tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.color_success))
            binding.btnOpenAccessibility.isEnabled = false
            binding.btnOpenAccessibility.text = "Đã Bật"
        } else {
            binding.tvAccessibilityStatus.text = "Chưa bật (Chưa thể chạm/vuốt từ xa)"
            binding.tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.color_danger))
            binding.btnOpenAccessibility.isEnabled = true
            binding.btnOpenAccessibility.text = "Bật Trợ Năng"
        }

        // 3. Trạng thái Dịch vụ CoreKeepAlive
        val isServiceRunning = CoreKeepAliveService.isServiceRunning
        val isSocketConnected = CoreKeepAliveService.isConnectedToSocket

        if (isServiceRunning) {
            binding.viewStatusDot.setBackgroundColor(
                ContextCompat.getColor(this, if (isSocketConnected) R.color.color_success else R.color.color_warning)
            )
            binding.tvServiceStatus.text = if (isSocketConnected) {
                "Đang chạy & Đã kết nối Web Dashboard"
            } else {
                "Đang chạy (Đang tìm kết nối đến Server Relay...)"
            }
            binding.btnStopService.visibility = View.VISIBLE
            binding.btnStartProjection.text = "Đang Chạy"
            binding.btnStartProjection.isEnabled = false
        } else {
            binding.viewStatusDot.setBackgroundColor(ContextCompat.getColor(this, R.color.color_danger))
            binding.tvServiceStatus.text = "Dịch vụ chưa chạy"
            binding.btnStopService.visibility = View.GONE
            binding.btnStartProjection.text = "Bắt Đầu"
            binding.btnStartProjection.isEnabled = true
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
