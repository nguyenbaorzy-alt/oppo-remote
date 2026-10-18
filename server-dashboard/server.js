const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

// Hàm tự động phát hiện địa chỉ IP Wi-Fi nội bộ
function getLocalLanIp() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    } catch (e) {}
    return '192.168.30.102';
}

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
const ADMIN_USER = process.env.ADMIN_USER || 'baovy123';
const ADMIN_PASS = process.env.ADMIN_PASS || 'baovy123';

// Phục vụ giao diện Web Dashboard
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Quản lý đa thiết bị (Hỗ trợ đồng thời OPPO, Meizu 21 Pro, v.v.)
const connectedDevices = new Map(); // socket.id -> { socket, state }
let activeDeviceId = null;
const dashboardSockets = new Set();

function getActiveDevice() {
    if (activeDeviceId && connectedDevices.has(activeDeviceId)) {
        return connectedDevices.get(activeDeviceId);
    }
    // Fallback sang thiết bị đầu tiên nếu có
    const firstEntry = connectedDevices.entries().next().value;
    if (firstEntry) {
        activeDeviceId = firstEntry[0];
        return firstEntry[1];
    }
    return null;
}

function broadcastDeviceList() {
    const list = [];
    for (const [id, dev] of connectedDevices.entries()) {
        list.push({
            id: id,
            model: dev.state.model,
            androidVersion: dev.state.androidVersion,
            width: dev.state.width,
            height: dev.state.height,
            battery: dev.state.battery,
            isCharging: dev.state.isCharging,
            isActive: id === activeDeviceId
        });
    }

    const activeDev = getActiveDevice();
    for (const dash of dashboardSockets) {
        dash.emit('device_list', {
            devices: list,
            activeDeviceId: activeDeviceId,
            currentDeviceState: activeDev ? activeDev.state : { online: false }
        });
    }
}

// API kiểm tra trạng thái hệ thống
app.get('/api/status', (req, res) => {
    const activeDev = getActiveDevice();
    res.json({
        status: 'online',
        deviceCount: connectedDevices.size,
        activeDevice: activeDev ? activeDev.state : null,
        connectedDashboards: dashboardSockets.size,
        uptime: process.uptime()
    });
});

// API cung cấp thông tin mạng Wi-Fi nội bộ
app.get('/api/network-info', (req, res) => {
    const lanIp = getLocalLanIp();
    res.json({
        lanIp: lanIp,
        lanUrl: `http://${lanIp}:${PORT}`,
        port: PORT,
        isLocal: req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname === lanIp
    });
});

io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id} from ${socket.handshake.address}`);

    // Gửi ngay thông tin Wi-Fi nội bộ cho Client
    const lanIp = getLocalLanIp();
    socket.emit('network_info', {
        lanIp: lanIp,
        lanUrl: `http://${lanIp}:${PORT}`,
        port: PORT
    });

    let clientType = 'unknown'; // 'device' | 'dashboard'
    let isAuthenticated = false;

    // 1. XÁC THỰC THIẾT BỊ ANDROID (OPPO, MEIZU 21 PRO, V.V.)
    socket.on('auth_device', (data) => {
        const pin = data && data.pin ? String(data.pin).trim() : '';
        if (pin === SECRET_PIN) {
            clientType = 'device';
            isAuthenticated = true;

            const devState = {
                online: true,
                model: data.model || 'Android Device',
                androidVersion: data.androidVersion || 'Android 14+',
                width: data.width || 1080,
                height: data.height || 2412,
                battery: data.battery !== undefined ? data.battery : 100,
                isCharging: Boolean(data.isCharging),
                isBlackout: Boolean(data.isBlackout),
                quality: data.quality || 60,
                fps: data.fps || 0,
                lastSeen: Date.now()
            };

            connectedDevices.set(socket.id, {
                socket: socket,
                state: devState
            });

            // Tự động chọn làm active device nếu chưa có hoặc là thiết bị duy nhất
            if (!activeDeviceId || !connectedDevices.has(activeDeviceId) || connectedDevices.size === 1) {
                activeDeviceId = socket.id;
                console.log(`>>> [Active Device Assigned] Set activeDeviceId to: ${activeDeviceId} (${devState.model})`);
            }

            socket.emit('auth_result', { success: true, message: 'Device Authenticated Successfully' });
            console.log(`>>> [Android Device Connected] Model: ${devState.model} (${devState.width}x${devState.height}) - Total Devices: ${connectedDevices.size}`);

            broadcastDeviceList();
        } else {
            console.warn(`[Device Auth Failed] Wrong PIN from ${socket.id}`);
            socket.emit('auth_result', { success: false, message: 'Invalid SECRET_PIN' });
            socket.disconnect(true);
        }
    });

    // 2. XÁC THỰC WEB DASHBOARD (Tài khoản & Mật khẩu chống phá web)
    socket.on('auth_dashboard', (data) => {
        const username = data && data.username ? String(data.username).trim() : '';
        const password = data && data.password ? String(data.password).trim() : '';
        const pin = data && data.pin ? String(data.pin).trim() : '';

        // Xác thực bằng tài khoản/mật khẩu quản trị hoặc mã PIN bí mật
        const isAuth = (username === ADMIN_USER && password === ADMIN_PASS) || 
                       (!username && pin === SECRET_PIN);

        if (isAuth) {
            clientType = 'dashboard';
            isAuthenticated = true;
            dashboardSockets.add(socket);

            socket.emit('auth_result', { 
                success: true, 
                message: 'Đăng nhập thành công',
                username: ADMIN_USER 
            });
            console.log(`[Dashboard Authenticated] User: "${username || 'PIN'}" from ${socket.handshake.address} - Total Dashboards: ${dashboardSockets.size}`);

            // Gửi ngay danh sách thiết bị hiện tại về dashboard
            broadcastDeviceList();
        } else {
            console.warn(`[Dashboard Auth Failed] Invalid login: user="${username}" from ${socket.handshake.address}`);
            socket.emit('auth_result', { 
                success: false, 
                message: 'Sai tên tài khoản hoặc mật khẩu! Vui lòng thử lại.' 
            });
        }
    });

    // 2.1 ĐĂNG XUẤT DASHBOARD
    socket.on('logout_dashboard', () => {
        if (clientType === 'dashboard') {
            dashboardSockets.delete(socket);
            isAuthenticated = false;
            clientType = 'unknown';
            console.log(`[Dashboard Logged Out] Socket ${socket.id}`);
            socket.emit('logout_result', { success: true });
        }
    });

    // 3. CHỌN THIẾT BỊ ĐIỀU KHIỂN TỪ WEB (OPPO HOẶC MEIZU 21 PRO)
    socket.on('SELECT_DEVICE', (data) => {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        const targetId = data && data.deviceId;
        if (targetId && connectedDevices.has(targetId)) {
            activeDeviceId = targetId;
            console.log(`[Dashboard Switched Device] Active Device ID: ${activeDeviceId}`);
            broadcastDeviceList();
        }
    });

    // 4. CHUYỂN TIẾP LUỒNG KHUNG HÌNH (TỪ ACTIVE DEVICE -> WEB DASHBOARDS)
    socket.on('stream_frame', (frameData) => {
        if (!isAuthenticated || clientType !== 'device') return;
        
        if (!activeDeviceId || !connectedDevices.has(activeDeviceId)) {
            activeDeviceId = socket.id;
        }

        // Relay hình ảnh từ thiết bị active hoặc khi có 1 thiết bị kết nối
        if (socket.id === activeDeviceId || connectedDevices.size === 1) {
            const dev = connectedDevices.get(socket.id);
            if (dev) dev.state.lastSeen = Date.now();

            if (dashboardSockets.size > 0) {
                for (const dashSocket of dashboardSockets) {
                    dashSocket.emit('stream_frame', frameData);
                }
            }
        }
    });

    // 5. CẬP NHẬT TRẠNG THÁI THIẾT BỊ (PIN, SẠC, FPS)
    socket.on('device_status_update', (data) => {
        if (!isAuthenticated || clientType !== 'device') return;
        const dev = connectedDevices.get(socket.id);
        if (dev) {
            dev.state = {
                ...dev.state,
                ...data,
                online: true,
                lastSeen: Date.now()
            };

            if (socket.id === activeDeviceId) {
                for (const dashSocket of dashboardSockets) {
                    dashSocket.emit('device_status', dev.state);
                }
            }
        }
    });

    socket.on('orientation_changed', (data) => {
        if (!isAuthenticated || clientType !== 'device') return;
        console.log(`>>> [Orientation Changed] Device ${socket.id} -> ${data.width}x${data.height} (Landscape: ${data.isLandscape})`);
        if (socket.id === activeDeviceId) {
            const dev = connectedDevices.get(socket.id);
            if (dev) {
                dev.state.width = data.width;
                dev.state.height = data.height;
                dev.state.isLandscape = Boolean(data.isLandscape);
            }
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('device_orientation', data);
            }
        }
    });

    // 6. CHUYỂN TIẾP LỆNH ĐIỀU KHIỂN TỪ WEB XUỐNG THIẾT BỊ ĐANG CHỌN
    function forwardToActiveDevice(event, data) {
        if (!isAuthenticated || clientType !== 'dashboard') return;
        const activeDev = getActiveDevice();
        if (activeDev && activeDev.socket.connected) {
            activeDev.socket.emit(event, data);
        }
    }

    socket.on('TOUCH_TAP', (data) => forwardToActiveDevice('TOUCH_TAP', data));
    socket.on('TOUCH_DOWN', (data) => forwardToActiveDevice('TOUCH_DOWN', data));
    socket.on('TOUCH_MOVE', (data) => forwardToActiveDevice('TOUCH_MOVE', data));
    socket.on('TOUCH_UP', (data) => forwardToActiveDevice('TOUCH_UP', data));
    socket.on('TOUCH_SWIPE', (data) => forwardToActiveDevice('TOUCH_SWIPE', data));
    socket.on('TOUCH_SCROLL', (data) => forwardToActiveDevice('TOUCH_SCROLL', data));
    socket.on('KEY_EVENT', (data) => forwardToActiveDevice('KEY_EVENT', data));
    socket.on('INPUT_TEXT', (data) => forwardToActiveDevice('INPUT_TEXT', data));
    socket.on('SET_CLIPBOARD', (data) => forwardToActiveDevice('SET_CLIPBOARD', data));
    socket.on('RESET_STREAM', (data) => forwardToActiveDevice('RESET_STREAM', data));
    socket.on('TOGGLE_ORIENTATION', (data) => {
        console.log(`[Dashboard Command] TOGGLE_ORIENTATION requested`);
        forwardToActiveDevice('TOGGLE_ORIENTATION', data);
    });
    
    socket.on('POWER_MODE', (data) => {
        const activeDev = getActiveDevice();
        if (activeDev && activeDev.socket.connected) {
            console.log(`[Command] POWER_MODE on ${activeDev.state.model}: ${JSON.stringify(data)}`);
            if (data.mode === 'SCREEN_OFF_SMART') {
                activeDev.state.isBlackout = true;
            } else if (data.mode === 'SCREEN_ON_SMART') {
                activeDev.state.isBlackout = false;
            }
            activeDev.socket.emit('POWER_MODE', data);
            for (const dashSocket of dashboardSockets) {
                dashSocket.emit('device_status', activeDev.state);
            }
        }
    });

    socket.on('AUTO_UNLOCK', (data) => forwardToActiveDevice('AUTO_UNLOCK', data));
    socket.on('SET_QUALITY', (data) => {
        const activeDev = getActiveDevice();
        if (activeDev && activeDev.socket.connected) {
            const quality = Math.max(10, Math.min(100, parseInt(data.quality) || 60));
            activeDev.state.quality = quality;
            activeDev.socket.emit('SET_QUALITY', { quality });
        }
    });

    // Đo độ trễ Ping/Pong
    socket.on('client_ping', (timestamp) => {
        socket.emit('client_pong', timestamp);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        if (clientType === 'device') {
            console.log(`<<< [Device Disconnected] ID: ${socket.id}`);
            connectedDevices.delete(socket.id);
            if (activeDeviceId === socket.id) {
                const nextDev = getActiveDevice();
                activeDeviceId = nextDev ? nextDev.socket.id : null;
            }
            broadcastDeviceList();
        } else if (clientType === 'dashboard') {
            dashboardSockets.delete(socket);
            console.log(`[Dashboard Disconnected] Remaining: ${dashboardSockets.size}`);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================================');
    console.log(`🚀 Remote Control Multi-Device Relay Server running on:`);
    console.log(`   Local IPv4:   http://127.0.0.1:${PORT}`);
    console.log(`   Local IPv6:   http://[::1]:${PORT}`);
    console.log(`   Network IPv4: http://192.168.30.102:${PORT}`);
    console.log(`   Security PIN: ${SECRET_PIN}`);
    console.log('========================================================');
});
