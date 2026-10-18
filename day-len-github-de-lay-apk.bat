@echo off
title Day Ma Nguon Len GitHub De Lay File APK
chcp 65001 >nul
cd /d "%~dp0"

echo =====================================================================
echo    TỰ ĐỘNG BIÊN DỊCH VÀ XUẤT FILE APK QUA GITHUB ACTIONS
echo =====================================================================
echo.
echo Bước 1: Mở trình duyệt vào trang: https://github.com/new
echo Bước 2: Tạo một Repository mới (đặt tên ví dụ: oppo-remote, chọn Public hoặc Private đều được)
echo Bước 3: Copy đường link của Repository đó (có đuôi .git)
echo.
echo ---------------------------------------------------------------------
set /p REPO_URL="Dán đường link GitHub Repository của bạn vào đây: "
echo ---------------------------------------------------------------------
echo.

if "%REPO_URL%"=="" (
    echo [Lỗi] Bạn chưa dán link GitHub! Vui lòng thử lại.
    pause
    exit /b
)

echo Đang kết nối và đẩy mã nguồn lên GitHub...
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =====================================================================
    echo  🎉 THÀNH CÔNG! Mã nguồn đã được tải lên GitHub.
    echo =====================================================================
    echo.
    echo BÂY GIỜ BẠN LÀM NHƯ SAU ĐỂ TẢI FILE APK VỀ ĐIỆN THOẠI:
    echo 1. Vào trang GitHub của bạn vừa tạo.
    echo 2. Nhấn vào tab "Actions" ở thanh trên cùng.
    echo 3. Bạn sẽ thấy một tiến trình "Build OPPO Remote Control APK" đang chạy màu vàng.
    echo 4. Chờ khoảng 1-2 phút khi nó chuyển sang màu xanh lá tích chữ V.
    echo 5. Bấm vào tiến trình đó -> Cuộn xuống mục "Artifacts" -> Bấm tải file "OPPO-Remote-Control-APK.zip".
    echo 6. Giải nén trên điện thoại và cài đặt app ngay lập tức!
    echo =====================================================================
) else (
    echo.
    echo [Lỗi] Không thể đẩy code lên GitHub.
    echo Vui lòng kiểm tra lại link Repository và quyền đăng nhập GitHub của bạn.
)

echo.
pause
