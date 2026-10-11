param([Parameter(Mandatory=$true)][string]$NodeExecutable)
$ErrorActionPreference = 'Stop'
$taskWorkspace = (Get-Location).Path
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $taskCompiler)) { throw 'Windows .NET Framework compiler not found.' }
$taskSignature = Get-AuthenticodeSignature -LiteralPath $NodeExecutable
if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'OpenJS Foundation') { throw 'Expected a valid OpenJS-signed Node runtime.' }
& node scripts/package-clalit-collector.mjs $NodeExecutable --exe
if ($LASTEXITCODE -ne 0) { throw 'Collector payload failed to build.' }
$taskLatest = Get-Content -LiteralPath '.collector-dist/latest.json' -Raw | ConvertFrom-Json
$taskRoot = [IO.Path]::GetFullPath($taskLatest.root)
$taskBase = [IO.Path]::GetFullPath((Join-Path $taskWorkspace '.collector-dist'))
if (-not $taskRoot.StartsWith($taskBase + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Payload must remain inside the distribution staging directory.' }
$taskZip = Join-Path $taskLatest.output 'payload.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskRoot, $taskZip, [IO.Compression.CompressionLevel]::Optimal, $false)
$taskPayloadHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
$taskManifestHash = (Get-FileHash -LiteralPath (Join-Path $taskRoot 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$taskLauncher = [IO.File]::ReadAllText((Join-Path $taskWorkspace 'scripts/windows/CollectorLauncher.cs')).Replace('__PAYLOAD_SHA256__', $taskPayloadHash).Replace('__MANIFEST_SHA256__', $taskManifestHash)
$taskGenerated = Join-Path $taskLatest.output 'CollectorLauncher.cs'
[IO.File]::WriteAllText($taskGenerated, $taskLauncher, [Text.UTF8Encoding]::new($false))
$taskExe = Join-Path $taskLatest.output 'CardioAhead-Collector.exe'
& $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 ('/out:' + $taskExe) ('/win32manifest:' + (Join-Path $taskWorkspace 'scripts/windows/CollectorLauncher.manifest')) ('/resource:' + $taskZip + ',CardioAhead.Payload.zip') /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Web.Extensions.dll $taskGenerated
if ($LASTEXITCODE -ne 0) { throw 'Executable compilation failed.' }
$taskExeHash = (Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()
$taskSums = Join-Path $taskLatest.output 'SHA256SUMS.txt'
[IO.File]::WriteAllText($taskSums, $taskExeHash + '  CardioAhead-Collector.exe' + "`n", [Text.UTF8Encoding]::new($false))
$taskResult = @{ executable=$taskExe; sha256=$taskExeHash; bytes=(Get-Item -LiteralPath $taskExe).Length; payload_root=$taskRoot; sums=$taskSums; version='0.3.0'; signed=$false }
$taskResult | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $taskBase 'latest-exe.json') -Encoding utf8
$taskResult | ConvertTo-Json -Compress