$ErrorActionPreference = 'Stop'
$signingRoot = Join-Path $env:LOCALAPPDATA 'claswee\android-signing'
$configPath = Join-Path $signingRoot 'signing.json'
$keystorePath = Join-Path $signingRoot 'claswee-release.p12'
$passwordPath = Join-Path $signingRoot 'password.dpapi.xml'
$certificatePath = Join-Path $signingRoot 'claswee-release.cer'
$keyAlias = 'claswee-release'
$jdkFolder = Get-ChildItem -LiteralPath 'D:\codex-tools\claswee-android\jdk' -Directory | Select-Object -First 1
if (-not $jdkFolder) { throw 'Portable JDK is missing.' }
$keytoolPath = Join-Path $jdkFolder.FullName 'bin\keytool.exe'
if (Test-Path -LiteralPath $configPath) {
    $existing = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath $existing.keystore) -or -not (Test-Path -LiteralPath $existing.passwordFile)) { throw 'Existing signing configuration is incomplete. Restore it; do not generate another identity.' }
    Write-Output ('Existing release signing identity retained: ' + $existing.keystore)
    exit 0
}
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $passwordPath)) { throw 'Partial signing files already exist. Recover them before continuing.' }
[IO.Directory]::CreateDirectory($signingRoot) | Out-Null
$randomBytes = New-Object byte[] 48
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
$signingPassword = [Convert]::ToBase64String($randomBytes)
$credential = New-Object Management.Automation.PSCredential($keyAlias, (ConvertTo-SecureString $signingPassword -AsPlainText -Force))
$credential | Export-Clixml -LiteralPath $passwordPath
$env:CLASWEE_KEYTOOL_PASSWORD = $signingPassword
try {
    & $keytoolPath -genkeypair -keystore $keystorePath -storetype PKCS12 -alias $keyAlias -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname 'CN=claswee Android Release' -storepass:env CLASWEE_KEYTOOL_PASSWORD -keypass:env CLASWEE_KEYTOOL_PASSWORD -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed. Keep partial signing files for diagnosis.' }
    & $keytoolPath -exportcert -keystore $keystorePath -storetype PKCS12 -alias $keyAlias -file $certificatePath -storepass:env CLASWEE_KEYTOOL_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed.' }
    $config = @{ keystore = $keystorePath; alias = $keyAlias; passwordFile = $passwordPath; certificate = $certificatePath; passwordProtection = 'Windows DPAPI: same Windows user and machine required'; createdAt = [DateTime]::UtcNow.ToString('o') }
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Output ('Release signing identity created: ' + $keystorePath)
    Write-Output 'The private key and DPAPI-protected password are outside the project. No signing secrets are included in store materials.'
} finally {
    Remove-Item Env:CLASWEE_KEYTOOL_PASSWORD -ErrorAction SilentlyContinue
    [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    $signingPassword = $null
    $credential = $null
}
