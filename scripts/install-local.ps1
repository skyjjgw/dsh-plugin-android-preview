param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string]$AdbPath,
    [Parameter(Mandatory = $true)][string]$ScrcpyServer,
    [Parameter(Mandatory = $true)][string]$HarnessRoot,
    [string]$ProfilePath = (Join-Path $env:USERPROFILE '.dsh/profiles/desktop'),
    [string]$BackupRoot,
    [int]$Port = 18772
)

$ErrorActionPreference = 'Stop'
$taskPluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskProfileRoot = [IO.Path]::GetFullPath($ProfilePath)
if (-not $BackupRoot) { $BackupRoot = Join-Path (Split-Path $taskPluginRoot -Parent) 'dsh-plugin-private-backups' }
$taskBackupBase = [IO.Path]::GetFullPath($BackupRoot)
if ($taskBackupBase.StartsWith($taskPluginRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private profile backups must remain outside the plugin repository.' }
$taskProfileManifestPath = Join-Path $taskProfileRoot 'package.json'
$taskProfilePatchPath = Join-Path $taskProfileRoot 'cordis.patch.yml'
$taskSchemaPath = Join-Path $HarnessRoot 'resources/app/dsh/node_modules/@deepseek-ai/schemastery'
foreach ($taskRequired in @($ProjectRoot, $AdbPath, $ScrcpyServer, $taskProfileManifestPath, $taskProfilePatchPath, $taskSchemaPath)) {
    if (-not (Test-Path -LiteralPath $taskRequired)) { throw "Required local resource is missing: $taskRequired" }
}
$taskManifestText = [IO.File]::ReadAllText($taskProfileManifestPath)
$taskPatchText = [IO.File]::ReadAllText($taskProfilePatchPath)
$taskManifest = $taskManifestText | ConvertFrom-Json
$taskPluginName = 'dsh-plugin-android-preview'
if ($taskManifest.dependencies.PSObject.Properties.Name -contains $taskPluginName -or $taskPatchText -match '(?m)^\s*-?\s*id:\s*android-preview\s*$') {
    throw 'An Android preview installation already exists; inspect its configuration before changing it.'
}
$taskLink = Join-Path $taskProfileRoot "node_modules/$taskPluginName"
if (Test-Path -LiteralPath $taskLink) { throw "Plugin path already exists: $taskLink" }

$taskBackup = Join-Path $taskBackupBase ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-android-preview')
New-Item -ItemType Directory -Force -Path $taskBackup | Out-Null
[IO.File]::WriteAllText((Join-Path $taskBackup 'package.json'), $taskManifestText, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $taskBackup 'cordis.patch.yml'), $taskPatchText, [Text.UTF8Encoding]::new($false))

# Reuse the existing SDK peer and keep plugin files on their original drive.
$taskPeerParent = Join-Path $taskPluginRoot 'node_modules/@deepseek-ai'
New-Item -ItemType Directory -Force -Path $taskPeerParent | Out-Null
$taskPeerLink = Join-Path $taskPeerParent 'schemastery'
if (-not (Test-Path -LiteralPath $taskPeerLink)) { New-Item -ItemType Junction -Path $taskPeerLink -Target $taskSchemaPath | Out-Null }
New-Item -ItemType Junction -Path $taskLink -Target $taskPluginRoot | Out-Null

$taskManifest.dependencies | Add-Member -NotePropertyName $taskPluginName -NotePropertyValue ('file:' + $taskPluginRoot.Replace('\', '/'))
$taskManifest.dsh.profile.bundles = @($taskManifest.dsh.profile.bundles) + @($taskPluginName)
$taskConfig = @{ projectRoot = [IO.Path]::GetFullPath($ProjectRoot).Replace('\', '/'); adbPath = [IO.Path]::GetFullPath($AdbPath).Replace('\', '/'); scrcpyServer = [IO.Path]::GetFullPath($ScrcpyServer).Replace('\', '/'); port = $Port; serial = 'emulator-5556'; frameAncestors = @('dsh-app://app') } | ConvertTo-Json -Compress
$taskPatchAppend = "`n# Android preview: local paths only; original settings are preserved above.`n- id: android-preview`n  config: $taskConfig`n"

# Refuse to overwrite a concurrent settings edit made during installation.
if ([IO.File]::ReadAllText($taskProfileManifestPath) -ne $taskManifestText -or [IO.File]::ReadAllText($taskProfilePatchPath) -ne $taskPatchText) {
    throw 'The profile changed during installation. Backups exist; retry after checking the concurrent edit.'
}
[IO.File]::WriteAllText($taskProfilePatchPath, $taskPatchText + $taskPatchAppend, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($taskProfileManifestPath, ($taskManifest | ConvertTo-Json -Depth 80), [Text.UTF8Encoding]::new($false))
Write-Host 'Android preview plugin registered. The running Harness may request a reload for the new package.'
Write-Host "Private settings backup: $taskBackup"
Write-Host "Preview plugin files remain at: $taskPluginRoot"
