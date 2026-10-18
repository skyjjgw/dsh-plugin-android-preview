param([Parameter(Mandatory = $true)][string]$ProjectRoot)

$ErrorActionPreference = 'Stop'
$taskPreviewRoot = [IO.Path]::GetFullPath($ProjectRoot)
$taskPreviewEnvironment = Join-Path $taskPreviewRoot 'scripts/rolelife/environment.ps1'
$taskPreviewPrepare = Join-Path $taskPreviewRoot 'scripts/rolelife/start-debug-preview.ps1'
foreach ($taskPreviewRequired in @($taskPreviewEnvironment, $taskPreviewPrepare)) {
    if (-not (Test-Path -LiteralPath $taskPreviewRequired -PathType Leaf)) { throw "Missing project preview helper: $taskPreviewRequired" }
}
. $taskPreviewEnvironment
& $taskPreviewPrepare -PrepareOnly 6>$null | Out-Null

# Return only the development toolchain environment, never unrelated API keys.
$taskPreviewKeys = @(
    'PATH', 'TEMP', 'TMP', 'APPDATA', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT',
    'ANDROID_USER_HOME', 'ANDROID_AVD_HOME', 'GRADLE_USER_HOME', 'CARGO_HOME',
    'RUSTUP_HOME', 'CARGO_TARGET_DIR', 'CARGO_BUILD_JOBS', 'CARGO_INCREMENTAL',
    'PUB_CACHE', 'PUB_HOSTED_URL', 'FLUTTER_ROOT', 'FLUTTER_SUPPRESS_ANALYTICS',
    'DART_DISABLE_ANALYTICS', 'OPERIT_LIBCLANG_DIR', 'LIBCLANG_PATH',
    'RUSTFLAGS', 'NODE_PATH', 'COREPACK_HOME', 'COREPACK_ENABLE_DOWNLOAD_PROMPT'
)
$taskPreviewResult = @{}
foreach ($taskPreviewKey in $taskPreviewKeys) {
    $taskPreviewValue = [Environment]::GetEnvironmentVariable($taskPreviewKey, 'Process')
    if ($null -ne $taskPreviewValue) { $taskPreviewResult[$taskPreviewKey] = $taskPreviewValue }
}
$taskPreviewResult | ConvertTo-Json -Compress
