#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet("check", "push", "deploy", "all", "version", "menu")]
  [string]$Action = "all",
  [string]$Server = "root@vivahome.de",
  [string]$ServerRepoPath = "/srv/leitstelle/repo",
  [string]$ComposeEnvFile = ".env.production",
  [string]$HealthUrl = "http://127.0.0.1:8080/health",
  [string]$Branch = "",
  [string]$Tag = "",
  [string]$Version = "",
  [string]$VersionMessage = "",
  [switch]$RunMigration,
  [switch]$RunSeed,
  [switch]$ConfirmSeed,
  [switch]$RunBackup,
  [string]$BackupDir = "/srv/leitstelle/backups",
  [switch]$SkipHealthCheck
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

function Info([string]$Message) { Write-Host "[INFO]  $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "[ OK ]  $Message" -ForegroundColor Green }
function Warn([string]$Message) { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Err([string]$Message) { Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Pause() {
  Write-Host ""
  Read-Host "Press ENTER to continue" | Out-Null
}
function Step([string]$Message) {
  Write-Host ""
  Info $Message
}

function Write-Info([string]$Message) {
  Write-Host "    $Message"
}

function Write-Warn([string]$Message) {
  Warn $Message
}

function Write-WhatIf([string]$Message) {
  Write-Host "WHATIF: $Message" -ForegroundColor Magenta
}

function Fail([string]$Message) {
  throw $Message
}

function Is-DryRun() {
  return [bool]$WhatIfPreference
}

function Show-ScriptHeader([string]$ResolvedAction, [string]$ResolvedTargetType, [string]$ResolvedTargetName) {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "   Leitstelle Abgleich / Deploy" -ForegroundColor Cyan
  Write-Host ("   Action : {0}" -f $ResolvedAction) -ForegroundColor DarkGray
  Write-Host ("   Ziel   : {0} = {1}" -f $ResolvedTargetType, $ResolvedTargetName) -ForegroundColor DarkGray
  Write-Host ("   Server : {0}" -f $Server) -ForegroundColor DarkGray
  Write-Host ("   Repo   : {0}" -f $repoRoot) -ForegroundColor DarkGray
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
}

function Test-IsGitRepository() {
  return (Get-GitOutput @("rev-parse", "--is-inside-work-tree")) -eq "true"
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$ErrorMessage) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail $ErrorMessage
  }
}

function Invoke-Captured([string]$FilePath, [string[]]$Arguments) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = (($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + $_.Replace('"', '\"') + '"'
    } else {
      $_
    }
  }) -join " ")
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::Start($startInfo)
  $stdOut = $process.StandardOutput.ReadToEnd()
  $stdErr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  return [PSCustomObject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdOut.Trim()
    StdErr = $stdErr.Trim()
  }
}

function Get-GitOutput([string[]]$Arguments) {
  $result = Invoke-Captured "git" $Arguments
  if ($result.ExitCode -ne 0) {
    return $null
  }
  return $result.StdOut
}

function Ensure-GitRepository() {
  if (-not (Test-IsGitRepository)) {
    Fail "Aktuelles Verzeichnis ist kein Git-Repository. Bitte das Skript aus dem geklonten Leitstelle-Repo starten."
  }
}

function Validate-Arguments() {
  if ($Action -eq "version" -and $Version.Trim().Length -eq 0) {
    Fail "Fuer -Action version muss -Version gesetzt sein, z. B. -Version v0.1.0."
  }

  if ($Branch.Trim().Length -gt 0 -and $Tag.Trim().Length -gt 0) {
    Write-Warn "Sowohl -Branch als auch -Tag wurden gesetzt. Der Tag hat Vorrang."
  }

  if ($RunSeed -and -not $ConfirmSeed) {
    Fail "Seed ist zusaetzlich geschuetzt. Verwende -RunSeed nur zusammen mit -ConfirmSeed."
  }

  if ($RunSeed -and -not $RunMigration) {
    Write-Warn "Seed wird ohne Migration ausgefuehrt. Das ist erlaubt, sollte in Produktion aber bewusst sein."
  }
}

function Get-CurrentBranchName() {
  if ($Branch.Trim().Length -gt 0) {
    return $Branch.Trim()
  }

  if (Is-DryRun -and -not (Test-IsGitRepository)) {
    Fail "Ohne lokales Git-Repository muss fuer die Vorschau ein Branch explizit ueber -Branch gesetzt werden."
  }

  $currentBranch = Get-GitOutput @("branch", "--show-current")
  if (-not $currentBranch) {
    Fail "Aktueller Git-Branch konnte nicht ermittelt werden."
  }
  return $currentBranch
}

function Get-UpstreamBranch() {
  return Get-GitOutput @("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
}

function Get-DeployTarget() {
  if ($Tag.Trim().Length -gt 0) {
    return [PSCustomObject]@{
      Type = "tag"
      Name = $Tag.Trim()
    }
  }

  return [PSCustomObject]@{
    Type = "branch"
    Name = Get-CurrentBranchName
  }
}

function Get-HeadCommit() {
  if (-not (Test-IsGitRepository)) {
    if (Is-DryRun) {
      return "dry-run-ohne-lokalen-commit"
    }
    return "remote-only-ohne-lokalen-commit"
  }

  $sha = Get-GitOutput @("rev-parse", "--short", "HEAD")
  if (-not $sha) {
    Fail "Aktueller Commit konnte nicht ermittelt werden."
  }
  return $sha
}

function Assert-CleanWorkingTree() {
  $statusLines = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    Fail "Git-Status konnte nicht gelesen werden."
  }
  if ($statusLines.Count -gt 0) {
    Fail "Arbeitsverzeichnis ist nicht sauber. Bitte erst committen oder aufraeumen."
  }
}

function Assert-NoUnpushedCommits() {
  $upstream = Get-UpstreamBranch
  if (-not $upstream) {
    return
  }

  $aheadCount = Get-GitOutput @("rev-list", "--count", "$upstream..HEAD")
  if ($aheadCount -and [int]$aheadCount -gt 0) {
    Fail "Lokale Commits sind noch nicht nach GitHub gepusht. Bitte erst pushen oder Action=all verwenden."
  }
}

function Assert-RemoteBranchExists([string]$BranchName) {
  $remoteRef = Get-GitOutput @("ls-remote", "--heads", "origin", $BranchName)
  if (-not $remoteRef) {
    Fail "Branch '$BranchName' existiert nicht auf origin."
  }
}

function Assert-RemoteTagExists([string]$TagName) {
  $remoteRef = Get-GitOutput @("ls-remote", "--tags", "origin", "refs/tags/$TagName")
  if (-not $remoteRef) {
    Fail "Tag '$TagName' existiert nicht auf origin."
  }
}

function Assert-TagDoesNotExist([string]$TagName) {
  $localTag = Get-GitOutput @("rev-parse", "--verify", "refs/tags/$TagName")
  if ($localTag) {
    Fail "Tag '$TagName' existiert lokal bereits."
  }

  $remoteRef = Get-GitOutput @("ls-remote", "--tags", "origin", "refs/tags/$TagName")
  if ($remoteRef) {
    Fail "Tag '$TagName' existiert auf origin bereits."
  }
}

function Show-GitStatus() {
  Step "Lokalen Git-Status pruefen"

  if (Is-DryRun -and -not (Test-IsGitRepository)) {
    Write-WhatIf "Lokales Git-Repository ist im aktuellen Kontext nicht verfuegbar. Vorschau arbeitet mit expliziten Parametern."
    return
  }

  if (-not (Test-IsGitRepository)) {
    Fail "Aktuelles Verzeichnis ist kein Git-Repository. Bitte das Skript aus dem geklonten Leitstelle-Repo starten."
  }

  Invoke-Checked "git" @("status", "--short", "--branch") "Git-Status konnte nicht angezeigt werden."

  $upstream = Get-UpstreamBranch
  if ($upstream) {
    Write-Host "Upstream: $upstream"
  } else {
    Write-Host "Upstream: keiner gesetzt"
  }
}

function Show-DeployPlan() {
  $target = Get-DeployTarget
  $currentCommit = Get-HeadCommit

  Step "Deploy-Plan"
  Write-Info ("Zieltyp: {0}" -f $target.Type)
  Write-Info ("Zielname: {0}" -f $target.Name)
  Write-Info ("Lokaler Commit: {0}" -f $currentCommit)
  Write-Info ("Migration: {0}" -f $(if ($RunMigration) { "ja" } else { "nein" }))
  Write-Info ("Seed: {0}" -f $(if ($RunSeed) { "ja" } else { "nein" }))
  Write-Info ("Backup: {0}" -f $(if ($RunBackup) { "ja" } else { "nein" }))
  Write-Info ("Healthcheck: {0}" -f $(if ($SkipHealthCheck) { "uebersprungen" } else { "aktiv" }))
}

function Push-CurrentBranch() {
  Step "Lokalen Stand nach GitHub pushen"

  if (Is-DryRun) {
    if (Test-IsGitRepository) {
      $currentBranch = Get-CurrentBranchName
      $upstream = Get-UpstreamBranch
      Write-WhatIf ("Wuerde lokalen Branch pushen: {0}" -f $currentBranch)
      Write-Info "Lokaler Befehl:"
      if ($upstream) {
        Write-Host "git push" -ForegroundColor DarkGray
      } else {
        Write-Host ("git push -u origin {0}" -f $currentBranch) -ForegroundColor DarkGray
      }
    } else {
      $currentBranch = Get-CurrentBranchName
      Write-WhatIf ("Wuerde lokalen Branch pushen: {0}" -f $currentBranch)
      Write-Info "Lokaler Befehl:"
      Write-Host ("git push -u origin {0}" -f $currentBranch) -ForegroundColor DarkGray
    }
    return
  }

  $currentBranch = Get-CurrentBranchName
  Assert-CleanWorkingTree
  $upstream = Get-UpstreamBranch
  if ($upstream) {
    Invoke-Checked "git" @("push") "Git-Push ist fehlgeschlagen."
  } else {
    Invoke-Checked "git" @("push", "-u", "origin", $currentBranch) "Git-Push mit neuem Upstream ist fehlgeschlagen."
  }
}

function Create-VersionTag() {
  Step "Version-Tag erzeugen"

  $tagName = $Version.Trim()
  if ($tagName -notmatch '^v\d+\.\d+\.\d+([-.][A-Za-z0-9._-]+)?$') {
    Write-Warn "Version '$tagName' weicht vom empfohlenen Schema vX.Y.Z ab."
  }

  $message = $VersionMessage.Trim()
  if ($message.Length -eq 0) {
    $message = "Release $tagName"
  }

  if (Is-DryRun) {
    Write-WhatIf ("Wuerde Git-Tag erzeugen und pushen: {0}" -f $tagName)
    Write-Info "Lokale Befehle:"
    Write-Host ("git tag -a {0} -m ""{1}""" -f $tagName, $message) -ForegroundColor DarkGray
    Write-Host ("git push origin {0}" -f $tagName) -ForegroundColor DarkGray
    return
  }

  Assert-CleanWorkingTree
  Assert-TagDoesNotExist $tagName
  Invoke-Checked "git" @("tag", "-a", $tagName, "-m", $message) "Git-Tag konnte nicht erzeugt werden."
  Invoke-Checked "git" @("push", "origin", $tagName) "Git-Tag konnte nicht nach origin gepusht werden."

  Write-Info ("Tag erstellt und gepusht: {0}" -f $tagName)
}

function Invoke-ServerDeploy() {
  $target = Get-DeployTarget
  Step "Server-Deploy ueber Pull-only-Ablauf starten"
  Show-DeployPlan

  if (-not (Is-DryRun)) {
    $hasLocalGit = Test-IsGitRepository

    if ($hasLocalGit) {
      Assert-CleanWorkingTree
    } else {
      Warn "Lokales Git-Repository nicht verfuegbar. Es wird nur der Remote-Stand verwendet."
    }

    if ($target.Type -eq "branch") {
      if ($hasLocalGit) {
        $currentBranch = Get-CurrentBranchName
        if ($currentBranch -eq $target.Name) {
          Assert-NoUnpushedCommits
        }
      }
      Assert-RemoteBranchExists $target.Name
    } else {
      Assert-RemoteTagExists $target.Name
    }
  }

  $remoteHealthCommand = if ($SkipHealthCheck) {
    "echo 'Healthcheck uebersprungen.'"
  } else {
    "curl -fsS '$HealthUrl' >/dev/null && echo 'Healthcheck erfolgreich.'"
  }

  $remoteCheckoutCommand = if ($target.Type -eq "tag") {
    @"
git checkout --detach 'tags/$($target.Name)'
"@
  } else {
    @"
if git show-ref --verify --quiet 'refs/heads/$($target.Name)'; then
  git checkout '$($target.Name)'
else
  git checkout -b '$($target.Name)' --track 'origin/$($target.Name)'
fi
git pull --ff-only origin '$($target.Name)'
"@
  }

  $remoteBackupCommand = if ($RunBackup) {
    @"
if [ ! -f './scripts/backup-postgres.sh' ]; then
  echo 'Backup-Skript ./scripts/backup-postgres.sh fehlt.' >&2
  exit 1
fi
echo 'Backup wird vor dem Deploy ausgefuehrt.'
BACKUP_DIR='$BackupDir' bash './scripts/backup-postgres.sh'
"@
  } else {
    "echo 'Kein Backup angefordert.'"
  }

  $remoteMigrationCommand = if ($RunMigration) {
    "docker compose --env-file '$ComposeEnvFile' run --rm backend sh -lc 'node apps/backend/dist/scripts/migrate.js'"
  } else {
    "echo 'Keine Migration angefordert.'"
  }

  $remoteSeedCommand = if ($RunSeed) {
    @"
echo 'WARNUNG: Seed wird explizit ausgefuehrt.'
docker compose --env-file '$ComposeEnvFile' run --rm backend sh -lc 'node apps/backend/dist/scripts/seed.js'
"@
  } else {
    "echo 'Kein Seed angefordert.'"
  }

  $remoteScript = @"
set -euo pipefail
cd '$ServerRepoPath'
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server-Repository enthaelt lokale Aenderungen. Pull-only-Deploy bricht ab.' >&2
  exit 1
fi
git fetch --prune --tags origin
$remoteCheckoutCommand
TARGET_COMMIT=`$(git rev-parse --short HEAD)
echo "Deploy-Ziel: $($target.Type) $($target.Name) (`$TARGET_COMMIT)"
$remoteBackupCommand
echo 'Compose-Build startet.'
docker compose --env-file '$ComposeEnvFile' build
echo 'Optionale Datenbankschritte.'
$remoteMigrationCommand
$remoteSeedCommand
echo 'Compose-Stack wird gestartet oder aktualisiert.'
docker compose --env-file '$ComposeEnvFile' up -d
docker compose ps
$remoteHealthCommand
echo "Deploy abgeschlossen: $($target.Type) $($target.Name) (`$TARGET_COMMIT)"
"@

  if (Is-DryRun) {
    Step "Trockenlauf"
    Write-WhatIf ("Wuerde {0} '{1}' deployen." -f $target.Type, $target.Name)
    Write-Info "Lokale Befehle in dieser Aktion:"
    Write-Host "git fetch --prune --tags origin" -ForegroundColor DarkGray
    if ($target.Type -eq "tag") {
      Write-Host ("git checkout --detach tags/{0}" -f $target.Name) -ForegroundColor DarkGray
    } else {
      Write-Host ("git checkout {0}" -f $target.Name) -ForegroundColor DarkGray
      Write-Host ("git pull --ff-only origin {0}" -f $target.Name) -ForegroundColor DarkGray
    }
    Write-Info "Es werden keine Aenderungen gepusht oder per SSH ausgefuehrt."
    Write-Info "Remote-Befehle auf dem Server waeren:"
    Write-Host $remoteScript -ForegroundColor DarkGray
    return
  }

  $remoteScript | ssh $Server "bash -s"
  if ($LASTEXITCODE -ne 0) {
    Fail "Server-Deploy ist fehlgeschlagen."
  }
}

function Run-All() {
  Show-GitStatus
  Push-CurrentBranch
  Invoke-ServerDeploy
}

function Invoke-ConfiguredAction([string]$SelectedAction) {
  switch ($SelectedAction) {
    "check" {
      Ensure-GitRepository
      Show-GitStatus
    }
    "push" {
      Ensure-GitRepository
      Show-GitStatus
      Push-CurrentBranch
    }
    "deploy" {
      if (Test-IsGitRepository) {
        Show-GitStatus
      } else {
        Step "Lokalen Git-Status pruefen"
        Warn "Lokales Git-Repository nicht verfuegbar. Deploy verwendet nur den Remote-Stand fuer den angegebenen Branch oder Tag."
      }
      Invoke-ServerDeploy
    }
    "all" {
      Ensure-GitRepository
      Run-All
    }
    "version" {
      Ensure-GitRepository
      Show-GitStatus
      Create-VersionTag
    }
    default {
      Fail "Unbekannte Action '$SelectedAction'."
    }
  }
}

function Read-NonEmptyInput([string]$Prompt) {
  while ($true) {
    $value = (Read-Host $Prompt).Trim()
    if ($value.Length -gt 0) {
      return $value
    }
    Warn "Eingabe darf nicht leer sein."
  }
}

function Read-YesNo([string]$Prompt) {
  $answer = (Read-Host "$Prompt [y/N]").Trim().ToLowerInvariant()
  return $answer -eq "y" -or $answer -eq "yes" -or $answer -eq "j" -or $answer -eq "ja"
}

function Start-InteractiveMenu() {
  while ($true) {
    Clear-Host
    $gitRepoStatus = if (Test-IsGitRepository) { "ja" } else { "nein" }
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "      LEITSTELLE OPERATIONS MENU" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ("Server      : {0}" -f $Server)
    Write-Host ("Repo-Path   : {0}" -f $ServerRepoPath)
    Write-Host ("Compose Env : {0}" -f $ComposeEnvFile)
    Write-Host ("Git-Repo    : {0}" -f $gitRepoStatus)
    Write-Host ""
    Write-Host "1  Git Status anzeigen"
    Write-Host "2  Git Push aktueller Branch"
    Write-Host "3  Deploy Branch"
    Write-Host "4  Deploy Tag"
    Write-Host "5  Alles: Push + Deploy Branch"
    Write-Host "6  Version-Tag erstellen"
    Write-Host "20 Exit"
    Write-Host ""

    $choice = (Read-Host "Select option").Trim()
    if ($choice -eq "20") {
      return
    }

    try {
      switch ($choice) {
        "1" {
          $script:Action = "check"
          Ensure-GitRepository
          Show-ScriptHeader "check" "branch" $(if ($Branch.Trim().Length -gt 0) { $Branch.Trim() } else { "(auto)" })
          Invoke-ConfiguredAction "check"
          Pause
        }
        "2" {
          $script:Action = "push"
          Ensure-GitRepository
          Show-ScriptHeader "push" "branch" $(if ($Branch.Trim().Length -gt 0) { $Branch.Trim() } else { "(auto)" })
          Invoke-ConfiguredAction "push"
          Pause
        }
        "3" {
          $script:Action = "deploy"
          $script:Tag = ""
          $script:Branch = Read-NonEmptyInput "Branch"
          $script:RunBackup = Read-YesNo "Backup vor Deploy ausfuehren?"
          $script:RunMigration = Read-YesNo "Migration ausfuehren?"
          $script:RunSeed = $false
          $script:ConfirmSeed = $false
          if (Read-YesNo "Seed explizit ausfuehren?") {
            $script:RunSeed = $true
            $script:ConfirmSeed = Read-YesNo "Seed-Schutz bestaetigen?"
          }
          $script:SkipHealthCheck = -not (Read-YesNo "Healthcheck nach Deploy ausfuehren?")
          Validate-Arguments
          Show-ScriptHeader "deploy" "branch" $Branch
          Invoke-ConfiguredAction "deploy"
          Pause
        }
        "4" {
          $script:Action = "deploy"
          $script:Branch = ""
          $script:Tag = Read-NonEmptyInput "Tag"
          $script:RunBackup = Read-YesNo "Backup vor Deploy ausfuehren?"
          $script:RunMigration = Read-YesNo "Migration ausfuehren?"
          $script:RunSeed = $false
          $script:ConfirmSeed = $false
          if (Read-YesNo "Seed explizit ausfuehren?") {
            $script:RunSeed = $true
            $script:ConfirmSeed = Read-YesNo "Seed-Schutz bestaetigen?"
          }
          $script:SkipHealthCheck = -not (Read-YesNo "Healthcheck nach Deploy ausfuehren?")
          Validate-Arguments
          Show-ScriptHeader "deploy" "tag" $Tag
          Invoke-ConfiguredAction "deploy"
          Pause
        }
        "5" {
          $script:Action = "all"
          Ensure-GitRepository
          $script:Tag = ""
          $script:Branch = Read-NonEmptyInput "Branch"
          $script:RunBackup = Read-YesNo "Backup vor Deploy ausfuehren?"
          $script:RunMigration = Read-YesNo "Migration ausfuehren?"
          $script:RunSeed = $false
          $script:ConfirmSeed = $false
          if (Read-YesNo "Seed explizit ausfuehren?") {
            $script:RunSeed = $true
            $script:ConfirmSeed = Read-YesNo "Seed-Schutz bestaetigen?"
          }
          $script:SkipHealthCheck = -not (Read-YesNo "Healthcheck nach Deploy ausfuehren?")
          Validate-Arguments
          Show-ScriptHeader "all" "branch" $Branch
          Invoke-ConfiguredAction "all"
          Pause
        }
        "6" {
          $script:Action = "version"
          Ensure-GitRepository
          $script:Version = Read-NonEmptyInput "Version (z. B. v0.1.0)"
          $script:VersionMessage = (Read-Host "Version-Message (leer = Standard)").Trim()
          Validate-Arguments
          Show-ScriptHeader "version" "branch" $(if ($Branch.Trim().Length -gt 0) { $Branch.Trim() } else { "(auto)" })
          Invoke-ConfiguredAction "version"
          Pause
        }
        default {
          Warn "Ungueltige Auswahl."
          Pause
        }
      }
    } catch {
      Err $_.Exception.Message
      Pause
    }
  }
}

try {
  $startInteractive = $Action -eq "menu" -or ($PSBoundParameters.Count -eq 0 -and -not (Is-DryRun))
  if ($startInteractive) {
    Start-InteractiveMenu
  } else {
    Validate-Arguments

    $resolvedTargetType = if ($Tag.Trim().Length -gt 0) { "tag" } else { "branch" }
    $resolvedTargetName = if ($Tag.Trim().Length -gt 0) {
      $Tag.Trim()
    } elseif ($Branch.Trim().Length -gt 0) {
      $Branch.Trim()
    } else {
      "(auto)"
    }

    Show-ScriptHeader $Action $resolvedTargetType $resolvedTargetName
    Invoke-ConfiguredAction $Action

    Write-Host ""
    Ok "Fertig."
  }
} catch {
  Err $_.Exception.Message
  exit 1
}
