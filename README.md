# OPPO Remote Control System (ColorOS Pro Edition)

Hệ thống điều khiển điện thoại OPPO (chạy ColorOS trên nền Android 13/14/15+) từ xa qua trình duyệt Web với độ trễ siêu thấp.

Được thiết kế chuyên sâu bởi **Senior Android System Engineer & Full-Stack Developer** nhằm giải quyết triệt để các hạn chế nghiêm ngặt nhất của ColorOS:
1. **KHÔNG bị ColorOS giết app ngầm** (Doze Mode, App Quick Freeze, Aggressive RAM Clean).
2. **KHÔNG bị mất kết nối Wi-Fi** khi tắt màn hình lâu (Wi-Fi Sleep Policy).
3. **KHÔNG bị mất quyền quay màn hình (MediaProjection)** sau khi tắt hoặc bật màn hình.

---

## 📁 Cấu Trúc Monorepo

```text
oppo-remote-control/
├── start-server.bat                      # File khởi động nhanh Server trên Windows
├── server-dashboard/                     # Phần 1: Relay Server & Web UI
│   ├── package.json                      # Cấu hình dependency Node.js
│   ├── server.js                         # WebSocket (Socket.IO) & Express Server
│   ├── test_relay.js                     # Kịch bản kiểm thử tích hợp tự động
│   └── public/
│       ├── index.html                    # Giao diện Web Dark Mode chuẩn Mobile Frame
│       ├── style.css                     # Thiết kế responsive, hiệu ứng cảm ứng ripple/swipe
│       └── app.js                        # Tính toán tỷ lệ tọa độ canvas, xử lý chuột & stream
│
└── android-client/                       # Phần 2: Ứng Dụng Android Kotlin
    ├── build.gradle.kts                  # Cấu hình Gradle Root
    ├── settings.gradle.kts               # Cấu hình Module Gradle
    ├── gradle.properties
    ├── gradlew / gradlew.bat             # Gradle Wrapper thực thi build APK
    ├── gradle/wrapper/                   # gradle-wrapper.jar & properties (Gradle 8.6)
    └── app/
        ├── build.gradle.kts              # Dependencies: Socket.IO Client, Coroutines, Material3
        ├── proguard-rules.pro            # Quy tắc chống tối ưu hóa nhầm thư viện mạng
        └── src/main/
            ├── AndroidManifest.xml       # Khai báo chuẩn Foreground Service Android 14+
            ├── res/
            │   ├── layout/activity_main.xml          # Giao diện Checklist 3 bước cấp quyền
            │   ├── xml/accessibility_service_config.xml # Cấu hình cử chỉ Gesture
            │   └── ... (drawables, values, colors)
            └── java/com/oppo/remotecontrol/
                ├── MainActivity.kt                   # Màn hình điều phối quyền & thiết lập
                ├── model/ControlPayloads.kt          # Dữ liệu truyền thông chuẩn hóa
                ├── service/
                │   ├── CoreKeepAliveService.kt       # Dịch vụ Giữ Sống, MediaProjection, Socket.IO
                │   └── RemoteAccessibilityService.kt # Dịch vụ Trợ Năng, Smart Blackout, Gestures
                └── utils/
                    └── ColorOSPowerHelper.kt         # Mở cấu hình Auto-Launch riêng của ColorOS
```

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Khởi động Web Dashboard Server:
- **Cách 1 (Nhanh nhất trên Windows):** Click đúp vào file `start-server.bat`.
- **Cách 2 (Dùng lệnh):**
  ```bash
  cd server-dashboard
  npm install
  node server.js
  ```
- Truy cập trình duyệt Web tại: `http://localhost:3000` (hoặc `http://<IP_MÁY_TÍNH>:3000` trên cùng mạng LAN).
- Mã PIN bảo mật mặc định: **`123456`**.

### 2. Cài đặt và Chạy Android Client:
1. Mở thư mục `/android-client` bằng **Android Studio** (Hedgehog / Iguana / Jellyfish trở lên).
2. Kết nối điện thoại OPPO qua cáp USB và nhấn **Run** (hoặc chạy `./gradlew assembleDebug` để lấy file APK tại `app/build/outputs/apk/debug/app-debug.apk`).
3. Mở ứng dụng **OPPO Remote Control** trên điện thoại:
   - Nhập **Server URL** (ví dụ: `http://192.168.1.15:3000`).
   - Nhập **Mã PIN bảo mật** (`123456`).
   - Nhấn **"1. Bỏ qua tối ưu hóa Pin"** -> Chọn **Cho phép** (Allow).
   - Nhấn **"2. Bật Dịch vụ Trợ năng"** -> Tìm **"OPPO Remote Control"** trong danh sách và gạt Bật.
   - Nhấn **"3. Ghi Màn Hình & Bắt Đầu"** -> Xác nhận hộp thoại "Bắt đầu ngay" của Android.

---

## 🛡️ Bí Kíp Bất Tử Cho ColorOS (Chuyên Sâu)

ColorOS của OPPO có các cơ chế tiết kiệm pin rất khắc nghiệt (như *App Quick Freeze* và *Auto-Kill RAM*). Để hệ thống hoạt động 24/7 không bao giờ bị ngắt quãng, vui lòng thực hiện thêm 2 bước đơn giản trên điện thoại:

1. **Khóa Ứng Dụng Trong Màn Hình Đa Nhiệm:**
   - Vuốt mở danh sách ứng dụng gần đây (Recent Apps).
   - Nhấn vào biểu tượng **ba dấu chấm ⋮** (hoặc vuốt nhẹ thẻ ứng dụng xuống) ở góc trên thẻ OPPO Remote Control.
   - Chọn **"Khóa" (Lock)**. Khi có biểu tượng ổ khóa màu xanh, nút "Xóa tất cả RAM" của ColorOS sẽ không bao giờ đóng app này.
2. **Cho Phép Khởi Chạy Tự Động (Auto-Launch):**
   - Vào **Cài đặt** -> **Quản lý ứng dụng** -> **Tự khởi chạy** (hoặc mở ứng dụng Trình quản lý điện thoại / Phone Manager).
   - Gạt **Bật** cho *OPPO Remote Control* cả ở mục *Khởi chạy tự động* và *Khởi chạy liên kết ngầm*.
3. **Ưu Tiên Dùng Chế Độ "Tắt Màn Hình (Smart)":**
   - Khi không quan sát điện thoại, hãy bấm nút **"🌙 Tắt Màn Hình (Smart)"** trên Web Dashboard thay vì bấm nút nguồn vật lý.
   - Màn hình OPPO sẽ phủ đen 100% bằng tấm nền AMOLED và hạ độ sáng phần cứng xuống 0%, tạm dừng render khung hình để tiết kiệm 100% pin, trong khi **MediaProjection và Wi-Fi vẫn hoạt động 24/7**.
