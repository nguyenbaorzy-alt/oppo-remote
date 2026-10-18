package com.oppo.remotecontrol.model

import com.google.gson.annotations.SerializedName

/**
 * Các mô hình dữ liệu (Payloads) trao đổi giữa Android Client và Web Dashboard
 */

data class DeviceAuthPayload(
    @SerializedName("pin") val pin: String,
    @SerializedName("model") val model: String,
    @SerializedName("androidVersion") val androidVersion: String,
    @SerializedName("width") val width: Int,
    @SerializedName("height") val height: Int,
    @SerializedName("battery") val battery: Int,
    @SerializedName("isCharging") val isCharging: Boolean,
    @SerializedName("isBlackout") val isBlackout: Boolean,
    @SerializedName("quality") val quality: Int,
    @SerializedName("fps") val fps: Int
)

data class DeviceStatusUpdate(
    @SerializedName("battery") val battery: Int,
    @SerializedName("isCharging") val isCharging: Boolean,
    @SerializedName("isBlackout") val isBlackout: Boolean,
    @SerializedName("fps") val fps: Int
)

data class TouchTapPayload(
    @SerializedName("x") val x: Int,
    @SerializedName("y") val y: Int
)

data class TouchSwipePayload(
    @SerializedName("startX") val startX: Int,
    @SerializedName("startY") val startY: Int,
    @SerializedName("endX") val endX: Int,
    @SerializedName("endY") val endY: Int,
    @SerializedName("duration") val duration: Long = 300L
)

data class KeyEventPayload(
    @SerializedName("action") val action: String // BACK | HOME | RECENTS | LOCK | VOLUME_UP | VOLUME_DOWN
)

data class PowerModePayload(
    @SerializedName("mode") val mode: String // SCREEN_OFF_SMART | SCREEN_ON_SMART | HARDWARE_WAKE
)

data class AutoUnlockPayload(
    @SerializedName("pin") val pin: String?
)

data class SetQualityPayload(
    @SerializedName("quality") val quality: Int
)
