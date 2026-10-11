$ErrorActionPreference = 'Stop'
$taskMeta = Get-Content -LiteralPath '.collector-dist/latest-exe.json' -Raw | ConvertFrom-Json
$taskExe = [IO.Path]::GetFullPath($taskMeta.executable)
$taskExeDirectory = [IO.Path]::GetDirectoryName($taskExe)
$taskReportFile = Join-Path $taskExeDirectory 'self-test.json'
function Invoke-PackageCheck {
  $taskCheck = Start-Process -FilePath $taskExe -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  $taskReport = Get-Content -LiteralPath $taskReportFile -Raw | ConvertFrom-Json
  return @{ exit=$taskCheck.ExitCode; report=$taskReport }
}
$taskFirst = Invoke-PackageCheck
if ($taskFirst.exit -ne 0 -or $taskFirst.report.runtime -ne 'v24.19.0' -or $taskFirst.report.files_verified -lt 100) { throw 'Executable extraction/runtime check failed.' }
$taskPayload = [IO.Path]::GetFullPath($taskFirst.report.payload_directory)
$taskTestBase = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'CardioAhead-CollectorSelfTest'))
if (-not $taskPayload.StartsWith($taskTestBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected self-test payload location.' }
$taskScript = Join-Path $taskPayload 'scripts/clalit-app.mjs'
$taskOriginal = [IO.File]::ReadAllBytes($taskScript)
try {
  [IO.File]::AppendAllText($taskScript, [Environment]::NewLine + '// fictional integrity check')
  $taskRejected = Invoke-PackageCheck
  if ($taskRejected.exit -eq 0 -or $taskRejected.report.error -ne 'PACKAGE_FILE_CHANGED') { throw 'Modified application bytes were not rejected.' }
} finally { [IO.File]::WriteAllBytes($taskScript,$taskOriginal) }
$taskRestored = Invoke-PackageCheck
if ($taskRestored.exit -ne 0) { throw 'Restored package failed validation.' }
$taskManifest = Get-Content -LiteralPath (Join-Path $taskMeta.payload_root 'manifest.json') -Raw | ConvertFrom-Json
foreach ($taskFile in $taskManifest.files) {
  if ($taskFile.path -match '(^|/)(\.env|\.git|tmp|test-results|state\.json|storage-state\.json|\.codex-remote-attachments)(/|$)' -or $taskFile.path -match 'clalit-remote|clalit-pilot|Start CardioAhead.cmd') { throw 'Unexpected private/development file in executable payload.' }
}
@{ executable_checked=$true; files_verified=$taskRestored.report.files_verified; runtime=$taskRestored.report.runtime; tampered_file_rejected=$true; records_collected=0; browser_opened=$false; unsigned_test_build=$true } | ConvertTo-Json -Compress