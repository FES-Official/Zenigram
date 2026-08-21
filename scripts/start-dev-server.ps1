$ErrorActionPreference = "Stop"

$project = Resolve-Path (Join-Path $PSScriptRoot "..")
$projectPath = $project.Path
$log = Join-Path $projectPath ".manual-server.log"
$errorLog = Join-Path $projectPath ".manual-server.error.log"

Write-Host "Stopping existing Linkex dev server processes..."

$port = 7860

function Get-PortProcessIds {
  $connectionIds = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if ($connectionIds) {
    return $connectionIds
  }

  netstat -ano -p tcp | ForEach-Object {
    if ($_ -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
      [int]$matches[1]
    }
  } | Sort-Object -Unique
}

function Test-PortListener {
  return @(Get-PortProcessIds).Count -gt 0
}

$portProcesses = @(Get-PortProcessIds)

foreach ($processId in $portProcesses) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$lock = Join-Path $projectPath ".next\dev\lock"
if (Test-Path -LiteralPath $lock) {
  Remove-Item -LiteralPath $lock -Force
}

Remove-Item -LiteralPath $log, $errorLog -Force -ErrorAction SilentlyContinue

Write-Host "Starting Linkex on port $port..."

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $projectPath `
  -RedirectStandardOutput $log `
  -RedirectStandardError $errorLog `
  -WindowStyle Hidden

$listener = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $listener = Test-PortListener

  if ($listener) {
    break
  }

  Start-Sleep -Seconds 2
}

if (-not $listener) {
  Write-Host "Server did not start. Error log:"
  if (Test-Path -LiteralPath $errorLog) {
    Get-Content -LiteralPath $errorLog
  }
  exit 1
}

Write-Host "Server is running."
Write-Host "Local:    http://localhost:$port"
Write-Host "Loopback: http://127.0.0.1:$port"

$lanIp = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } |
  Select-Object -First 1 -ExpandProperty IPAddress

if ($lanIp) {
  Write-Host "Network:  http://$lanIp`:$port"
}
