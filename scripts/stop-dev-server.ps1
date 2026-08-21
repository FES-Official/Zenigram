$ErrorActionPreference = "Stop"

$project = Resolve-Path (Join-Path $PSScriptRoot "..")
$projectPath = $project.Path

Write-Host "Stopping Linkex dev server..."

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

$portProcesses = @(Get-PortProcessIds)

foreach ($processId in $portProcesses) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$lock = Join-Path $projectPath ".next\dev\lock"
if (Test-Path -LiteralPath $lock) {
  Remove-Item -LiteralPath $lock -Force
}

Write-Host "Stopped. Port 7860 is free for the next start."
