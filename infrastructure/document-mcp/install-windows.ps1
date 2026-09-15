param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ai = Join-Path $repo 'backend/ai-service'
$root = [System.IO.Path]::GetFullPath($RuntimeRoot)
New-Item -ItemType Directory -Force -Path $root | Out-Null
uv venv --python 3.12 (Join-Path $root 'hwp')
if ($LASTEXITCODE -ne 0) { throw 'HWP environment creation failed' }
uv pip sync --python (Join-Path $root 'hwp/Scripts/python.exe') (Join-Path $ai 'document-tools/hwp.lock')
if ($LASTEXITCODE -ne 0) { throw 'HWP dependency installation failed' }
Push-Location $ai
try { uv sync --locked; if ($LASTEXITCODE -ne 0) { throw 'AI bridge dependency installation failed' } } finally { Pop-Location }
Write-Output 'Installation prepared. A licensed Hangul installation and bridge token are required before starting.'
