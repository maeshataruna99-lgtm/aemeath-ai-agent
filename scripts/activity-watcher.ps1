# Emits one JSON line per poll describing the foreground window: its process
# name, executable path and title. Consumed by src/activity/activity-watcher.js
# only while interactive mode is set to medium. Nothing is written to disk.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class AemeathForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  public static string Title(IntPtr hWnd) {
    var builder = new StringBuilder(512);
    GetWindowText(hWnd, builder, builder.Capacity);
    return builder.ToString();
  }

  public static uint ProcessId() {
    IntPtr hWnd = GetForegroundWindow();
    if (hWnd == IntPtr.Zero) return 0;
    uint pid;
    GetWindowThreadProcessId(hWnd, out pid);
    return pid;
  }

  public static string ForegroundTitle() {
    IntPtr hWnd = GetForegroundWindow();
    return hWnd == IntPtr.Zero ? "" : Title(hWnd);
  }
}
"@

while ($true) {
  $sample = [pscustomobject]@{ process = ''; path = ''; title = '' }
  try {
    $id = [AemeathForeground]::ProcessId()
    if ($id -gt 0) {
      $proc = Get-Process -Id $id
      $sample.process = [string]$proc.ProcessName
      $sample.path = [string]$proc.Path
      $sample.title = [AemeathForeground]::ForegroundTitle()
    }
  } catch {
    # a window can vanish between the two calls: emit an empty sample and carry on
  }
  Write-Output (ConvertTo-Json -Compress -InputObject $sample)
  Start-Sleep -Seconds 3
}
