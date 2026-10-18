const { io } = require('socket.io-client');

async function runTest() {
    console.log('--- Starting Integration Test ---');
    const SERVER_URL = 'http://localhost:3000';

    // 1. Device Socket
    const deviceSocket = io(SERVER_URL);
    // 2. Dashboard Socket
    const dashSocket = io(SERVER_URL);

    let testSuccess = false;

    deviceSocket.on('connect', () => {
        console.log('[Test] Device socket connected. Sending auth_device...');
        deviceSocket.emit('auth_device', {
            pin: '123456',
            model: 'OPPO Find X7 Pro',
            androidVersion: 'Android 14 (ColorOS 14)',
            width: 1080,
            height: 2412,
            battery: 88,
            isCharging: true,
            isBlackout: false,
            quality: 60,
            fps: 25
        });
    });

    deviceSocket.on('auth_result', (res) => {
        console.log('[Test] Device Auth Result:', res);
    });

    dashSocket.on('connect', () => {
        console.log('[Test] Dashboard socket connected. Sending auth_dashboard...');
        dashSocket.emit('auth_dashboard', { pin: '123456' });
    });

    dashSocket.on('device_status', (status) => {
        console.log('[Test] Dashboard received device_status: Model=' + status.model + ', Online=' + status.online);
    });

    // Device listens for commands
    deviceSocket.on('TOUCH_TAP', (data) => {
        console.log('[Test SUCCESS] Device received TOUCH_TAP:', data);
    });

    deviceSocket.on('POWER_MODE', (data) => {
        console.log('[Test SUCCESS] Device received POWER_MODE:', data);
        testSuccess = true;
        cleanup();
    });

    dashSocket.on('auth_result', (res) => {
        console.log('[Test] Dashboard Auth Result:', res);
        if (res.success) {
            console.log('[Test] Sending TOUCH_TAP & POWER_MODE from dashboard...');
            dashSocket.emit('TOUCH_TAP', { x: 540, y: 1200 });
            dashSocket.emit('POWER_MODE', { mode: 'SCREEN_OFF_SMART' });
        }
    });

    function cleanup() {
        console.log('--- Integration Test Finished Successfully! ---');
        deviceSocket.disconnect();
        dashSocket.disconnect();
        process.exit(0);
    }

    setTimeout(() => {
        if (!testSuccess) {
            console.error('[Test Failed] Timeout waiting for event relay');
            process.exit(1);
        }
    }, 4000);
}

runTest();
