param([Parameter(Mandatory=$true)][string]$RuntimeRoot, [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ai = Join-Path $repo 'backend/ai-service'
if ($env:DOCUMENT_HWP_BRIDGE_TOKEN.Length -lt 32) { throw 'Set DOCUMENT_HWP_BRIDGE_TOKEN (at least 32 characters)' }
if (!(Test-Path 'Registry::HKEY_CLASSES_ROOT/HWPFrame.HwpObject')) { throw 'Licensed Hangul COM is not registered' }
$env:DOCUMENT_HWP_WORK_ROOT = Join-Path ([System.IO.Path]::GetFullPath($RuntimeRoot)) 'jobs'
$env:DOCUMENT_HWP_COMMAND = Join-Path ([System.IO.Path]::GetFullPath($RuntimeRoot)) 'hwp/Scripts/python.exe'
$env:DOCUMENT_HWP_ARGS = ConvertTo-Json -Compress -InputObject @((Join-Path $ai 'document-tools/windows-worker.py'))
Push-Location $ai
try { & '.venv/Scripts/python.exe' -m uvicorn app.application_preparation.windows_bridge:app --host 127.0.0.1 --port $Port --workers 1 --no-access-log } finally { Pop-Location }
