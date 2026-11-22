param([ValidateSet('debug', 'release')][string]$BuildType = 'debug')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolchainRoot = 'D:\codex-tools\claswee-android'
$jdkFolder = Get-ChildItem -LiteralPath (Join-Path $toolchainRoot 'jdk') -Directory | Select-Object -First 1
if (-not $jdkFolder) { throw 'Portable JDK is missing.' }
$env:JAVA_HOME = $jdkFolder.FullName
$env:ANDROID_HOME = Join-Path $toolchainRoot 'sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $toolchainRoot 'gradle-cache'
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
if ($env:HTTPS_PROXY) {
    $buildProxy = [Uri]$env:HTTPS_PROXY
    if (-not $buildProxy.UserInfo) {
        $env:GRADLE_OPTS = '-Dhttps.proxyHost=' + $buildProxy.Host + ' -Dhttps.proxyPort=' + $buildProxy.Port + ' -Dhttp.proxyHost=' + $buildProxy.Host + ' -Dhttp.proxyPort=' + $buildProxy.Port
    }
}
Push-Location $projectRoot
try {
    if ($BuildType -eq 'release') {
        $signingRoot = Join-Path $env:LOCALAPPDATA 'claswee\android-signing'
        $signingConfigPath = Join-Path $signingRoot 'signing.json'
        if (-not (Test-Path -LiteralPath $signingConfigPath)) { throw 'Release key missing. Run tools/init-release-signing.ps1 first.' }
        $signingConfig = Get-Content -Raw -LiteralPath $signingConfigPath | ConvertFrom-Json
        $signingCredential = Import-Clixml -LiteralPath $signingConfig.passwordFile
        $env:CLASWEE_RELEASE_KEYSTORE = $signingConfig.keystore
        $env:CLASWEE_RELEASE_KEY_ALIAS = $signingConfig.alias
        $env:CLASWEE_RELEASE_STORE_PASSWORD = $signingCredential.GetNetworkCredential().Password
    }
    & npm.cmd run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    $sdkPath = $env:ANDROID_HOME.Replace('\', '/')
    [IO.File]::WriteAllText((Join-Path $projectRoot 'android\local.properties'), ('sdk.dir=' + $sdkPath), [Text.Encoding]::ASCII)
    Push-Location (Join-Path $projectRoot 'android')
    try {
        $portableGradle = Join-Path $toolchainRoot 'gradle\gradle-8.14.3\bin\gradle.bat'
        $assembleTask = if ($BuildType -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
        if (Test-Path -LiteralPath $portableGradle) { & $portableGradle $assembleTask --console=plain --no-daemon }
        else { & .\gradlew.bat $assembleTask --console=plain --no-daemon }
        if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    } finally { Pop-Location }
    $appVersion = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json).version
    $artifactSuffix = if ($BuildType -eq 'release') { '-release' } else { '' }
    $artifactPath = Join-Path $projectRoot ('artifacts\claswee-android-' + $appVersion + $artifactSuffix + '.apk')
    New-Item -ItemType Directory -Path (Split-Path -Parent $artifactPath) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot ('android\app\build\outputs\apk\' + $BuildType + '\app-' + $BuildType + '.apk')) -Destination $artifactPath -Force
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $digest = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($artifactPath))).Replace('-', '')
        Write-Output ('SHA256: ' + $digest)
        Write-Output ('APK: ' + $artifactPath)
    } finally { $hasher.Dispose() }
} finally {
    if ($BuildType -eq 'release') {
        Remove-Item Env:CLASWEE_RELEASE_STORE_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item Env:CLASWEE_RELEASE_KEYSTORE -ErrorAction SilentlyContinue
        Remove-Item Env:CLASWEE_RELEASE_KEY_ALIAS -ErrorAction SilentlyContinue
        $signingCredential = $null
    }
    Pop-Location
}
