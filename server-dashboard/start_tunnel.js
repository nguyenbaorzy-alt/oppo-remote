const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');

console.log('===============================================================');
console.log('🌐 KHOI DONG DUONG TRUYEN INTERNET CHO OPPO REMOTE CONTROL');
console.log('   (Ket noi tu bat ky dau qua 4G/5G hoac Wi-Fi khac mang)');
console.log('===============================================================');

const child = spawn(cloudflaredPath, ['tunnel', '--url', 'http://127.0.0.1:3000']);

let hasUpdated = false;

child.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !hasUpdated) {
        hasUpdated = true;
        const newUrl = match[0];

        // 1. Luu URL vao file text o thu muc goc
        try {
            fs.writeFileSync(path.join(__dirname, '..', 'current-tunnel-url.txt'), newUrl, 'utf8');
        } catch (e) {}

        // 2. Tu dong cap nhat public/index.html & public/app.js
        try {
            const indexPath = path.join(__dirname, 'public', 'index.html');
            if (fs.existsSync(indexPath)) {
                let html = fs.readFileSync(indexPath, 'utf8');
                html = html.replace(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g, newUrl);
                fs.writeFileSync(indexPath, html, 'utf8');
            }

            const appJsPath = path.join(__dirname, 'public', 'app.js');
            if (fs.existsSync(appJsPath)) {
                let js = fs.readFileSync(appJsPath, 'utf8');
                js = js.replace(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g, newUrl);
                fs.writeFileSync(appJsPath, js, 'utf8');
            }
        } catch (e) {}

        // 3. Tu dong copy vao Windows Clipboard
        try {
            spawn('powershell.exe', ['-Command', `Set-Clipboard -Value '${newUrl}'`]);
        } catch (e) {}

        // 4. Dong bo sang thu muc Netlify
        try {
            const netlifyDir = path.join(__dirname, '..', 'netlify-site');
            if (fs.existsSync(netlifyDir)) {
                fs.copyFileSync(path.join(__dirname, 'public', 'app.js'), path.join(netlifyDir, 'app.js'));
                fs.copyFileSync(path.join(__dirname, 'public', 'index.html'), path.join(netlifyDir, 'index.html'));
            }
        } catch (e) {}

        console.log('\n===============================================================');
        console.log('🎉 DUONG LINK CONG KHAI CHO DIEN THOAI OPPO (4G/5G/INTERNET):');
        console.log('');
        console.log('   👉 DUONG LINK TRUY CAP: ' + newUrl);
        console.log('   👉 MA PIN:              123456');
        console.log('');
        console.log('   [DA TU DONG COPY VAO BỘ NHỚ TẠM CLIPBOARD CỦA BẠN!]');
        console.log('===============================================================');
        console.log('HUONG DAN SU DUNG KHI KHAC WI-FI HOAC DUNG 4G:');
        console.log('1. Tren Dien Thoai OPPO:');
        console.log('   - Bam nut "🌐 Dung 4G Ngoai Duong"');
        console.log('   - Dan link: ' + newUrl);
        console.log('   - Nhan "Bat dau ket noi" -> "Bat dau ngay"');
        console.log('');
        console.log('2. Tren Thiet Bi Dieu Khien (Dien thoai khac hoac May tinh khac mang):');
        console.log('   - Mo trinh duyet Safari / Chrome va vao thang: ' + newUrl);
        console.log('   - Nhap ma PIN: 123456 -> Bam "Ket Noi"');
        console.log('===============================================================\n');
    }
});

child.on('close', (code) => {
    console.log(`Cloudflared exited with code ${code}`);
});
