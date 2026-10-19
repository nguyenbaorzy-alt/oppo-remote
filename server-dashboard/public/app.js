/**
 * OPPO Remote Control System - ColorOS Specialized Dashboard
 * High-performance WebSocket & Canvas Rendering Controller
 */

// State Management
let socket = null;
let isAuthenticated = false;
let phoneResolution = { width: 1600, height: 720 };
let actualDeviceDisplay = { width: 1600, height: 720 };
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

// Login Gate DOM Elements
const loginGateModal = document.getElementById('loginGateModal');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const btnTogglePassword = document.getElementById('btnTogglePassword');
const eyeIcon = document.getElementById('eyeIcon');
const chkRememberLogin = document.getElementById('chkRememberLogin');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnLoginText = document.getElementById('btnLoginText');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const loginErrorText = document.getElementById('loginErrorText');
const userAuthChip = document.getElementById('userAuthChip');
const userAuthName = document.getElementById('userAuthName');

// Network Mode & QR Elements
let currentNetworkMode = localStorage.getItem('oppo_network_mode') || 'wifi';
let localLanUrl = 'http://192.168.30.102:3000';
let cloudServerUrl = 'https://testimony-destinations-prize-systematic.trycloudflare.com';

const tabModeWifi = document.getElementById('tabModeWifi');
const tabModeInternet = document.getElementById('tabModeInternet');
const wifiGateBox = document.getElementById('wifiGateBox');
const wifiGateUrlText = document.getElementById('wifiGateUrlText');
const btnGateCopyWifi = document.getElementById('btnGateCopyWifi');
const btnGateShowQr = document.getElementById('btnGateShowQr');
const wifiLanOverlayText = document.getElementById('wifiLanOverlayText');
const btnCopyOverlayWifi = document.getElementById('btnCopyOverlayWifi');
const btnShowQrOverlay = document.getElementById('btnShowQrOverlay');
const networkModeChip = document.getElementById('networkModeChip');
const networkModeIcon = document.getElementById('networkModeIcon');
const networkModeLabel = document.getElementById('networkModeLabel');
const qrModal = document.getElementById('qrModal');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrUrlDisplay = document.getElementById('qrUrlDisplay');
const btnCloseQrModal = document.getElementById('btnCloseQrModal');

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

const phoneChassis = document.getElementById('phoneChassis');
const renderImage = new Image();
let isImageLoading = false;
let imageLoadWatchdog = null;
let activeBlobUrl = null;

// Screen Sizing State
let currentScreenSize = 'large'; // 'normal' | 'large' | 'max' | 'custom'
let currentSizePx = 1150;
let isFrameless = false;
let isTheaterMode = false;

function applyOrientation(width, height, isLandscape) {
    phoneResolution.width = width;
    phoneResolution.height = height;
    actualDeviceDisplay.width = width;
    actualDeviceDisplay.height = height;
    canvas.width = width;
    canvas.height = height;

    if (screenViewport) {
        screenViewport.style.aspectRatio = `${width} / ${height}`;
    }

    const container = document.querySelector('.dashboard-container');
    const toolbar = document.getElementById('screenSizeToolbar');
    const quickGesturesBar = document.getElementById('quickGesturesBar');
    const footer = document.querySelector('.screen-info-footer');

    if (phoneChassis) {
        phoneChassis.style.aspectRatio = 'auto';
        if (isLandscape) {
            phoneChassis.classList.add('landscape');
            if (container) container.classList.add('is-landscape');
            
            let targetMaxW = '1150px';
            if (currentScreenSize === 'normal') targetMaxW = '850px';
            else if (currentScreenSize === 'large') targetMaxW = '1150px';
            else if (currentScreenSize === 'max') targetMaxW = '100%';
            else if (currentScreenSize === 'custom') targetMaxW = `${currentSizePx}px`;

            phoneChassis.style.maxWidth = targetMaxW;

            if (toolbar) toolbar.style.maxWidth = targetMaxW;
            if (quickGesturesBar) quickGesturesBar.style.maxWidth = targetMaxW;
            if (footer) footer.style.maxWidth = targetMaxW;
        } else {
            phoneChassis.classList.remove('landscape');
            if (container) container.classList.remove('is-landscape');
            
            let targetMaxW = '410px';
            if (currentScreenSize === 'large') targetMaxW = '480px';
            else if (currentScreenSize === 'max') targetMaxW = '560px';
            else if (currentScreenSize === 'custom') targetMaxW = `${Math.min(600, Math.round(currentSizePx * 0.45))}px`;

            phoneChassis.style.maxWidth = targetMaxW;

            if (toolbar) toolbar.style.maxWidth = targetMaxW;
            if (quickGesturesBar) quickGesturesBar.style.maxWidth = targetMaxW;
            if (footer) footer.style.maxWidth = targetMaxW;
        }
    }

    if (resolutionText) resolutionText.textContent = `Độ phân giải: ${width} x ${height} (${isLandscape ? 'Màn Hình Ngang' : 'Màn Hình Dọc'})`;
    if (resTelemetry) resTelemetry.textContent = `${width}x${height} ${isLandscape ? '🔄 Ngang' : '📱 Dọc'}`;
}

function updateScreenSize(mode, customPx) {
    currentScreenSize = mode;
    if (customPx) currentSizePx = customPx;
    
    const isLandscape = phoneResolution.width > phoneResolution.height;
    const btnNormal = document.getElementById('btnSizeNormal');
    const btnLarge = document.getElementById('btnSizeLarge');
    const btnMax = document.getElementById('btnSizeMax');
    const sizeRangeSlider = document.getElementById('sizeRangeSlider');
    const sizeValBadge = document.getElementById('sizeValBadge');

    [btnNormal, btnLarge, btnMax].forEach(btn => {
        if (btn) btn.classList.remove('active');
    });

    if (mode === 'normal') {
        currentSizePx = 850;
        if (btnNormal) btnNormal.classList.add('active');
    } else if (mode === 'large') {
        currentSizePx = 1150;
        if (btnLarge) btnLarge.classList.add('active');
    } else if (mode === 'max') {
        if (btnMax) btnMax.classList.add('active');
    }

    if (sizeRangeSlider && mode !== 'custom') sizeRangeSlider.value = currentSizePx;
    if (sizeValBadge) sizeValBadge.textContent = mode === 'max' ? '100%' : `${currentSizePx}px`;

    applyOrientation(phoneResolution.width, phoneResolution.height, isLandscape);
    showInputToast(`📐 Cỡ màn hình: ${mode === 'max' ? 'Cực Đại (100%)' : currentSizePx + 'px'}`);
}

function toggleOrientation() {
    const isCurrentlyLandscape = phoneResolution.width > phoneResolution.height;
    const newIsLandscape = !isCurrentlyLandscape;
    const minDim = Math.min(phoneResolution.width, phoneResolution.height);
    const maxDim = Math.max(phoneResolution.width, phoneResolution.height);
    const targetWidth = newIsLandscape ? maxDim : minDim;
    const targetHeight = newIsLandscape ? minDim : maxDim;

    console.log(`[Manual Toggle] Orientation -> ${targetWidth}x${targetHeight} (Landscape: ${newIsLandscape})`);
    applyOrientation(targetWidth, targetHeight, newIsLandscape);

    if (socket && isAuthenticated) {
        socket.emit('TOGGLE_ORIENTATION', { isLandscape: newIsLandscape, width: targetWidth, height: targetHeight });
    }
}

function applyDeviceState(data) {
    updateOnlineStatus(Boolean(data.online));

    if (data.width && data.height) {
        actualDeviceDisplay.width = data.width;
        actualDeviceDisplay.height = data.height;
        const isLandscape = Boolean(data.isLandscape !== undefined ? data.isLandscape : data.width > data.height);
        applyOrientation(data.width, data.height, isLandscape);
    }

    if (data.model && deviceModelTelemetry) {
        deviceModelTelemetry.textContent = data.model;
    }

    if (data.androidVersion && androidVerTelemetry) {
        androidVerTelemetry.textContent = data.androidVersion;
    }

    if (data.battery !== undefined) {
        updateBattery(data.battery, data.isCharging);
    }

    setBlackoutState(Boolean(data.isBlackout));
}

renderImage.onload = () => {
    clearTimeout(imageLoadWatchdog);

    // Tự động nhận diện hướng xoay màn hình từ khung hình JPEG thực tế
    const imgW = renderImage.naturalWidth;
    const imgH = renderImage.naturalHeight;
    if (imgW > 0 && imgH > 0) {
        const isFrameLandscape = imgW > imgH;
        if (canvas.width !== imgW || canvas.height !== imgH) {
            console.log(`[Auto-Detect Frame Orientation] ${imgW}x${imgH} (Landscape: ${isFrameLandscape})`);
            applyOrientation(imgW, imgH, isFrameLandscape);
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(renderImage, 0, 0, canvas.width, canvas.height);
    isImageLoading = false;
    frameCount++;
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
    }
};

renderImage.onerror = () => {
    clearTimeout(imageLoadWatchdog);
    console.warn('[Canvas] Error decoding frame, resetting render state');
    isImageLoading = false;
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
    }
};

function getRelayServerUrl() {
    // 1. Tự động dọn dẹp các IP máy tính cũ hoặc tunnel cũ trong localStorage nếu có
    try {
        const saved = localStorage.getItem('oppo_relay_server_url');
        if (saved && (saved.includes('192.168.') || saved.includes('trycloudflare.com') || saved.includes('localhost'))) {
            localStorage.removeItem('oppo_relay_server_url');
        }
    } catch (e) {}

    // 2. Nếu mở file HTML offline từ ổ cứng (file://)
    if (window.location.protocol === 'file:' || !window.location.host) {
        return 'http://localhost:3000';
    }

    // 3. Nếu chạy trên host tĩnh riêng (Netlify/Vercel)
    const isStaticHost = window.location.hostname.endsWith('netlify.app') || 
                         window.location.hostname.endsWith('vercel.app') || 
                         window.location.hostname.endsWith('github.io');

    if (isStaticHost) {
        const input = document.getElementById('serverUrlInput');
        if (input && input.value && input.value.trim() && !input.value.includes('192.168.')) {
            return input.value.trim().replace(/\/+$/, '');
        }
        return 'https://dieu-khien-tu-xa.onrender.com';
    }

    // 4. Đang chạy trực tiếp trên Render Cloud (hoặc bất kỳ server Node.js nào):
    // LUÔN LUÔN KẾT NỐI VÀO CHÍNH NÓ (window.location.origin)!
    // Hoạt động 100% trên cả Wi-Fi ở nhà, Wi-Fi lạ lẫn 4G ngoài đường!
    return window.location.origin;
}

/**
 * Socket.IO Initialization & Handlers
 */
function initSocket() {
    const serverUrl = getRelayServerUrl();
    console.log(`[Socket] Connecting to Relay Server: ${serverUrl}`);

    const serverLabel = document.getElementById('currentServerLabel');
    if (serverLabel) {
        try {
            const u = new URL(serverUrl);
            serverLabel.textContent = u.hostname;
        } catch {
            serverLabel.textContent = 'Server';
        }
    }

    const input = document.getElementById('serverUrlInput');
    if (input) {
        input.value = serverUrl;
    }

    if (socket) {
        try { socket.disconnect(); } catch {}
    }

    socket = io(serverUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected to Relay Server.');
        const savedUser = localStorage.getItem('oppo_auth_user');
        const savedPass = localStorage.getItem('oppo_auth_pass');

        if (savedUser && savedPass) {
            console.log('[Auth] Tự động đăng nhập với tài khoản đã lưu...');
            if (btnLoginSubmit) {
                btnLoginSubmit.disabled = true;
                if (btnLoginText) btnLoginText.textContent = 'Đang xác thực...';
            }
            socket.emit('auth_dashboard', { username: savedUser, password: savedPass });
        } else {
            console.log('[Auth] Chờ người dùng đăng nhập tài khoản / mật khẩu...');
            if (loginGateModal) loginGateModal.classList.remove('hidden');
            if (btnLoginSubmit) {
                btnLoginSubmit.disabled = false;
                if (btnLoginText) btnLoginText.textContent = 'ĐĂNG NHẬP HỆ THỐNG';
            }
        }
    });

    socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        if (btnLoginSubmit && !isAuthenticated) {
            btnLoginSubmit.disabled = false;
            if (btnLoginText) btnLoginText.textContent = 'ĐĂNG NHẬP HỆ THỐNG';
        }
        if (btnConnectDashboard && !isAuthenticated) {
            btnConnectDashboard.disabled = false;
            btnConnectDashboard.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Kết Nối Lại';
        }
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Disconnected from Relay Server');
        updateOnlineStatus(false);
        screenOverlay.classList.remove('hidden');
    });

    socket.on('auth_result', (result) => {
        if (btnLoginSubmit) {
            btnLoginSubmit.disabled = false;
            if (btnLoginText) btnLoginText.textContent = 'ĐĂNG NHẬP HỆ THỐNG';
        }
        if (btnConnectDashboard) {
            btnConnectDashboard.disabled = false;
            btnConnectDashboard.innerHTML = '<i class="fa-solid fa-key"></i> Kết Nối';
        }

        if (result.success) {
            console.log('[Auth] Đăng nhập thành công:', result.username || 'baovy123');
            isAuthenticated = true;

            // Ẩn modal đăng nhập
            if (loginGateModal) loginGateModal.classList.add('hidden');
            if (loginErrorMsg) loginErrorMsg.classList.add('hidden');

            const currentU = (loginUsername && loginUsername.value.trim()) || localStorage.getItem('oppo_auth_user') || 'baovy123';
            if (userAuthName) userAuthName.textContent = currentU;
            if (userAuthChip) userAuthChip.classList.remove('hidden');

            // Ghi nhớ đăng nhập nếu người dùng chọn
            if (chkRememberLogin && chkRememberLogin.checked) {
                const p = (loginPassword && loginPassword.value.trim()) || localStorage.getItem('oppo_auth_pass') || '';
                if (currentU && p) {
                    localStorage.setItem('oppo_auth_user', currentU);
                    localStorage.setItem('oppo_auth_pass', p);
                }
            }

            if (isDeviceOnline) {
                screenOverlay.classList.add('hidden');
            } else {
                const overlayDesc = document.getElementById('overlayDesc');
                if (overlayDesc) {
                    overlayDesc.innerHTML = `Đã xác thực tài khoản <strong>${currentU}</strong>.<br>Hãy mở ứng dụng trên điện thoại OPPO và bấm <em>"Bắt đầu kết nối"</em>`;
                }
            }
        } else {
            console.error('[Auth] Đăng nhập thất bại:', result.message);
            isAuthenticated = false;
            localStorage.removeItem('oppo_auth_pass');
            if (loginGateModal) loginGateModal.classList.remove('hidden');
            showLoginError(result.message || 'Sai tên tài khoản hoặc mật khẩu!');
            if (loginPassword) {
                loginPassword.value = '';
                loginPassword.focus();
            }
        }
    });

    socket.on('network_info', (data) => {
        if (data && data.lanUrl) {
            localLanUrl = data.lanUrl;
            if (wifiGateUrlText) wifiGateUrlText.textContent = localLanUrl;
            if (wifiLanOverlayText) wifiLanOverlayText.textContent = localLanUrl;
            if (qrUrlDisplay) qrUrlDisplay.textContent = localLanUrl;
            if (qrCodeImg) {
                qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(localLanUrl)}`;
            }
        }
    });

    const deviceSelectDropdown = document.getElementById('deviceSelectDropdown');
    if (deviceSelectDropdown) {
        deviceSelectDropdown.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            if (selectedId && socket && isAuthenticated) {
                console.log(`[Dashboard] Switching to device: ${selectedId}`);
                socket.emit('SELECT_DEVICE', { deviceId: selectedId });
            }
        });
    }

    // Danh sách nhiều thiết bị đồng thời (OPPO, Meizu 21 Pro...)
    socket.on('device_list', (data) => {
        if (!data) return;
        const { devices, activeDeviceId, currentDeviceState } = data;

        if (deviceSelectDropdown) {
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
        }

        if (currentDeviceState) {
            applyDeviceState(currentDeviceState);
        }
    });

    // Cập nhật trạng thái thiết bị từ Android
    socket.on('device_status', (data) => {
        if (!data) return;
        if (data.mediaProjectionStopped) {
            showInputToast('⚠️ Quyền quay màn hình đã dừng bởi hệ thống. Hãy mở app và bấm lại Bắt đầu!', 6000);
        }
        applyDeviceState(data);
    });

    // Cập nhật sự kiện xoay màn hình điện thoại tức thì (Ngang/Dọc)
    socket.on('device_orientation', (data) => {
        if (!data || !data.width || !data.height) return;
        const isLandscape = Boolean(data.isLandscape !== undefined ? data.isLandscape : data.width > data.height);
        console.log(`[Dashboard] Device Orientation Changed: ${data.width}x${data.height} (Landscape: ${isLandscape})`);
        applyOrientation(data.width, data.height, isLandscape);
    });

    let lastFrameReceivedTime = performance.now();

    socket.on('stream_frame', (frameData) => {
        if (!frameData) return;
        lastFrameReceivedTime = performance.now();

        let frameSize = 0;
        let imageSrc = '';

        if (typeof frameData === 'string') {
            imageSrc = frameData.startsWith('data:image') ? frameData : `data:image/jpeg;base64,${frameData}`;
            frameSize = frameData.length;
        } else if (frameData instanceof ArrayBuffer || ArrayBuffer.isView(frameData)) {
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            imageSrc = URL.createObjectURL(blob);
            activeBlobUrl = imageSrc;
            frameSize = blob.size;
        }

        bytesReceived += frameSize;

        // Watchdog: Nếu sau 250ms chưa load xong, cưỡng chế mở khóa để nhận frame tiếp theo
        if (!isImageLoading) {
            isImageLoading = true;
            clearTimeout(imageLoadWatchdog);
            imageLoadWatchdog = setTimeout(() => {
                isImageLoading = false;
            }, 250);
            renderImage.src = imageSrc;
        }
    });

    // Stream Liveness Watchdog: tự động phục hồi luồng nếu không nhận được frame trong >2.5s (do đổi app / đa nhiệm)
    setInterval(() => {
        if (isDeviceOnline && socket && socket.connected && isAuthenticated && !isBlackoutActive) {
            const timeSinceLastFrame = performance.now() - lastFrameReceivedTime;
            if (timeSinceLastFrame > 2500 && timeSinceLastFrame < 25000) {
                console.log('[Watchdog] Không nhận được frame trong >2.5s, tự động yêu cầu RESET_STREAM...');
                socket.emit('RESET_STREAM', {});
                lastFrameReceivedTime = performance.now(); // Tránh spam liên tục
            }
        }
    }, 2000);

    // Đo độ trễ
    setInterval(() => {
        if (socket && socket.connected && isAuthenticated) {
            const startTime = performance.now();
            socket.emit('client_ping', startTime);
        }
    }, 3000);

    socket.on('client_pong', (startTime) => {
        const rtt = Math.round(performance.now() - startTime);
        if (pingCounter) pingCounter.textContent = `${rtt} ms`;
    });
}

function performLogin(username, password) {
    const user = (username || '').trim();
    const pass = (password || '').trim();

    if (!user || !pass) {
        showLoginError('Vui lòng nhập đầy đủ tài khoản và mật khẩu!');
        return;
    }

    if (btnLoginSubmit) {
        btnLoginSubmit.disabled = true;
        if (btnLoginText) btnLoginText.textContent = 'Đang xác thực...';
    }
    if (loginErrorMsg) loginErrorMsg.classList.add('hidden');

    if (socket && socket.connected) {
        socket.emit('auth_dashboard', { username: user, password: pass });
    } else {
        initSocket();
        setTimeout(() => {
            if (socket && socket.connected) {
                socket.emit('auth_dashboard', { username: user, password: pass });
            }
        }, 600);
    }
}

function showLoginError(msg) {
    if (btnLoginSubmit) {
        btnLoginSubmit.disabled = false;
        if (btnLoginText) btnLoginText.textContent = 'ĐĂNG NHẬP HỆ THỐNG';
    }
    if (loginErrorMsg && loginErrorText) {
        loginErrorText.textContent = msg;
        loginErrorMsg.classList.remove('hidden');
    }
    if (loginGateModal) {
        const card = loginGateModal.querySelector('.login-gate-card');
        if (card) {
            card.style.animation = 'none';
            card.offsetHeight; // trigger reflow
            card.style.animation = 'loginShake 0.4s ease-in-out';
        }
    }
}

function setNetworkMode(mode) {
    currentNetworkMode = mode;
    localStorage.setItem('oppo_network_mode', mode);
}

function openQrModal(url) {
    const targetUrl = url || (window.location.protocol.startsWith('http') ? window.location.origin : 'https://dieu-khien-tu-xa.onrender.com');
    if (qrUrlDisplay) qrUrlDisplay.textContent = targetUrl;
    if (qrCodeImg) {
        qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
    }
    if (qrModal) qrModal.classList.remove('hidden');
}

function closeQrModal() {
    if (qrModal) qrModal.classList.add('hidden');
}

function copyToClipboard(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép!';
            setTimeout(() => { btn.innerHTML = orig; }, 2000);
        }
    }).catch(() => {
        prompt('Sao chép đường dẫn này:', text);
    });
}

function authenticate() {
    const serverInput = document.getElementById('serverUrlInput');
    if (serverInput && serverInput.value.trim()) {
        const newUrl = serverInput.value.trim().replace(/\/+$/, '');
        const currentUrl = getRelayServerUrl();
        if (newUrl !== currentUrl) {
            localStorage.setItem('oppo_relay_server_url', newUrl);
            initSocket();
            return;
        }
    }

    const savedUser = localStorage.getItem('oppo_auth_user') || (loginUsername ? loginUsername.value.trim() : 'baovy123');
    const savedPass = localStorage.getItem('oppo_auth_pass') || (loginPassword ? loginPassword.value.trim() : '');

    if (savedUser && savedPass) {
        performLogin(savedUser, savedPass);
    } else {
        if (loginGateModal) loginGateModal.classList.remove('hidden');
    }
}

function drawPlaceholder() {
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    
    // Status Header
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('📱 ĐANG CHỜ KẾT NỐI THIẾT BỊ', canvas.width / 2, canvas.height / 2 - 200);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '28px sans-serif';
    ctx.fillText('Máy tính đã sẵn sàng nhận luồng điều khiển OPPO / Meizu', canvas.width / 2, canvas.height / 2 - 140);

    // Option 1: Local WiFi
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('👉 CÁCH 1: CÙNG MẠNG WIFI (TỐC ĐỘ CAO NHẤT)', canvas.width / 2, canvas.height / 2 - 60);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 38px monospace';
    ctx.fillText('http://192.168.30.102:3000', canvas.width / 2, canvas.height / 2 - 10);

    // Option 2: Internet / 4G (Cloudflare)
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('👉 CÁCH 2: DÙNG 4G / INTERNET TỪ XA', canvas.width / 2, canvas.height / 2 + 70);

    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('https://european-choose-arcade-pepper.trycloudflare.com', canvas.width / 2, canvas.height / 2 + 115);

    // PIN & Action Guide
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('🔑 MÃ PIN BẢO MẬT: 123456', canvas.width / 2, canvas.height / 2 + 190);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '30px sans-serif';
    ctx.fillText('Bấm "BẮT ĐẦU ĐIỀU KHIỂN" trên điện thoại -> Chọn "Bắt đầu ngay"', canvas.width / 2, canvas.height / 2 + 250);
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
 * Calculate Device Coordinate Mapping with Inscribed Aspect Ratio Math
 * Handles:
 * 1. Letterboxing (black bars top/bottom in Fullscreen or high-aspect ratio viewports)
 * 2. Pillarboxing (black bars left/right in portrait or wide viewports)
 * 3. Custom Zoom levels (600px - 1800px)
 * 4. Theater Mode, Frameless Mode, and Fullscreen (F11)
 * Maps click/touch with 100% pixel accuracy to actual device display coordinates
 */
function getDeviceCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0, visualX: 0, visualY: 0 };
    }

    // Native resolution of the stream / canvas buffer
    const nativeW = canvas.width || phoneResolution.width || 1;
    const nativeH = canvas.height || phoneResolution.height || 1;

    // Actual physical resolution on the Android phone for touch dispatch
    const devW = (actualDeviceDisplay.width > 0) ? actualDeviceDisplay.width : nativeW;
    const devH = (actualDeviceDisplay.height > 0) ? actualDeviceDisplay.height : nativeH;

    const elementW = rect.width;
    const elementH = rect.height;
    const elementAspect = elementW / elementH;
    const nativeAspect = nativeW / nativeH;

    let renderW = elementW;
    let renderH = elementH;
    let offsetX = 0;
    let offsetY = 0;

    if (elementAspect > nativeAspect) {
        // Pillarbox: container is wider than video -> black bars on Left & Right
        renderH = elementH;
        renderW = elementH * nativeAspect;
        offsetX = (elementW - renderW) / 2;
        offsetY = 0;
    } else {
        // Letterbox: container is taller than video -> black bars on Top & Bottom
        renderW = elementW;
        renderH = elementW / nativeAspect;
        offsetX = 0;
        offsetY = (elementH - renderH) / 2;
    }

    // Mouse position relative to the actual rendered video content rectangle
    const contentX = event.clientX - rect.left - offsetX;
    const contentY = event.clientY - rect.top - offsetY;

    // Relative position clamped (0.0 to 1.0) inside active video area
    const clampedX = Math.max(0, Math.min(renderW, contentX));
    const clampedY = Math.max(0, Math.min(renderH, contentY));

    const ratioX = renderW > 0 ? (clampedX / renderW) : 0;
    const ratioY = renderH > 0 ? (clampedY / renderH) : 0;

    // Scaled to exact Android device screen coordinates
    const x = Math.max(0, Math.min(devW, Math.round(ratioX * devW)));
    const y = Math.max(0, Math.min(devH, Math.round(ratioY * devH)));

    // visualX, visualY relative to screenViewport for ripple animation
    const vpRect = screenViewport.getBoundingClientRect();
    const visualX = Math.round(event.clientX - vpRect.left);
    const visualY = Math.round(event.clientY - vpRect.top);

    return { x, y, visualX, visualY };
}

function showTouchRipple(visualX, visualY) {
    if (!touchRipple) return;
    touchRipple.style.left = `${visualX}px`;
    touchRipple.style.top = `${visualY}px`;
    touchRipple.classList.remove('active');
    void touchRipple.offsetWidth;
    touchRipple.classList.add('active');
    setTimeout(() => {
        if (touchRipple) touchRipple.classList.remove('active');
    }, 280);
}

function showSwipeTrail(x1, y1, x2, y2) {
    if (!swipeSvg) return;
    swipeSvg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#06b6d4" stroke-width="4" stroke-linecap="round" stroke-dasharray="6,4" opacity="0.9" />`;
    setTimeout(() => {
        if (swipeSvg) swipeSvg.innerHTML = '';
    }, 350);
}

/**
 * Touch & Mouse Event Handlers with Native Mobile Gestures
 * Supports both:
 * 1. Touchscreens (Phones, Tablets, iPads) via passive: false touchstart/touchmove/touchend
 *    - Eliminates browser back/forward history swipe
 *    - Eliminates pull-to-refresh
 *    - Eliminates stuck gestures / pointercancel
 * 2. Desktop PC Mouse via mousedown/mousemove/mouseup with anti-synthetic touch filter
 */
let isTouchActive = false;
let touchStartTime = 0;
let touchStartCoords = { x: 0, y: 0, visualX: 0, visualY: 0 };
let lastStreamX = 0;
let lastStreamY = 0;
let lastStreamVisualX = 0;
let lastStreamVisualY = 0;
let lastStreamTime = 0;
let hasStreamMoved = false;
let totalMoveDist = 0;
let lastTouchEndTime = 0;

function handleTouchStart(e) {
    if (!isDeviceOnline || isBlackoutActive) return;
    if (e.touches.length > 1) return;

    if (e.cancelable) e.preventDefault();

    isTouchActive = true;
    touchStartTime = performance.now();
    touchStartCoords = getDeviceCoordinates(e.touches[0]);
    lastStreamX = touchStartCoords.x;
    lastStreamY = touchStartCoords.y;
    lastStreamVisualX = touchStartCoords.visualX;
    lastStreamVisualY = touchStartCoords.visualY;
    lastStreamTime = touchStartTime;
    hasStreamMoved = false;
    totalMoveDist = 0;

    sendTouchDown(touchStartCoords.x, touchStartCoords.y);
    showTouchRipple(touchStartCoords.visualX, touchStartCoords.visualY);
}

function handleTouchMove(e) {
    if (!isTouchActive) return;
    if (e.cancelable) e.preventDefault();

    if (!e.touches || e.touches.length === 0) return;
    const curCoords = getDeviceCoordinates(e.touches[0]);
    if (coordinateText) {
        coordinateText.textContent = `Tọa độ: (${curCoords.x}, ${curCoords.y})`;
    }

    sendTouchMove(curCoords.x, curCoords.y);

    const segDist = Math.hypot(curCoords.x - lastStreamX, curCoords.y - lastStreamY);
    totalMoveDist += segDist;
    const now = performance.now();
    const timeDelta = now - lastStreamTime;

    // KHI ĐANG GIỮ VÀ VUỐT (DRAG):
    // Cứ mỗi 65ms - 85ms và di chuyển từ 18px trở lên, gửi ngay thao tác lướt nối tiếp
    // Điện thoại OPPO sẽ chuyển động THỜI GIAN THỰC theo ngón tay, không cần chờ thả tay!
    if (segDist >= 18 && timeDelta >= 65) {
        hasStreamMoved = true;
        const segDuration = Math.max(45, Math.min(80, Math.round(timeDelta * 0.85)));
        sendTouchSwipe(lastStreamX, lastStreamY, curCoords.x, curCoords.y, segDuration);
        showSwipeTrail(lastStreamVisualX, lastStreamVisualY, curCoords.visualX, curCoords.visualY);

        lastStreamX = curCoords.x;
        lastStreamY = curCoords.y;
        lastStreamVisualX = curCoords.visualX;
        lastStreamVisualY = curCoords.visualY;
        lastStreamTime = now;
    }
}

function handleTouchEnd(e) {
    if (!isTouchActive) return;
    if (e.cancelable) e.preventDefault();
    isTouchActive = false;
    lastTouchEndTime = performance.now();

    const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    const endCoords = touch ? getDeviceCoordinates(touch) : { x: lastStreamX, y: lastStreamY, visualX: lastStreamVisualX, visualY: lastStreamVisualY };

    sendTouchUp(endCoords.x, endCoords.y);

    const elapsed = performance.now() - touchStartTime;
    const overallDist = Math.hypot(endCoords.visualX - touchStartCoords.visualX, endCoords.visualY - touchStartCoords.visualY);

    if (!hasStreamMoved) {
        // Nếu không di chuyển qua ngưỡng -> Chạm đơn (Tap)
        if (overallDist < 16 && elapsed < 550) {
            console.log(`[Mobile Touch Tap] (${touchStartCoords.x}, ${touchStartCoords.y})`);
            sendTouchTap(touchStartCoords.x, touchStartCoords.y);
        } else if (overallDist >= 16) {
            // Vuốt nhanh lướt qua trong tích tắc (< 65ms)
            console.log(`[Mobile Quick Flick] (${touchStartCoords.x}, ${touchStartCoords.y}) -> (${endCoords.x}, ${endCoords.y})`);
            showSwipeTrail(touchStartCoords.visualX, touchStartCoords.visualY, endCoords.visualX, endCoords.visualY);
            sendTouchSwipe(touchStartCoords.x, touchStartCoords.y, endCoords.x, endCoords.y, 220);
        }
    } else {
        // Khi vừa giữ vuốt xong và thả tay, bù nốt quãng đường dư cuối cùng
        const residualDist = Math.hypot(endCoords.x - lastStreamX, endCoords.y - lastStreamY);
        if (residualDist >= 16) {
            sendTouchSwipe(lastStreamX, lastStreamY, endCoords.x, endCoords.y, 65);
            showSwipeTrail(lastStreamVisualX, lastStreamVisualY, endCoords.visualX, endCoords.visualY);
        }
    }
}

function handleTouchCancel(e) {
    isTouchActive = false;
    lastTouchEndTime = performance.now();
    sendTouchUp(lastStreamX, lastStreamY);
}

// Attach native touch events with { passive: false }
screenViewport.addEventListener('touchstart', handleTouchStart, { passive: false });
screenViewport.addEventListener('touchmove', handleTouchMove, { passive: false });
screenViewport.addEventListener('touchend', handleTouchEnd, { passive: false });
screenViewport.addEventListener('touchcancel', handleTouchCancel, { passive: false });

// Desktop Mouse Event Handlers with Real-Time Follow-Through
screenViewport.addEventListener('mousedown', (e) => {
    if (performance.now() - lastTouchEndTime < 400) return;
    if (!isDeviceOnline || isBlackoutActive) return;
    if (e.button !== 0) return;

    isMouseDown = true;
    mouseDownTime = performance.now();
    startCoords = getDeviceCoordinates(e);
    lastStreamX = startCoords.x;
    lastStreamY = startCoords.y;
    lastStreamVisualX = startCoords.visualX;
    lastStreamVisualY = startCoords.visualY;
    lastStreamTime = mouseDownTime;
    hasStreamMoved = false;
    totalMoveDist = 0;

    sendTouchDown(startCoords.x, startCoords.y);
    showTouchRipple(startCoords.visualX, startCoords.visualY);
});

screenViewport.addEventListener('mousemove', (e) => {
    if (performance.now() - lastTouchEndTime < 400) return;
    const curCoords = getDeviceCoordinates(e);
    if (coordinateText) {
        coordinateText.textContent = `Tọa độ: (${curCoords.x}, ${curCoords.y})`;
    }

    if (!isMouseDown) return;

    sendTouchMove(curCoords.x, curCoords.y);

    const segDist = Math.hypot(curCoords.x - lastStreamX, curCoords.y - lastStreamY);
    totalMoveDist += segDist;
    const now = performance.now();
    const timeDelta = now - lastStreamTime;

    if (segDist >= 18 && timeDelta >= 65) {
        hasStreamMoved = true;
        const segDuration = Math.max(45, Math.min(80, Math.round(timeDelta * 0.85)));
        sendTouchSwipe(lastStreamX, lastStreamY, curCoords.x, curCoords.y, segDuration);
        showSwipeTrail(lastStreamVisualX, lastStreamVisualY, curCoords.visualX, curCoords.visualY);

        lastStreamX = curCoords.x;
        lastStreamY = curCoords.y;
        lastStreamVisualX = curCoords.visualX;
        lastStreamVisualY = curCoords.visualY;
        lastStreamTime = now;
    }
});

window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    if (performance.now() - lastTouchEndTime < 400) return;

    const endCoords = getDeviceCoordinates(e);
    sendTouchUp(endCoords.x, endCoords.y);

    const elapsed = performance.now() - mouseDownTime;
    const overallDist = Math.hypot(endCoords.visualX - startCoords.visualX, endCoords.visualY - startCoords.visualY);

    if (!hasStreamMoved) {
        if (overallDist < 14 && elapsed < 550) {
            console.log(`[Mouse Tap] (${startCoords.x}, ${startCoords.y})`);
            sendTouchTap(startCoords.x, startCoords.y);
        } else if (overallDist >= 14) {
            showSwipeTrail(startCoords.visualX, startCoords.visualY, endCoords.visualX, endCoords.visualY);
            sendTouchSwipe(startCoords.x, startCoords.y, endCoords.x, endCoords.y, 220);
        }
    } else {
        const residualDist = Math.hypot(endCoords.x - lastStreamX, endCoords.y - lastStreamY);
        if (residualDist >= 16) {
            sendTouchSwipe(lastStreamX, lastStreamY, endCoords.x, endCoords.y, 65);
            showSwipeTrail(lastStreamVisualX, lastStreamVisualY, endCoords.visualX, endCoords.visualY);
        }
    }
});

// 1. TÍNH NĂNG CUỘN CHUỘT MÁY TÍNH (MOUSE WHEEL) - LƯỚT MƯỢT TRỰC TIẾP
let wheelThrottleTime = 0;
screenViewport.addEventListener('wheel', (e) => {
    if (!isDeviceOnline || isBlackoutActive) return;
    e.preventDefault();

    const now = performance.now();
    if (now - wheelThrottleTime < 90) return; // Nhạy hơn, không trễ
    wheelThrottleTime = now;

    const coords = getDeviceCoordinates(e);
    const direction = e.deltaY > 0 ? 'DOWN' : 'UP';
    console.log(`[Mouse Wheel] Scroll ${direction}`);

    if (socket && isAuthenticated) {
        socket.emit('TOUCH_SCROLL', { direction, x: coords.x, y: coords.y });
    }
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
        return;
    }

    // Enter -> Xuống dòng hoặc gửi tin nhắn
    if (e.key === 'Enter') {
        e.preventDefault();
        sendKeyEvent('ENTER');
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
    }
});

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

function sendTouchDown(x, y) {
    if (socket && isAuthenticated) {
        socket.emit('TOUCH_DOWN', { x, y });
    }
}

function sendTouchMove(x, y) {
    if (socket && isAuthenticated) {
        socket.emit('TOUCH_MOVE', { x, y });
    }
}

function sendTouchUp(x, y) {
    if (socket && isAuthenticated) {
        socket.emit('TOUCH_UP', { x, y });
    }
}

function quickSwipe(direction) {
    if (!isDeviceOnline || isBlackoutActive) return;
    const devW = (actualDeviceDisplay && actualDeviceDisplay.width > 0) ? actualDeviceDisplay.width : (phoneResolution.width || 1600);
    const devH = (actualDeviceDisplay && actualDeviceDisplay.height > 0) ? actualDeviceDisplay.height : (phoneResolution.height || 720);

    let startX, startY, endX, endY;
    const duration = 260;

    if (direction === 'LEFT') {
        // Vuốt từ phải sang trái (Chuyển trang kế tiếp)
        startX = Math.round(devW * 0.82);
        endX = Math.round(devW * 0.18);
        startY = Math.round(devH * 0.50);
        endY = Math.round(devH * 0.50);
        showInputToast('👉 Vuốt Sang Trái (Trang Kế)');
    } else if (direction === 'RIGHT') {
        // Vuốt từ trái sang phải (Trở lại trang trước)
        startX = Math.round(devW * 0.18);
        endX = Math.round(devW * 0.82);
        startY = Math.round(devH * 0.50);
        endY = Math.round(devH * 0.50);
        showInputToast('👈 Vuốt Sang Phải (Trang Trước)');
    } else if (direction === 'UP') {
        // Vuốt lên trên (Cuộn trang xuống / TikTok / Web)
        startX = Math.round(devW * 0.50);
        endX = Math.round(devW * 0.50);
        startY = Math.round(devH * 0.78);
        endY = Math.round(devH * 0.22);
        showInputToast('👆 Vuốt Lên Trên (Cuộn Xuống)');
    } else if (direction === 'DOWN') {
        // Vuốt xuống dưới (Kéo thông báo / cuộn trang lên)
        startX = Math.round(devW * 0.50);
        endX = Math.round(devW * 0.50);
        startY = Math.round(devH * 0.15);
        endY = Math.round(devH * 0.75);
        showInputToast('👇 Vuốt Xuống Dưới (Kéo Thông Báo)');
    }

    console.log(`[Quick Swipe ${direction}] (${startX}, ${startY}) -> (${endX}, ${endY}) in ${duration}ms`);
    sendTouchSwipe(startX, startY, endX, endY, duration);
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
if (btnConnectDashboard) btnConnectDashboard.addEventListener('click', authenticate);
if (authPinInput) {
    authPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') authenticate();
    });
}

// Login Gate Event Handlers
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const u = loginUsername ? loginUsername.value.trim() : '';
        const p = loginPassword ? loginPassword.value.trim() : '';
        performLogin(u, p);
    });
}

if (btnTogglePassword && loginPassword && eyeIcon) {
    btnTogglePassword.addEventListener('click', (e) => {
        e.preventDefault();
        if (loginPassword.type === 'password') {
            loginPassword.type = 'text';
            eyeIcon.classList.remove('fa-eye');
            eyeIcon.classList.add('fa-eye-slash');
        } else {
            loginPassword.type = 'password';
            eyeIcon.classList.remove('fa-eye-slash');
            eyeIcon.classList.add('fa-eye');
        }
    });
}

if (userAuthChip) {
    userAuthChip.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản?')) {
            localStorage.removeItem('oppo_auth_user');
            localStorage.removeItem('oppo_auth_pass');
            isAuthenticated = false;
            if (socket && socket.connected) {
                socket.emit('logout_dashboard');
            }
            if (loginGateModal) loginGateModal.classList.remove('hidden');
            if (loginPassword) loginPassword.value = '';
            if (loginErrorMsg) loginErrorMsg.classList.add('hidden');
            if (userAuthChip) userAuthChip.classList.add('hidden');
            screenOverlay.classList.remove('hidden');
        }
    });
}

// Network Mode Switcher Handlers
if (tabModeWifi) tabModeWifi.addEventListener('click', () => setNetworkMode('wifi'));
if (tabModeInternet) tabModeInternet.addEventListener('click', () => setNetworkMode('internet'));
if (networkModeChip) networkModeChip.addEventListener('click', () => {
    setNetworkMode(currentNetworkMode === 'wifi' ? 'internet' : 'wifi');
});

// QR Code Modal Handlers
const getEffectiveUrl = () => window.location.protocol.startsWith('http') ? window.location.origin : 'https://dieu-khien-tu-xa.onrender.com';

if (btnGateShowQr) btnGateShowQr.addEventListener('click', () => openQrModal(getEffectiveUrl()));
if (btnShowQrOverlay) btnShowQrOverlay.addEventListener('click', () => openQrModal(getEffectiveUrl()));
if (btnCloseQrModal) btnCloseQrModal.addEventListener('click', closeQrModal);
if (qrModal) {
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) closeQrModal();
    });
}

// Copy link buttons
if (btnGateCopyWifi) btnGateCopyWifi.addEventListener('click', () => copyToClipboard(getEffectiveUrl(), btnGateCopyWifi));
if (btnCopyOverlayWifi) btnCopyOverlayWifi.addEventListener('click', () => copyToClipboard(getEffectiveUrl(), btnCopyOverlayWifi));

// Khởi tạo chế độ mạng theo đã lưu
setNetworkMode(currentNetworkMode);

const btnChangeServer = document.getElementById('btnChangeServer');
if (btnChangeServer) {
    btnChangeServer.addEventListener('click', () => {
        screenOverlay.classList.remove('hidden');
        const input = document.getElementById('serverUrlInput');
        if (input) {
            input.focus();
            input.select();
        }
    });
}

// Power Modes
btnScreenOffSmart.addEventListener('click', () => sendPowerMode('SCREEN_OFF_SMART'));
btnScreenOnSmart.addEventListener('click', () => sendPowerMode('SCREEN_ON_SMART'));
btnWakeFromBlackout.addEventListener('click', () => sendPowerMode('SCREEN_ON_SMART'));
btnAutoUnlock.addEventListener('click', sendAutoUnlock);

function triggerRecents() {
    sendKeyEvent('RECENTS');
    showInputToast('📑 Đang mở tab Đa nhiệm...');
    // Đồng bộ lại luồng màn hình sau 500ms để chống hiện tượng đen màn hình của Launcher
    setTimeout(() => {
        if (socket && isAuthenticated) {
            socket.emit('RESET_STREAM', {});
        }
    }, 500);
}

// Navigation Keys
btnKeyBack.addEventListener('click', () => sendKeyEvent('BACK'));
btnKeyHome.addEventListener('click', () => sendKeyEvent('HOME'));
btnKeyRecents.addEventListener('click', triggerRecents);
btnKeyLock.addEventListener('click', () => sendKeyEvent('LOCK'));
btnVolUp.addEventListener('click', () => sendKeyEvent('VOLUME_UP'));
btnVolDown.addEventListener('click', () => sendKeyEvent('VOLUME_DOWN'));

// Phone Bezel Hardware Keys
btnPhoneBack.addEventListener('click', () => sendKeyEvent('BACK'));
btnPhoneHome.addEventListener('click', () => sendKeyEvent('HOME'));
btnPhoneRecents.addEventListener('click', triggerRecents);

// Quick Swipe Gesture Buttons
const btnSwipeLeft = document.getElementById('btnSwipeLeft');
const btnSwipeRight = document.getElementById('btnSwipeRight');
const btnSwipeUp = document.getElementById('btnSwipeUp');
const btnSwipeDown = document.getElementById('btnSwipeDown');

if (btnSwipeLeft) btnSwipeLeft.addEventListener('click', () => quickSwipe('LEFT'));
if (btnSwipeRight) btnSwipeRight.addEventListener('click', () => quickSwipe('RIGHT'));
if (btnSwipeUp) btnSwipeUp.addEventListener('click', () => quickSwipe('UP'));
if (btnSwipeDown) btnSwipeDown.addEventListener('click', () => quickSwipe('DOWN'));

// Rotate buttons
const btnToggleRotate = document.getElementById('btnToggleRotate');
if (btnToggleRotate) {
    btnToggleRotate.addEventListener('click', toggleOrientation);
}
const btnDeckRotate = document.getElementById('btnDeckRotate');
if (btnDeckRotate) {
    btnDeckRotate.addEventListener('click', toggleOrientation);
}

// Screen Size Preset Buttons
const btnSizeNormal = document.getElementById('btnSizeNormal');
if (btnSizeNormal) {
    btnSizeNormal.addEventListener('click', () => updateScreenSize('normal'));
}

const btnSizeLarge = document.getElementById('btnSizeLarge');
if (btnSizeLarge) {
    btnSizeLarge.addEventListener('click', () => updateScreenSize('large'));
}

const btnSizeMax = document.getElementById('btnSizeMax');
if (btnSizeMax) {
    btnSizeMax.addEventListener('click', () => updateScreenSize('max'));
}

// Size Range Slider
const sizeRangeSlider = document.getElementById('sizeRangeSlider');
if (sizeRangeSlider) {
    sizeRangeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        updateScreenSize('custom', val);
    });
}

// Frameless Mode (Tràn Viền)
const btnToggleFrameless = document.getElementById('btnToggleFrameless');
if (btnToggleFrameless) {
    btnToggleFrameless.addEventListener('click', () => {
        isFrameless = !isFrameless;
        if (phoneChassis) phoneChassis.classList.toggle('frameless', isFrameless);
        btnToggleFrameless.classList.toggle('active', isFrameless);
        showInputToast(isFrameless ? '🖼️ Đã bật Chế độ Tràn Viền (To hơn)' : '📱 Đã bật Viền Điện Thoại');
    });
}

// Theater Mode (Ẩn Bảng Phải để mở rộng tối đa)
const btnToggleTheater = document.getElementById('btnToggleTheater');
if (btnToggleTheater) {
    btnToggleTheater.addEventListener('click', () => {
        isTheaterMode = !isTheaterMode;
        const container = document.querySelector('.dashboard-container');
        if (container) container.classList.toggle('theater-mode', isTheaterMode);
        btnToggleTheater.classList.toggle('active', isTheaterMode);
        
        if (isTheaterMode) {
            updateScreenSize('max');
        } else {
            updateScreenSize('large');
        }
        showInputToast(isTheaterMode ? '🎦 Bật Chế độ Rạp Phim (Siêu To)' : '🖥️ Trở về Chế độ Tiêu Chuẩn');
    });
}

// Fullscreen API (F11 / Toàn Màn Hình)
const btnFullscreen = document.getElementById('btnFullscreen');
const btnExitFullscreen = document.getElementById('btnExitFullscreen');

function enterFullscreen() {
    if (screenViewport) {
        if (screenViewport.requestFullscreen) {
            screenViewport.requestFullscreen().catch(err => console.warn(err));
        } else if (screenViewport.webkitRequestFullscreen) {
            screenViewport.webkitRequestFullscreen();
        } else if (screenViewport.msRequestFullscreen) {
            screenViewport.msRequestFullscreen();
        }
    }
}

function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn(err));
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

if (btnFullscreen) {
    btnFullscreen.addEventListener('click', enterFullscreen);
}

if (btnExitFullscreen) {
    btnExitFullscreen.addEventListener('click', exitFullscreen);
}

function handleFullscreenChange() {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    if (btnExitFullscreen) {
        if (isFs) {
            btnExitFullscreen.classList.remove('hidden');
        } else {
            btnExitFullscreen.classList.add('hidden');
        }
    }
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);

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
