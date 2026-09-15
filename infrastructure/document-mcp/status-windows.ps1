param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
[pscustomobject]@{
    HangulComRegistered = Test-Path 'Registry::HKEY_CLASSES_ROOT/HWPFrame.HwpObject'
    WorkerPythonPresent = Test-Path (Join-Path $RuntimeRoot 'hwp/Scripts/python.exe')
    ExecutorLocked = Test-Path (Join-Path $RuntimeRoot 'jobs/executor.lock')
    TokenConfigured = $env:DOCUMENT_HWP_BRIDGE_TOKEN.Length -ge 32
}
# Never remove the lock automatically: confirm the owned COM process has exited first.
