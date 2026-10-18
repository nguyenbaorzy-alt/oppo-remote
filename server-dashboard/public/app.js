/**
 * OPPO Remote Control System - ColorOS Specialized Dashboard
 * High-performance WebSocket & Canvas Rendering Controller
 */

// State Management
let socket = null;
let isAuthenticated = false;
let phoneResolution = { width: 1080, height: 2412 };
let isDeviceOnline = false;
let isBlackoutActive = false;

// Telemetry & Metrics
let frameCount = 0;
let bytesReceived = 0;
let lastMetricsUpdate = performance.now();
let currentFps = 0;

// Mouse Interaction State
let isMouseDown = false;
let mouseDownTime = 0;
let startCoords = { x: 0, y: 0, visualX: 0, visualY: 0 };

// DOM Elements
const canvas = document.getElementById('screenCanvas');
const ctx = canvas.getContext('2d');
const screenViewport = document.getElementById('screenViewport');
const touchRipple = document.getElementById('touchRipple');
const swipeSvg = document.getElementById('swipePathSvg');
const screenOverlay = document.getElementById('screenOverlay');
const blackoutIndicator = document.getElementById('blackoutIndicator');

// Status Chips
const deviceStatusChip = document.getElementById('deviceStatusChip');
const deviceStatusText = document.getElementById('deviceStatusText');
const pulseDot = deviceStatusChip.querySelector('.pulse-dot');
const batteryText = document.getElementById('batteryText');
const batteryIcon = document.getElementById('batteryIcon');
const fpsCounter = document.getElementById('fpsCounter');
const pingCounter = document.getElementById('pingCounter');

// Telemetry
const dataRateCounter = document.getElementById('dataRateCounter');
const resTelemetry = document.getElementById('resTelemetry');
const deviceModelTelemetry = document.getElementById('deviceModelTelemetry');
const androidVerTelemetry = document.getElementById('androidVerTelemetry');
const resolutionText = document.getElementById('resolutionText');
const coordinateText = document.getElementById('coordinateText');

// Quality
const qualityRange = document.getElementById('qualityRange');
const qualityValText = document.getElementById('qualityValText');

// PIN inputs
const authPinInput = document.getElementById('authPinInput');
const btnConnectDashboard = document.getElementById('btnConnectDashboard');
const phoneUnlockPin = document.getElementById('phoneUnlockPin');

// Buttons
const btnScreenOffSmart = document.getElementById('btnScreenOffSmart');
const btnScreenOnSmart = document.getElementById('btnScreenOnSmart');
const btnWakeFromBlackout = document.getElementById('btnWakeFromBlackout');
const btnAutoUnlock = document.getElementById('btnAutoUnlock');

// Navigation Keys
const btnKeyBack = document.getElementById('btnKeyBack');
const btnKeyHome = document.getElementById('btnKeyHome');
const btnKeyRecents = document.getElementById('btnKeyRecents');
const btnKeyLock = document.getElementById('btnKeyLock');
const btnVolUp = document.getElementById('btnVolUp');
const btnVolDown = document.getElementById('btnVolDown');
const btnPhoneBack = document.getElementById('btnPhoneBack');
const btnPhoneHome = document.getElementById('btnPhoneHome');
const btnPhoneRecents = document.getElementById('btnPhoneRecents');

// Keyboard, Clipboard & Stream Recovery Controls
const pcTextInput = document.getElementById('pcTextInput');
const btnSendText = document.getElementById('btnSendText');
const btnPasteClipboard = document.getElementById('btnPasteClipboard');
const btnClearInput = document.getElementById('btnClearInput');
const btnResetStream = document.getElementById('btnResetStream');

// Initialize Canvas resolution
canvas.width = phoneResolution.width;
canvas.height = phoneResolution.height;

/**
 * Socket.IO Initialization & Handlers
 */
function initSocket() {
    socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected to Relay Server. Authenticating...');
        authenticate();
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Disconnected from Relay Server');
        updateOnlineStatus(false);
        screenOverlay.classList.remove('hidden');
    });

    socket.on('auth_result', (result) => {
        if (result.success) {
            console.log('[Auth] Dashboard authenticated successfully');
            isAuthenticated = true;
            screenOverlay.classList.add('hidden');
        } else {
            console.error('[Auth] Authentication failed:', result.message);
            alert('Lỗi xác thực: ' + (result.message || 'Mã PIN không đúng'));
            screenOverlay.classList.remove('hidden');
        }
    });

    const deviceSelectDropdown = document.getElementById('deviceSelectDropdown');

    deviceSelectDropdown.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId && socket && isAuthenticated) {
            console.log(`[Dashboard] Switching to device: ${selectedId}`);
            socket.emit('SELECT_DEVICE', { deviceId: selectedId });
        }
    });

    // Danh sách nhiều thiết bị đồng thời (OPPO, Meizu 21 Pro...)
    socket.on('device_list', (data) => {
        if (!data) return;
        const { devices, activeDeviceId, currentDeviceState } = data;

        deviceSelectDropdown.innerHTML = '';
        if (!devices || devices.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Chờ thiết bị...';
            deviceSelectDropdown.appendChild(opt);
            updateOnlineStatus(false);
            return;
        }

        devices.forEach((dev) => {
            const opt = document.createElement('option');
            opt.value = dev.id;
            opt.textContent = `📱 ${dev.model} (${dev.battery}%)`;
            if (dev.id === activeDeviceId) {
                opt.selected = true;
            }
            deviceSelectDropdown.appendChild(opt);
        });

        if (currentDeviceState) {
            applyDeviceState(currentDeviceState);
        }
    });

    function applyDeviceState(data) {
        updateOnlineStatus(Boolean(data.online));

        if (data.width && data.height) {
            phoneResolution.width = data.width;
            phoneResolution.height = data.height;
            canvas.width = data.width;
            canvas.height = data.height;
            resolutionText.textContent = `Độ phân giải: ${data.width} x ${data.height}`;
            resTelemetry.textContent = `${data.width}x${data.height}`;
        }

        if (data.model) {
            deviceModelTelemetry.textContent = data.model;
        }

        if (data.androidVersion) {
            androidVerTelemetry.textContent = data.androidVersion;
        }

        if (data.battery !== undefined) {
            updateBattery(data.battery, data.isCharging);
        }

        setBlackoutState(Boolean(data.isBlackout));
    }

    // Cập nhật trạng thái thiết bị từ Android
    socket.on('device_status', (data) => {
        if (!data) return;
        applyDeviceState(data);
    });

    // Nhận khung hình nén từ thiết bị
    const renderImage = new Image();
    let isImageLoading = false;

    renderImage.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(renderImage, 0, 0, canvas.width, canvas.height);
        isImageLoading = false;
        frameCount++;
    };

    socket.on('stream_frame', (frameData) => {
        if (!frameData) return;

        // Tính toán lưu lượng dữ liệu (bytes)
        let frameSize = 0;
        let imageSrc = '';

        if (typeof frameData === 'string') {
            imageSrc = frameData.startsWith('data:image') ? frameData : `data:image/jpeg;base64,${frameData}`;
            frameSize = frameData.length;
        } else if (frameData instanceof ArrayBuffer || ArrayBuffer.isView(frameData)) {
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            imageSrc = URL.createObjectURL(blob);
            frameSize = blob.size;
        }

        bytesReceived += frameSize;

        if (!isImageLoading) {
            isImageLoading = true;
            renderImage.src = imageSrc;
        }
    });

    // Đo độ trễ
    setInterval(() => {
        if (socket && socket.connected && isAuthenticated) {
            const startTime = performance.now();
            socket.emit('client_ping', startTime);
        }
    }, 3000);

    socket.on('client_pong', (startTime) => {
        const rtt = Math.round(performance.now() - startTime);
        pingCounter.textContent = `${rtt} ms`;
    });
}

function authenticate() {
    const pin = (authPinInput.value || '123456').trim();
    if (socket && socket.connected) {
        socket.emit('auth_dashboard', { pin });
    }
}

function drawPlaceholder() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText('📱 ĐANG CHỜ KẾT NỐI', canvas.width / 2, canvas.height / 2 - 160);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '32px sans-serif';
    ctx.fillText('1. Mở App trên OPPO / Meizu', canvas.width / 2, canvas.height / 2 - 80);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '32px sans-serif';
    ctx.fillText('2. Nhập chính xác ô Server URL:', canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('http://192.168.30.102:3000', canvas.width / 2, canvas.height / 2 + 50);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '32px sans-serif';
    ctx.fillText('Mã PIN: 123456', canvas.width / 2, canvas.height / 2 + 120);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '28px sans-serif';
    ctx.fillText('3. Nhấn "Ghi Màn Hình & Bắt Đầu"', canvas.width / 2, canvas.height / 2 + 180);
}

function updateOnlineStatus(online) {
    isDeviceOnline = online;
    if (online) {
        pulseDot.className = 'pulse-dot online';
        deviceStatusText.textContent = 'Thiết bị Đang Hoạt Động';
        deviceStatusText.style.color = 'var(--color-emerald)';
        screenOverlay.classList.add('hidden');
    } else {
        pulseDot.className = 'pulse-dot offline';
        deviceStatusText.textContent = 'Thiết bị Chưa Kết Nối';
        deviceStatusText.style.color = 'var(--color-danger)';
        fpsCounter.textContent = '0 FPS';
        dataRateCounter.textContent = '0 KB/s';
        drawPlaceholder();
    }
}

function updateBattery(level, isCharging) {
    batteryText.textContent = `${level}%`;
    if (isCharging) {
        batteryIcon.className = 'fa-solid fa-bolt-lightning text-emerald';
    } else if (level > 75) {
        batteryIcon.className = 'fa-solid fa-battery-full text-emerald';
    } else if (level > 40) {
        batteryIcon.className = 'fa-solid fa-battery-three-quarters text-cyan';
    } else if (level > 15) {
        batteryIcon.className = 'fa-solid fa-battery-quarter text-warning';
    } else {
        batteryIcon.className = 'fa-solid fa-battery-empty text-danger';
    }
}

function setBlackoutState(active) {
    isBlackoutActive = active;
    if (active) {
        blackoutIndicator.classList.remove('hidden');
    } else {
        blackoutIndicator.classList.add('hidden');
    }
}

/**
 * FPS & Network Telemetry Calculation Loop
 */
setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastMetricsUpdate) / 1000;
    if (elapsed >= 1) {
        currentFps = Math.round(frameCount / elapsed);
        const kbps = Math.round((bytesReceived / 1024) / elapsed);

        fpsCounter.textContent = `${currentFps} FPS`;
        dataRateCounter.textContent = `${kbps} KB/s`;

        frameCount = 0;
        bytesReceived = 0;
        lastMetricsUpdate = now;
    }
}, 1000);

/**
 * Calculate Device Coordinate Mapping
 */
function getDeviceCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    const scaleX = phoneResolution.width / rect.width;
    const scaleY = phoneResolution.height / rect.height;

    const x = Math.max(0, Math.min(phoneResolution.width, Math.round(clientX * scaleX)));
    const y = Math.max(0, Math.min(phoneResolution.height, Math.round(clientY * scaleY)));

    return { x, y, visualX: clientX, visualY: clientY };
}

/**
 * Touch / Mouse Event Handlers on Canvas
 */
screenViewport.addEventListener('mousedown', (e) => {
    if (!isDeviceOnline || isBlackoutActive) return;
    isMouseDown = true;
    mouseDownTime = performance.now();
    startCoords = getDeviceCoordinates(e);

    // Hiển thị hiệu ứng chạm trực quan
    showTouchRipple(startCoords.visualX, startCoords.visualY);
});

screenViewport.addEventListener('mousemove', (e) => {
    const coords = getDeviceCoordinates(e);
    coordinateText.textContent = `Tọa độ: (${coords.x}, ${coords.y})`;

    if (isMouseDown) {
        drawSwipeTrail(startCoords.visualX, startCoords.visualY, coords.visualX, coords.visualY);
    }
});

window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    clearSwipeTrail();

    const endCoords = getDeviceCoordinates(e);
    const duration = Math.round(performance.now() - mouseDownTime);
    const dist = Math.hypot(endCoords.x - startCoords.x, endCoords.y - startCoords.y);

    if (dist < 15 && duration < 300) {
        // Single Tap
        console.log(`[Touch Tap] (${startCoords.x}, ${startCoords.y})`);
        sendTouchTap(startCoords.x, startCoords.y);
    } else {
        // Swipe / Drag: Độ dài và thời gian vuốt thích ứng siêu nhạy
        const swipeDuration = Math.round(Math.min(480, Math.max(90, dist * 0.28 + duration * 0.35)));
        console.log(`[Touch Swipe] from (${startCoords.x}, ${startCoords.y}) to (${endCoords.x}, ${endCoords.y}) in ${swipeDuration}ms`);
        sendTouchSwipe(startCoords.x, startCoords.y, endCoords.x, endCoords.y, swipeDuration);
    }
});

// 1. TÍNH NĂNG CUỘN CHUỘT MÁY TÍNH (MOUSE WHEEL SCROLLING)
let wheelThrottleTime = 0;
screenViewport.addEventListener('wheel', (e) => {
    if (!isDeviceOnline || isBlackoutActive) return;
    e.preventDefault();

    const now = performance.now();
    if (now - wheelThrottleTime < 120) return; // Chống spam làm chậm hệ thống
    wheelThrottleTime = now;

    const coords = getDeviceCoordinates(e);
    const direction = e.deltaY > 0 ? 'DOWN' : 'UP';
    console.log(`[Mouse Wheel] Scroll ${direction} at (${coords.x}, ${coords.y})`);

    if (socket && isAuthenticated) {
        socket.emit('TOUCH_SCROLL', { direction, x: coords.x, y: coords.y });
    }
    showScrollFeedback(coords.visualX, coords.visualY, direction);
}, { passive: false });

// 2. TÍNH NĂNG GÕ BÀN PHÍM MÁY TÍNH TRỰC TIẾP TRÊN MÀN HÌNH ĐIỆN THOẠI
screenViewport.addEventListener('keydown', (e) => {
    if (!isDeviceOnline || isBlackoutActive) return;

    // Ctrl+V hoặc Cmd+V -> Dán Clipboard từ PC vào điện thoại
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteClipboardToPhone();
        return;
    }

    // Backspace -> Xóa ký tự
    if (e.key === 'Backspace') {
        e.preventDefault();
        sendKeyEvent('BACKSPACE');
        showInputToast('⌫ Xóa ký tự');
        return;
    }

    // Enter -> Xuống dòng hoặc gửi tin nhắn
    if (e.key === 'Enter') {
        e.preventDefault();
        sendKeyEvent('ENTER');
        showInputToast('⏎ Enter');
        return;
    }

    // Tab -> Bỏ qua mặc định trình duyệt
    if (e.key === 'Tab') {
        e.preventDefault();
        return;
    }

    // Ký tự thông thường (chữ cái, chữ số, dấu câu)
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        sendInputText(e.key, 'append');
        showInputToast(`⌨ ${e.key}`);
    }
});

function showTouchRipple(x, y) {
    touchRipple.style.left = `${x}px`;
    touchRipple.style.top = `${y}px`;
    touchRipple.classList.remove('active');
    void touchRipple.offsetWidth; // Trigger reflow
    touchRipple.classList.add('active');
    setTimeout(() => {
        touchRipple.classList.remove('active');
    }, 280);
}

let toastTimeout = null;
function showInputToast(message) {
    let toastEl = document.getElementById('inputHudToast');
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'inputHudToast';
        toastEl.className = 'input-hud-toast';
        screenViewport.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.remove('visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('visible');
    }, 1200);
}

function showScrollFeedback(visualX, visualY, direction) {
    const indicator = document.createElement('div');
    indicator.className = `scroll-feedback-icon ${direction.toLowerCase()}`;
    indicator.style.left = `${visualX}px`;
    indicator.style.top = `${visualY}px`;
    indicator.innerHTML = direction === 'DOWN' ? '<i class="fa-solid fa-arrow-down"></i>' : '<i class="fa-solid fa-arrow-up"></i>';
    screenViewport.appendChild(indicator);
    setTimeout(() => {
        indicator.remove();
    }, 400);
}

function drawSwipeTrail(x1, y1, x2, y2) {
    swipeSvg.innerHTML = `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
              stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-dasharray="6 4" opacity="0.8" />
        <circle cx="${x2}" cy="${y2}" r="6" fill="#10b981" />
    `;
}

function clearSwipeTrail() {
    swipeSvg.innerHTML = '';
}

/**
 * Command Dispatchers
 */
function sendTouchTap(x, y) {
    if (socket && isAuthenticated) {
        socket.emit('TOUCH_TAP', { x, y });
    }
}

function sendTouchSwipe(startX, startY, endX, endY, duration) {
    if (socket && isAuthenticated) {
        socket.emit('TOUCH_SWIPE', { startX, startY, endX, endY, duration });
    }
}

function sendInputText(text, mode = 'append') {
    if (socket && isAuthenticated) {
        socket.emit('INPUT_TEXT', { text, mode });
    }
}

function sendKeyEvent(action) {
    if (socket && isAuthenticated) {
        console.log(`[Key Event] ${action}`);
        socket.emit('KEY_EVENT', { action });
    }
}

function sendPowerMode(mode) {
    if (socket && isAuthenticated) {
        console.log(`[Power Mode] ${mode}`);
        socket.emit('POWER_MODE', { mode });
    }
}

function sendAutoUnlock() {
    const pin = (phoneUnlockPin.value || '').trim();
    if (socket && isAuthenticated) {
        console.log(`[Auto Unlock] Triggered with PIN: ${pin ? '******' : 'None'}`);
        socket.emit('AUTO_UNLOCK', { pin });
    }
}

/**
 * Attach Event Listeners to Buttons
 */
btnConnectDashboard.addEventListener('click', authenticate);
authPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authenticate();
});

// Power Modes
btnScreenOffSmart.addEventListener('click', () => sendPowerMode('SCREEN_OFF_SMART'));
btnScreenOnSmart.addEventListener('click', () => sendPowerMode('SCREEN_ON_SMART'));
btnWakeFromBlackout.addEventListener('click', () => sendPowerMode('SCREEN_ON_SMART'));
btnAutoUnlock.addEventListener('click', sendAutoUnlock);

// Navigation Keys
btnKeyBack.addEventListener('click', () => sendKeyEvent('BACK'));
btnKeyHome.addEventListener('click', () => sendKeyEvent('HOME'));
btnKeyRecents.addEventListener('click', () => sendKeyEvent('RECENTS'));
btnKeyLock.addEventListener('click', () => sendKeyEvent('LOCK'));
btnVolUp.addEventListener('click', () => sendKeyEvent('VOLUME_UP'));
btnVolDown.addEventListener('click', () => sendKeyEvent('VOLUME_DOWN'));

// Phone Bezel Hardware Keys
btnPhoneBack.addEventListener('click', () => sendKeyEvent('BACK'));
btnPhoneHome.addEventListener('click', () => sendKeyEvent('HOME'));
btnPhoneRecents.addEventListener('click', () => sendKeyEvent('RECENTS'));

// Keyboard & Clipboard Actions
function sendTextFromInput() {
    if (!pcTextInput) return;
    const text = pcTextInput.value;
    if (text.length > 0) {
        sendInputText(text, 'append');
        showInputToast(`📤 Đã gửi: "${text.substring(0, 16)}..."`);
        pcTextInput.value = '';
    }
}

if (btnSendText) {
    btnSendText.addEventListener('click', sendTextFromInput);
}

if (pcTextInput) {
    pcTextInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendTextFromInput();
        }
    });
}

function pasteClipboardToPhone() {
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then((text) => {
            if (text) {
                if (socket && isAuthenticated) {
                    socket.emit('SET_CLIPBOARD', { text });
                    socket.emit('INPUT_TEXT', { text, mode: 'paste' });
                }
                showInputToast(`📋 Đã dán: "${text.substring(0, 20)}..."`);
            } else {
                showInputToast('⚠️ Khay nhớ tạm PC đang trống');
            }
        }).catch((err) => {
            console.warn('Clipboard read error:', err);
            showInputToast('⚠️ Cần cấp quyền Clipboard trình duyệt');
        });
    } else {
        showInputToast('⚠️ Trình duyệt không hỗ trợ đọc clipboard');
    }
}

if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener('click', pasteClipboardToPhone);
}

if (btnClearInput) {
    btnClearInput.addEventListener('click', () => {
        if (pcTextInput) pcTextInput.value = '';
        showInputToast('🧹 Đã xóa ô nhập');
    });
}

// Reset Stream / Screen Sync Handler
if (btnResetStream) {
    btnResetStream.addEventListener('click', () => {
        if (socket && isAuthenticated) {
            console.log('[Dashboard] Requesting Stream Reset & Sync...');
            socket.emit('RESET_STREAM');
            isImageLoading = false;
            showInputToast('🔄 Đang đồng bộ lại màn hình...');
        }
    });
}

// Quality Slider
qualityRange.addEventListener('input', (e) => {
    const val = e.target.value;
    qualityValText.textContent = `${val}%`;
    if (socket && isAuthenticated) {
        socket.emit('SET_QUALITY', { quality: parseInt(val) });
    }
});

// Prevent context menu on phone canvas
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Start Socket.IO
initSocket();
drawPlaceholder();
