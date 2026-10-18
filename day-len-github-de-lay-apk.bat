@echo off
title Day Ma Nguon Len GitHub De Lay File APK
chcp 65001 >nul
cd /d "%~dp0"

echo =====================================================================
echo    TỰ ĐỘNG BIÊN DỊCH VÀ XUẤT FILE APK QUA GITHUB ACTIONS
echo =====================================================================
echo.
echo Thu muc ma nguon: %CD%
echo Repository:       https://github.com/nguyenbaorzy-alt/oppo-remote.git
echo.
echo Dang kiem tra va day ma nguon len GitHub...
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/nguyenbaorzy-alt/oppo-remote.git
git branch -M main

echo Dang ket noi toi GitHub... Vui long doi vai giay...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =====================================================================
    echo  🎉 THÀNH CÔNG! Toàn bộ mã nguồn đã được tải lên GitHub!
    echo =====================================================================
    echo.
    echo BÂY GIỜ BẠN LÀM NHƯ SAU ĐỂ TẢI FILE APK:
    echo 1. Trình duyệt sẽ tự động mở trang Actions sau 3 giây...
    echo 2. Hoặc bạn vào trực tiếp: https://github.com/nguyenbaorzy-alt/oppo-remote/actions
    echo 3. Bạn sẽ thấy tiến trình "Build OPPO Remote Control APK" đang chạy màu vàng.
    echo 4. Chờ 1-2 phút chuyển sang màu xanh lá tích chữ V.
    echo 5. Bấm vào tiến trình đó -> Cuộn xuống mục "Artifacts" -> Tải file:
    echo    OPPO-Remote-Control-APK.zip
    echo 6. Mở file nén trên điện thoại OPPO và bấm Cài đặt!
    echo =====================================================================
    timeout /t 3 >nul
    start https://github.com/nguyenbaorzy-alt/oppo-remote/actions
) else (
    echo.
    echo =====================================================================
    echo  [LƯU Ý ĐĂNG NHẬP GITHUB]
    echo  Nếu màn hình hiện thông báo đăng nhập hoặc từ chối quyền:
    echo  Hãy đăng nhập tài khoản nguyenbaorzy-alt trên trình duyệt khi được hỏi.
    echo =====================================================================
)

echo.
pause
