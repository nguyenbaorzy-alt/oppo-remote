using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OppoRemoteControl;

public partial class Form1 : Form
{
    private WebView2? webView;
    private Process? nodeServerProcess;
    private readonly string serverUrl = "http://localhost:3000";
    private readonly string serverDirectory = @"E:\baitap\oppo-remote-control\server-dashboard";

    public Form1()
    {
        InitializeComponent();
        ConfigureWindow();
        SetAppIcon();
        _ = InitializeWebViewAndServerAsync();
    }

    private void ConfigureWindow()
    {
        Text = "OPPO Remote Control - PC Desktop App (ColorOS & Meizu Flyme)";
        Width = 1420;
        Height = 920;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1000, 680);
        BackColor = Color.FromArgb(10, 15, 29); // Dark Cyberpunk
    }

    private void SetAppIcon()
    {
        try
        {
            using var bmp = new Bitmap(64, 64);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                // Phone body
                using var brush = new SolidBrush(Color.FromArgb(16, 185, 129)); // Emerald
                g.FillRoundedRectangle(brush, 14, 4, 36, 56, 8);

                // Phone screen
                using var screenBrush = new SolidBrush(Color.FromArgb(15, 23, 42)); // Slate dark
                g.FillRoundedRectangle(screenBrush, 17, 8, 30, 48, 4);

                // Signal / WiFi indicator
                using var wifiBrush = new SolidBrush(Color.FromArgb(6, 182, 212)); // Cyan
                g.FillEllipse(wifiBrush, 28, 48, 8, 8);
            }
            Icon = Icon.FromHandle(bmp.GetHicon());
        }
        catch
        {
            // Ignore if icon generation fails
        }
    }

    private async Task InitializeWebViewAndServerAsync()
    {
        // 1. Tự động kiểm tra và khởi động Relay Server nếu chưa chạy
        await EnsureServerRunningAsync();

        // 2. Khởi tạo điều khiển WebView2
        webView = new WebView2
        {
            Dock = DockStyle.Fill
        };
        Controls.Add(webView);

        try
        {
            string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OppoRemoteControl", "WebView2Data");
            Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await webView.EnsureCoreWebView2Async(env);

            // Cấu hình WebView2 cho trải nghiệm Native App
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

            // Mở Bảng điều khiển
            webView.Source = new Uri(serverUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Lỗi khởi tạo giao diện điều khiển (WebView2): {ex.Message}", "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task EnsureServerRunningAsync()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(700) };
        try
        {
            var res = await client.GetAsync(serverUrl);
            if (res.IsSuccessStatusCode)
            {
                // Server đã chạy sẵn từ trước
                return;
            }
        }
        catch
        {
            // Server chưa chạy
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = "server.js",
                WorkingDirectory = serverDirectory,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            nodeServerProcess = Process.Start(psi);

            // Chờ server khởi động xong
            for (int i = 0; i < 15; i++)
            {
                await Task.Delay(350);
                try
                {
                    var res = await client.GetAsync(serverUrl);
                    if (res.IsSuccessStatusCode) break;
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Không thể khởi động server ngầm: {ex.Message}");
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
        try
        {
            if (nodeServerProcess != null && !nodeServerProcess.HasExited)
            {
                nodeServerProcess.Kill();
                nodeServerProcess.Dispose();
            }
        }
        catch { }
    }
}

public static class GraphicsExtensions
{
    public static void FillRoundedRectangle(this Graphics g, Brush brush, int x, int y, int width, int height, int radius)
    {
        using var path = new GraphicsPath();
        path.AddArc(x, y, radius * 2, radius * 2, 180, 90);
        path.AddArc(x + width - 2 * radius, y, radius * 2, radius * 2, 270, 90);
        path.AddArc(x + width - 2 * radius, y + height - 2 * radius, radius * 2, radius * 2, 0, 90);
        path.AddArc(x, y + height - 2 * radius, radius * 2, radius * 2, 90, 90);
        path.CloseFigure();
        g.FillPath(brush, path);
    }
}
