$ErrorActionPreference = 'Stop'
$desktop = Resolve-Path 'packaging/desktop/out'
$base = Resolve-Path 'packaging/windows'
$zip = Join-Path $desktop 'Manager-win-x64.zip'
Expand-Archive -LiteralPath $zip -DestinationPath "$env:RUNNER_TEMP/manager-portable"
$app = Get-ChildItem "$env:RUNNER_TEMP/manager-portable" -Filter Manager.exe -Recurse | Select-Object -First 1
if (!$app) { throw 'Portable app is missing' }
Copy-Item -LiteralPath $app.Directory.FullName -Destination "$base/payload" -Recurse
$tool = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
if ($tool) { $compiler = $tool.Source } else { $compiler = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
& $compiler "$base/Manager.iss"
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed' }
function Invoke-Checked($path, $arguments) {
    $process = Start-Process -FilePath $path -ArgumentList $arguments -PassThru
    if (!$process.WaitForExit(65000)) {
        Stop-Process -Id $process.Id -Force
        throw "Timed out: $path"
    }
    if ($process.ExitCode -ne 0) { throw "$path exited with $($process.ExitCode)" }
}
$installer = "$base/out/Manager-win-x64.exe"
$target = Join-Path $env:RUNNER_TEMP 'manager-installed'
$env:MANAGER_SMOKE_PROFILE = Join-Path $env:RUNNER_TEMP 'manager-install-profile'
for ($i = 0; $i -lt 2; $i++) {
    Invoke-Checked $installer @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=$target")
    $env:MANAGER_SMOKE_REOPEN = "$i"
    Invoke-Checked "$target/Manager.exe" @('--manager-smoke')
}
Invoke-Checked $app.FullName @('--manager-smoke')
Copy-Item $zip "$base/out/"
Compress-Archive -Path @("$base/Manager.iss","$base/build-and-check.ps1") -DestinationPath "$base/out/Manager-Windows-Installer-Source.zip"
Write-Host 'Verified installation, repeat installation with saved state and portable launch.'
