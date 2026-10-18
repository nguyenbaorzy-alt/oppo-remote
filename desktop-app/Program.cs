using System;
using System.IO;
using System.Windows.Forms;

namespace OppoRemoteControl;

static class Program
{
    [STAThread]
    static void Main()
    {
        string logPath = Path.Combine(Path.GetTempPath(), "oppo_app_debug.log");
        try
        {
            File.AppendAllText(logPath, $"[{DateTime.Now}] Starting OppoRemoteControl...\n");
            ApplicationConfiguration.Initialize();
            Application.Run(new Form1());
            File.AppendAllText(logPath, $"[{DateTime.Now}] Exited cleanly.\n");
        }
        catch (Exception ex)
        {
            File.AppendAllText(logPath, $"[{DateTime.Now}] CRASH: {ex}\n");
            MessageBox.Show(ex.ToString(), "Lỗi Ứng Dụng", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }    
}