const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Cấu hình Socket.IO với các thông số tối ưu truyền tải hình ảnh độ trễ thấp
const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 1e7, // 10MB cho phép frame ảnh chất lượng cao
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;
const SECRET_PIN = process.env.SECRET_PIN || '123456';

// Phục vụ giao diện Web Dashboard
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API kiểm tra trạng thái hệ thống
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        deviceConnected: currentDeviceSocket !== null,
        deviceInfo: deviceState,
        connectedDashboards: dashboardSockets.size,
        uptime: process.uptime()
    });
});

// Quản lý kết nối
let currentDeviceSocket = null;
const dashboardSockets = new Set();
let deviceState = {
    online: false,
    model: 'OPPO Device',
    androidVersion: 'Android 14/15 (ColorOS)',
    width: 1080,
    height: 2412,
    battery: 100,
    isCharging: false,
    isBlackout: false,
    quality: 60,
    fps: 0,
    lastSeen: 0
};

io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id} from ${socket.handshake.address}`);

    let clientType = 'unknown'; // 'device' | 'dashboard'
    let isAuthenticated = false;

    // 1. XÁC THỰC THIẾT BỊ ANDROID (OPPO)
    socket.on('auth_device', (data) => {
        const pin = data && data.pin ? String(data.pin).trim() : '';
        if (pin === SECRET_PIN) {
            clientType = 'device';
            isAuthenticated = true;
            currentDeviceSocket = socket;

            deviceState = {
                online: true,
                model: data.model || 'OPPO Device',
                androidVersion: data.androidVersion || 'Android 14+ (ColorOS)',
                width: data.width || 1080,
                height: data.height || 2412,
                battery: data.battery !== undefined ? data.battery : 100,
                isCharging: Boolean(data.isCharging),
                isBlackout: Boolean(data.isBlackout),
                quality: data.quality || 60,
                fps: data.fps || 0,
                lastSeen: Date.now()
            };

            socket.emit('auth_result', { success: true, message: 'Device Authenticated Successfully' });
            console.log(`>>> [OPPO Device Connected & Authenticated] Model: ${deviceState.model} (${deviceState.width}x${deviceState.height})`);

            // Báo cho tất cả Dashboard đang mở biết thiết bị đã Online
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('device_status', deviceState);
            }
        } else {
            console.warn(`[Device Auth Failed] Wrong PIN from ${socket.id}`);
            socket.emit('auth_result', { success: false, message: 'Invalid SECRET_PIN' });
            socket.disconnect(true);
        }
    });

    // 2. XÁC THỰC WEB DASHBOARD
    socket.on('auth_dashboard', (data) => {
        const pin = data && data.pin ? String(data.pin).trim() : '';
        if (pin === SECRET_PIN) {
            clientType = 'dashboard';
            isAuthenticated = true;
            dashboardSockets.add(socket);

            socket.emit('auth_result', { success: true, message: 'Dashboard Authenticated' });
            console.log(`[Dashboard Connected] Total Dashboards: ${dashboardSockets.size}`);

            // Gửi ngay trạng thái thiết bị hiện tại về dashboard
            socket.emit('device_status', deviceState);
        } else {
            console.warn(`[Dashboard Auth Failed] Wrong PIN: ${pin}`);
            socket.emit('auth_result', { success: false, message: 'Mã PIN bảo mật không đúng' });
        }
    });

    // 3. CHUYỂN TIẾP LUỒNG KHUNG HÌNH (ANDROID -> WEB DASHBOARD)
    socket.on('stream_frame', (frameData) => {
        if (!isAuthenticated || clientType !== 'device') return;
        deviceState.lastSeen = Date.now();

        // Chuyển tiếp ngay lập tức đến các dashboard đang xem
        if (dashboardSockets.size > 0) {
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('stream_frame', frameData);
            }
        }
    });

    // 4. CẬP NHẬT TRẠNG THÁI THIẾT BỊ (PIN, SẠC, FPS, ĐỘ PHÂN GIẢI)
    socket.on('device_status_update', (data) => {
        if (!isAuthenticated || clientType !== 'device') return;
        deviceState = {
            ...deviceState,
            ...data,
            online: true,
            lastSeen: Date.now()
        };

        for (const dashSocket of dashboardSockets) {
            dashSocket.emit('device_status', deviceState);
        }
    });

    // 5. CHUYỂN TIẾP CÁC LỆNH ĐIỀU KHIỂN TỪ WEB XUỐNG ANDROID
    // A. Chạm đơn (TOUCH_TAP)
    socket.on('TOUCH_TAP', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            currentDeviceSocket.emit('TOUCH_TAP', data);
        }
    });

    // B. Vuốt / Kéo (TOUCH_SWIPE)
    socket.on('TOUCH_SWIPE', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            currentDeviceSocket.emit('TOUCH_SWIPE', data);
        }
    });

    // C. Phím điều hướng hệ thống (KEY_EVENT)
    socket.on('KEY_EVENT', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            currentDeviceSocket.emit('KEY_EVENT', data);
        }
    });

    // D. Chế độ nguồn & Màn hình (POWER_MODE)
    // Các mode: SCREEN_OFF_SMART | SCREEN_ON_SMART | HARDWARE_WAKE
    socket.on('POWER_MODE', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            console.log(`[Command] POWER_MODE: ${JSON.stringify(data)}`);
            if (data.mode === 'SCREEN_OFF_SMART') {
                deviceState.isBlackout = true;
            } else if (data.mode === 'SCREEN_ON_SMART') {
                deviceState.isBlackout = false;
            }
            currentDeviceSocket.emit('POWER_MODE', data);

            // Đồng bộ trạng thái Blackout tới các dashboard khác
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('device_status', deviceState);
            }
        }
    });

    // E. Tự động mở khóa (AUTO_UNLOCK)
    socket.on('AUTO_UNLOCK', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            console.log(`[Command] AUTO_UNLOCK with PIN: ${data.pin ? '******' : 'None'}`);
            currentDeviceSocket.emit('AUTO_UNLOCK', data);
        }
    });

    // F. Điều chỉnh chất lượng ảnh nén (SET_QUALITY)
    socket.on('SET_QUALITY', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        if (currentDeviceSocket && currentDeviceSocket.connected) {
            const quality = Math.max(10, Math.min(100, parseInt(data.quality) || 60));
            deviceState.quality = quality;
            currentDeviceSocket.emit('SET_QUALITY', { quality });
        }
    });

    // Đo độ trễ Ping/Pong
    socket.on('client_ping', (timestamp) => {
        socket.emit('client_pong', timestamp);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        if (clientType === 'device' && socket === currentDeviceSocket) {
            console.log(`<<< [OPPO Device Disconnected]`);
            currentDeviceSocket = null;
            deviceState.online = false;
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('device_status', deviceState);
            }
        } else if (clientType === 'dashboard') {
            dashboardSockets.delete(socket);
            console.log(`[Dashboard Disconnected] Remaining: ${dashboardSockets.size}`);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================================');
    console.log(`🚀 OPPO Remote Control Relay Server running on:`);
    console.log(`   Local URL:    http://localhost:${PORT}`);
    console.log(`   Network URL:  http://0.0.0.0:${PORT}`);
    console.log(`   Security PIN: ${SECRET_PIN}`);
    console.log('========================================================');
});
