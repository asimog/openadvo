# Starts oa-shell against a throwaway workspace, waits for its window, and
# saves a PNG of the window. The shell draws with OpenGL, which PrintWindow
# cannot read, so the window is brought to the front and copied from the
# screen. Nothing may cover it during the capture.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\screenshot-shell.ps1 -Out shots\shell.png
#
# -Seed creates a workspace with a few matters first. -Keep leaves the shell
# and its kernel running after the capture. -Args passes extra arguments to
# oa-shell, for example "--gallery inbox".

param(
    [string]$Out = "target\screenshots\shell.png",
    [int]$WaitSeconds = 6,
    [switch]$Seed,
    [switch]$Keep,
    [string]$Args = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo "target\debug"
$shell = Join-Path $bin "oa-shell.exe"
$oa = Join-Path $bin "oa.exe"
if (-not (Test-Path $shell)) { throw "build first: cargo build -p oa-shell -p oa-cli" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$app = Join-Path $env:TEMP "oa-shot-$stamp\app"
$root = Join-Path $env:TEMP "oa-shot-$stamp\root"
$env:OA_APP_DATA = $app

if ($Seed) {
    & $oa workspace init $root | Out-Null
    foreach ($t in "State v. Rao", "Mehta v. Union of India", "Iyer v. Iyer") {
        & $oa matter create --title $t | Out-Null
    }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
    // The largest visible top-level window of a process whose title contains `title`.
    public static IntPtr Find(uint pid, string title) {
        IntPtr best = IntPtr.Zero; long bestArea = 0;
        EnumWindows((h, l) => {
            uint owner; GetWindowThreadProcessId(h, out owner);
            if (owner != pid || !IsWindowVisible(h)) return true;
            var sb = new System.Text.StringBuilder(256); GetWindowText(h, sb, 256);
            if (!sb.ToString().Contains(title)) return true;
            RECT r; GetWindowRect(h, out r);
            long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
            if (area > bestArea) { bestArea = area; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
"@
Add-Type -AssemblyName System.Drawing
[Win]::SetProcessDPIAware() | Out-Null

$argList = @()
if ($Args) { $argList = $Args.Split(" ") }
$p = if ($argList.Count) { Start-Process $shell -ArgumentList $argList -PassThru } else { Start-Process $shell -PassThru }
$deadline = (Get-Date).AddSeconds($WaitSeconds + 20)
$hwnd = [IntPtr]::Zero
while ($hwnd -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
    $hwnd = [Win]::Find([uint32]$p.Id, "Open Advocate")
}
if ($hwnd -eq [IntPtr]::Zero) { throw "oa-shell opened no window titled 'Open Advocate'" }
Start-Sleep -Seconds $WaitSeconds

[Win]::ShowWindow($hwnd, 5) | Out-Null   # SW_SHOW keeps a maximized window maximized
[Win]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 700
$rect = New-Object Win+RECT
[Win]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$outPath = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $repo $Out }
New-Item -ItemType Directory -Force (Split-Path -Parent $outPath) | Out-Null
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

if (-not $Keep) {
    Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
    Get-Process oa -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $oa } | Stop-Process -ErrorAction SilentlyContinue
}
[pscustomobject]@{ screenshot = $outPath; width = $w; height = $h; app_data = $app } | ConvertTo-Json -Compress
