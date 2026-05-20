$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseDir = Join-Path $root "release"
$buildReleaseDir = Join-Path $root "release-build"
$appDir = Join-Path $buildReleaseDir "Vec3D-win32-x64"
$zipPath = Join-Path $releaseDir "Vec3D-Windows-x64.zip"

Push-Location $root
try {
  npm run pack:win
  if ($LASTEXITCODE -ne 0) {
    throw "npm run pack:win failed with exit code $LASTEXITCODE"
  }
  if (!(Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
  }
  if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -Force
  Write-Host "Created $zipPath"
}
finally {
  Pop-Location
}
