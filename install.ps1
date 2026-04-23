$ErrorActionPreference = 'Stop'
Write-Host "Iniciando instalacao do myTerm..." -ForegroundColor Cyan

# 1. Fetch latest release
$apiUrl = "https://api.github.com/repos/marcelomatz/myterm/releases/latest"
$release = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing

# 2. Find the installer asset
$asset = $release.assets | Where-Object { $_.name -match '-installer\.exe$' } | Select-Object -First 1
if (-not $asset) {
    Write-Error "Instalador nao encontrado na release mais recente."
    exit 1
}

$downloadUrl = $asset.browser_download_url
$tempInstaller = Join-Path $env:TEMP "myterm-installer.exe"

# 3. Download
Write-Host "Baixando myTerm v$($release.tag_name)..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInstaller -UseBasicParsing

# 4. Install
Write-Host "Instalando silenciosamente..." -ForegroundColor Cyan
$process = Start-Process -FilePath $tempInstaller -ArgumentList "/S" -Wait -PassThru -NoNewWindow
if ($process.ExitCode -ne 0) {
    Write-Error "A instalacao falhou com codigo $($process.ExitCode)"
    exit 1
}

# 5. Locate installation and create Desktop Shortcut
$possiblePaths = @(
    Join-Path $env:LOCALAPPDATA "Programs\myTerm\myTerm.exe",
    Join-Path $env:LOCALAPPDATA "Programs\myterm\myterm.exe",
    Join-Path ${env:ProgramFiles(x86)} "myTerm\myTerm.exe",
    Join-Path ${env:ProgramFiles(x86)} "myterm\myterm.exe",
    Join-Path $env:ProgramFiles "myTerm\myTerm.exe",
    Join-Path $env:ProgramFiles "myterm\myterm.exe"
)

$installedPath = ""
foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $installedPath = $p
        break
    }
}

if ($installedPath) {
    Write-Host "Criando atalho na Area de Trabalho..." -ForegroundColor Cyan
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $Shortcut = $WshShell.CreateShortcut( (Join-Path $DesktopPath "myTerm.lnk") )
    $Shortcut.TargetPath = $installedPath
    $Shortcut.Save()
    Write-Host "myTerm instalado com sucesso! ($installedPath)" -ForegroundColor Green
} else {
    Write-Host "myTerm instalado com sucesso, mas o atalho nao pode ser criado automaticamente." -ForegroundColor Yellow
}
