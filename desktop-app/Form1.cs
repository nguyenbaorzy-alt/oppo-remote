using System;
using System.Diagnostics;
using System.Drawing;
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
    private readonly string serverUrl = "http://127.0.0.1:3000";
    private readonly string serverDirectory = @"E:\baitap\oppo-remote-control\server-dashboard";

    public Form1()
    {
        InitializeComponent();
        ConfigureWindow();
    }

    private void Log(string msg)
    {
        try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "oppo_app_debug.log"), $"[{DateTime.Now}] {msg}\n"); } catch {}
    }

    private void ConfigureWindow()
    {
        Text = "OPPO Remote Control - PC Desktop App (ColorOS & Meizu Flyme)";
        Width = 1420;
        Height = 920;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1000, 680);
        BackColor = Color.FromArgb(10, 15, 29);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        Log("OnShown triggered");
        try
        {
            await InitializeAppAsync();
        }
        catch (Exception ex)
        {
            Log($"OnShown error: {ex}");
            MessageBox.Show($"Lỗi khởi động: {ex.Message}", "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task InitializeAppAsync()
    {
        Log("InitializeAppAsync started");
        await EnsureServerRunningAsync();

        Log("Creating WebView2 control...");
        webView = new WebView2
        {
            Dock = DockStyle.Fill
        };
        Controls.Add(webView);
        webView.CreateControl();

        Log("Calling EnsureCoreWebView2Async...");
        try
        {
            await webView.EnsureCoreWebView2Async();
            Log("EnsureCoreWebView2Async succeeded!");

            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

            Log($"Navigating to {serverUrl}...");
            webView.Source = new Uri(serverUrl);
        }
        catch (Exception ex)
        {
            Log($"WebView2 error: {ex}");
            MessageBox.Show($"Lỗi WebView2: {ex.Message}\n\nĐang tự động chuyển hướng mở giao diện qua trình duyệt...", "Thông báo", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
        }
    }

    private async Task EnsureServerRunningAsync()
    {
        Log("Checking server status...");
        using var handler = new SocketsHttpHandler { ConnectTimeout = TimeSpan.FromMilliseconds(500) };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(1) };
        try
        {
            var res = await client.GetAsync(serverUrl);
            if (res.IsSuccessStatusCode)
            {
                Log("Server is already running!");
                return;
            }
        }
        catch
        {
            Log("Server is not responding, starting node server.js...");
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

            for (int i = 0; i < 20; i++)
            {
                await Task.Delay(300);
                try
                {
                    var res = await client.GetAsync(serverUrl);
                    if (res.IsSuccessStatusCode)
                    {
                        Log("Server started successfully!");
                        break;
                    }
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            Log($"Failed to start server process: {ex.Message}");
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
