const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');

if (!fs.existsSync(cloudflaredPath)) {
    console.log('[Notice] Dang tai Cloudflare Tunnel...');
}

console.log('===============================================================');
console.log('🌐 KHOI DONG DUONG TRUYEN INTERNET CHO OPPO REMOTE CONTROL');
console.log('   (Ket noi tu bat ky dau qua 4G/5G hoac Wi-Fi khac mang)');
console.log('===============================================================');

const child = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:3000']);

child.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
        console.log('\n===============================================================');
        console.log('🎉 DUONG LINK CONG KHAI CHO DIEN THOAI OPPO (4G/5G/INTERNET):');
        console.log('');
        console.log('   👉 SERVER URL: ' + match[0]);
        console.log('   👉 MA PIN:     123456');
        console.log('');
        console.log('Ban chi can nhap duong link HTTPS tren vao App OPPO.');
        console.log('===============================================================\n');
    }
});

child.on('close', (code) => {
    console.log(`Cloudflared exited with code ${code}`);
});
