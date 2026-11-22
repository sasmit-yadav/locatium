<#
  Registers a Windows scheduled task "LOCATIUM daily backup" that runs
  run-scheduled-backup.ps1 every day at the given time (default 03:00).

  Run once, from PowerShell, in the backend\scripts folder:
    .\register-daily-backup.ps1
    .\register-daily-backup.ps1 -At '02:30' -Keep 14 -CopyTo 'E:\locatium-backups'

  Remove it later with:
    Unregister-ScheduledTask -TaskName 'LOCATIUM daily backup' -Confirm:$false
#>
param(
  [string]$At = '03:00',
  [int]$Keep = 7,
  [string]$CopyTo = ''
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'run-scheduled-backup.ps1'
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Keep $Keep"
if ($CopyTo) { $taskArgs += " -CopyTo `"$CopyTo`"" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Runs at the next opportunity if the PC was off/asleep at the scheduled time.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName 'LOCATIUM daily backup' -Action $action -Trigger $trigger -Settings $settings -Description 'pg_dump of the LOCATIUM database with rotation' -Force | Out-Null
Write-Host "Scheduled 'LOCATIUM daily backup' every day at $At (keeping $Keep dumps)."
Write-Host "Test it now with: Start-ScheduledTask -TaskName 'LOCATIUM daily backup'"
