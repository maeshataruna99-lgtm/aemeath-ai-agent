# Emits one JSON line per poll describing every media session on the system.
# Consumed by src/media-watcher.js. Requires Windows PowerShell 5+ with WinRT.

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

while ($true) {
  $sessions = @()
  try {
    $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    foreach ($session in $manager.GetSessions()) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $sessions += [pscustomobject]@{
        app    = [string]$session.SourceAppUserModelId
        title  = [string]$props.Title
        artist = [string]$props.Artist
        status = [string]$session.PlaybackStatus
      }
    }
  } catch {
    # transient WinRT failure: emit an empty list and keep the heartbeat going
  }
  Write-Output (ConvertTo-Json -Compress -InputObject @($sessions))
  Start-Sleep -Seconds 3
}
