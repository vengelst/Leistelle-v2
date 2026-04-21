#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet("check", "push", "deploy", "all", "version", "menu", "server-sync")]
  [string]$Action = "all",
  [ValidateSet("prod", "stage", "custom")]
  [string]$Environment = "prod",
  [string]$Server = "root@vivahome.de",
  [string]$ServerRepoPath = "/opt/leitstelle",
  [string]$RemoteGitUrl = "",
  [string]$ComposeEnvFile = ".env.production",
  [string]$HealthUrl = "http://127.0.0.1:18080/health",
  [string]$Branch = "",
  [string]$Tag = "",
  [string]$Version = "",
  [string]$VersionMessage = "",
  [switch]$RunMigration,
  [switch]$RunSeed,
  [switch]$ConfirmSeed,
  [switch]$RunBackup,
  [switch]$SyncDatabase,
  [switch]$SyncMedia,
  [switch]$AllowProdDatabaseSync,
  [string]$LocalMediaPath = "media",
  [string]$BackupDir = "/opt/leitstelle/backups",
  [switch]$SkipHealthCheck
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$script:InitialBoundParameters = @{} + $PSBoundParameters

function Get-EnvironmentPreset([string]$Name) {
  switch ($Name) {
    "prod" {
      return [PSCustomObject]@{
        Server = "root@leitstelle.vivahome.de"
        ServerRepoPath = "/opt/leitstelle"
        ComposeEnvFile = ".env.production"
        HealthUrl = "http://127.0.0.1:18080/health"
        BackupDir = "/opt/leitstelle/backups"
      }
    }
    "stage" {
      return [PSCustomObject]@{
        Server = "root@stage.vivahome.de"
        ServerRepoPath = "/opt/leitstelle-stage"
        ComposeEnvFile = ".env.stage"
        HealthUrl = "http://127.0.0.1:28080/health"
        BackupDir = "/opt/leitstelle-stage/backups"
      }
    }
    default {
      return $null
    }
  }
}

function Apply-EnvironmentPreset() {
  $preset = Get-EnvironmentPreset $Environment
  if ($null -eq $preset) {
    return
  }

  if (-not $script:InitialBoundParameters.ContainsKey("Server")) {
    $script:Server = $preset.Server
  }
  if (-not $script:InitialBoundParameters.ContainsKey("ServerRepoPath")) {
    $script:ServerRepoPath = $preset.ServerRepoPath
  }
  if (-not $script:InitialBoundParameters.ContainsKey("ComposeEnvFile")) {
    $script:ComposeEnvFile = $preset.ComposeEnvFile
  }
  if (-not $script:InitialBoundParameters.ContainsKey("HealthUrl")) {
    $script:HealthUrl = $preset.HealthUrl
  }
  if (-not $script:InitialBoundParameters.ContainsKey("BackupDir")) {
    $script:BackupDir = $preset.BackupDir
  }
}

Apply-EnvironmentPreset

$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot
$serverMediaPath = "{0}/media" -f $ServerRepoPath.TrimEnd("/")

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

function Get-ParentUnixPath([string]$Path) {
  $normalized = $Path.Trim()
  $lastSlash = $normalized.LastIndexOf("/")
  if ($lastSlash -le 0) {
    return "/"
  }
  return $normalized.Substring(0, $lastSlash)
}

function Get-VersionLabel() {
  if (-not (Test-IsGitRepository)) {
    return "n/a"
  }

  $exactTag = Get-GitOutput @("describe", "--tags", "--exact-match")
  if ($exactTag) {
    return $exactTag
  }

  $latestTag = Get-GitOutput @("describe", "--tags", "--abbrev=0")
  if ($latestTag) {
    return "$latestTag (HEAD abweichend)"
  }

  return "kein Tag"
}

function Show-ScriptHeader([string]$ResolvedAction, [string]$ResolvedTargetType, [string]$ResolvedTargetName) {
  $versionLabel = Get-VersionLabel
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "   Leitstelle Abgleich / Deploy" -ForegroundColor Cyan
  Write-Host ("   Env    : {0}" -f $Environment) -ForegroundColor DarkGray
  Write-Host ("   Action : {0}" -f $ResolvedAction) -ForegroundColor DarkGray
  Write-Host ("   Ziel   : {0} = {1}" -f $ResolvedTargetType, $ResolvedTargetName) -ForegroundColor DarkGray
  Write-Host ("   Server : {0}" -f $Server) -ForegroundColor DarkGray
  Write-Host ("   Repo   : {0}" -f $repoRoot) -ForegroundColor DarkGray
  Write-Host ("   Version: {0}" -f $versionLabel) -ForegroundColor DarkGray
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

function Get-OriginGitUrl() {
  return Get-GitOutput @("remote", "get-url", "origin")
}

function Get-EffectiveRemoteGitUrl() {
  if ($RemoteGitUrl.Trim().Length -gt 0) {
    return $RemoteGitUrl.Trim()
  }

  Ensure-GitRepository
  $originUrl = Get-OriginGitUrl
  if (-not $originUrl) {
    Fail "Git-Remote 'origin' konnte nicht ermittelt werden. Bitte -RemoteGitUrl setzen oder origin konfigurieren."
  }

  return $originUrl
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

  if ($SyncDatabase -and $Environment -eq "custom") {
    Fail "SyncDatabase ist fuer -Environment custom gesperrt. Verwende prod oder stage."
  }

  if ($SyncDatabase -and $Environment -eq "prod" -and -not $AllowProdDatabaseSync) {
    Fail "SyncDatabase nach prod ist gesperrt. Fuer bewusstes Ueberschreiben zusaetzlich -AllowProdDatabaseSync setzen."
  }

  if ($SyncMedia -and $Action -ne "server-sync" -and $Action -ne "menu") {
    Fail "SyncMedia ist nur fuer -Action server-sync (oder interaktiv ueber menu) vorgesehen."
  }

  if ($Environment -eq "custom") {
    $requiredCustomParameters = @("Server", "ServerRepoPath", "ComposeEnvFile", "HealthUrl")
    $missingCustomParameters = @()
    foreach ($parameterName in $requiredCustomParameters) {
      if (-not $script:InitialBoundParameters.ContainsKey($parameterName)) {
        $missingCustomParameters += $parameterName
      }
    }
    if ($missingCustomParameters.Count -gt 0) {
      Fail ("Fuer -Environment custom muessen folgende Parameter explizit gesetzt werden: {0}." -f ($missingCustomParameters -join ", "))
    }

    if ($ComposeEnvFile.Trim() -eq ".env.production") {
      Fail "-Environment custom darf nicht mit .env.production verwendet werden. Fuer Produktion -Environment prod nutzen."
    }
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

function Get-CheckedOutBranchName() {
  $currentBranch = Get-GitOutput @("branch", "--show-current")
  if (-not $currentBranch) {
    Fail "Aktueller lokaler Git-Branch konnte nicht ermittelt werden."
  }
  return $currentBranch
}

function Assert-SelectedBranchMatchesCheckedOut([string]$ContextLabel) {
  if (-not (Test-IsGitRepository)) {
    return
  }

  $selectedBranch = $Branch.Trim()
  if ($selectedBranch.Length -eq 0) {
    return
  }

  $checkedOutBranch = Get-CheckedOutBranchName
  if ($checkedOutBranch -ne $selectedBranch) {
    Fail ("{0}: Ausgewaehlter Branch '{1}' ist lokal nicht ausgecheckt (aktuell: '{2}'). Bitte lokal den passenden Branch auschecken oder im Menue denselben Branch angeben." -f $ContextLabel, $selectedBranch, $checkedOutBranch)
  }
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
  $statusLines = @(Get-WorkingTreeStatusLines)
  if ($statusLines.Count -gt 0) {
    Fail "Arbeitsverzeichnis ist nicht sauber. Bitte erst committen oder aufraeumen."
  }
}

function Get-WorkingTreeStatusLines() {
  $result = Invoke-Captured "git" @("status", "--porcelain")
  if ($result.ExitCode -ne 0) {
    Fail "Git-Status konnte nicht gelesen werden."
  }

  if (-not $result.StdOut) {
    return [string[]]@()
  }

  [string[]]$lines = @($result.StdOut -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
  return $lines
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

function Get-AheadCount() {
  $upstream = Get-UpstreamBranch
  if (-not $upstream) {
    return 0
  }

  $aheadCount = Get-GitOutput @("rev-list", "--count", "$upstream..HEAD")
  if (-not $aheadCount) {
    return 0
  }

  return [int]$aheadCount
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

function Show-GitStatus([switch]$AllowMissingLocalGit) {
  Step "Lokalen Git-Status pruefen"

  $hasLocalGit = Test-IsGitRepository
  if (-not $hasLocalGit) {
    if ((Is-DryRun) -and $AllowMissingLocalGit) {
      Write-WhatIf "Lokales Git-Repository ist im aktuellen Kontext nicht verfuegbar. Vorschau arbeitet mit expliziten Parametern."
      return
    }
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

function Get-LocalDatabaseDumpPath() {
  return Join-Path ([System.IO.Path]::GetTempPath()) "leitstelle-db-transfer.sql.gz"
}

function Get-LocalMediaArchivePath() {
  return Join-Path ([System.IO.Path]::GetTempPath()) "leitstelle-media-transfer.tar.gz"
}

function Resolve-LocalMediaSourcePath() {
  if ([System.IO.Path]::IsPathRooted($LocalMediaPath)) {
    return (Resolve-Path $LocalMediaPath -ErrorAction Stop).Path
  }

  $candidate = Join-Path $repoRoot $LocalMediaPath
  return (Resolve-Path $candidate -ErrorAction Stop).Path
}

function New-LocalMediaTransferArchive() {
  $archivePath = Get-LocalMediaArchivePath
  $sourcePath = Resolve-LocalMediaSourcePath

  if (-not (Test-Path $sourcePath -PathType Container)) {
    Fail ("Lokaler Medienpfad ist kein Verzeichnis: {0}" -f $sourcePath)
  }

  Step "Lokale Medien fuer Servertransfer archivieren"

  if (Is-DryRun) {
    Write-WhatIf "Wuerde den lokalen Medienordner als tar.gz archivieren."
    Write-Info ("Quelle: {0}" -f $sourcePath)
    Write-Info ("Archiv : {0}" -f $archivePath)
    Write-Host ("tar -czf ""{0}"" -C ""{1}"" ." -f $archivePath, $sourcePath) -ForegroundColor DarkGray
    return $archivePath
  }

  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
  }

  Invoke-Checked "tar" @("-czf", $archivePath, "-C", $sourcePath, ".") "Medienarchiv konnte lokal nicht erzeugt werden."
  Write-Info ("Medienarchiv bereit: {0}" -f $archivePath)
  return $archivePath
}

function Get-LocalComposeEnvFile() {
  $localEnvPath = Join-Path $repoRoot ".env"
  if (Test-Path $localEnvPath) {
    return $localEnvPath
  }

  $exampleEnvPath = Join-Path $repoRoot ".env.example"
  if (Test-Path $exampleEnvPath) {
    return $exampleEnvPath
  }

  Fail "Weder .env noch .env.example wurden gefunden. Lokaler DB-Transfer kann nicht vorbereitet werden."
}

function Get-LocalComposeArguments([string[]]$ComposeArguments) {
  $envFile = Get-LocalComposeEnvFile
  return @("compose", "--env-file", $envFile) + $ComposeArguments
}

function Get-RemoteComposeCommand() {
  if ($Environment -eq "stage") {
    return "docker compose -f docker-compose.yml -f docker-compose.stage.yml --env-file '$ComposeEnvFile'"
  }

  return "docker compose --env-file '$ComposeEnvFile'"
}

function Wait-ForLocalDatabaseReady() {
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    $result = Invoke-Captured "docker" (Get-LocalComposeArguments @(
      "exec",
      "-T",
      "db",
      "sh",
      "-lc",
      'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1'
    ))

    if ($result.ExitCode -eq 0) {
      return
    }

    Start-Sleep -Seconds 2
  }

  Fail "Lokale Datenbank ist nicht rechtzeitig bereit geworden."
}

function Get-LocalDatabaseUserCount() {
  $result = Invoke-Captured "docker" (Get-LocalComposeArguments @(
    "exec",
    "-T",
    "db",
    "sh",
    "-lc",
    'export PGPASSWORD="$POSTGRES_PASSWORD"; psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "select count(*) from users;"'
  ))

  if ($result.ExitCode -ne 0) {
    Fail "Benutzeranzahl der lokalen Datenbank konnte nicht ermittelt werden."
  }

  $value = $result.StdOut.Trim()
  if ($value.Length -eq 0) {
    Fail "Benutzeranzahl der lokalen Datenbank ist leer. Bitte lokale DB-Verbindung pruefen."
  }

  return [int]$value
}

function New-LocalDatabaseTransferDump() {
  $localDumpPath = Get-LocalDatabaseDumpPath
  $containerDumpPath = "/tmp/leitstelle-db-transfer.sql.gz"

  Step "Lokale Datenbank fuer Servertransfer sichern"

  if (Is-DryRun) {
    Write-WhatIf "Wuerde den lokalen DB-Container starten, einen Dump erzeugen und als Transferdatei vorbereiten."
    Write-Info "Lokale Befehle:"
    $envFile = Get-LocalComposeEnvFile
    Write-Host ("docker compose --env-file ""{0}"" up -d db" -f $envFile) -ForegroundColor DarkGray
    Write-Host ("docker compose --env-file ""{0}"" exec -T db sh -lc 'export PGPASSWORD=""`$POSTGRES_PASSWORD""; pg_dump -U ""`$POSTGRES_USER"" --format=plain --no-owner --no-privileges ""`$POSTGRES_DB"" | gzip -9 > /tmp/leitstelle-db-transfer.sql.gz'" -f $envFile) -ForegroundColor DarkGray
    Write-Host ("docker cp <db-container>:{0} ""{1}""" -f $containerDumpPath, $localDumpPath) -ForegroundColor DarkGray
    return $localDumpPath
  }

  Invoke-Checked "docker" (Get-LocalComposeArguments @("up", "-d", "db")) "Lokaler DB-Container konnte nicht gestartet werden."
  Wait-ForLocalDatabaseReady

  Invoke-Checked "docker" (Get-LocalComposeArguments @(
    "exec",
    "-T",
    "db",
    "sh",
    "-lc",
    'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" --format=plain --no-owner --no-privileges "$POSTGRES_DB" | gzip -9 > /tmp/leitstelle-db-transfer.sql.gz'
  )) "Lokaler DB-Dump konnte nicht erzeugt werden."

  $containerIdResult = Invoke-Captured "docker" (Get-LocalComposeArguments @("ps", "-q", "db"))
  if ($containerIdResult.ExitCode -ne 0 -or -not $containerIdResult.StdOut) {
    Fail "Lokaler DB-Container konnte nicht ermittelt werden."
  }

  if (Test-Path $localDumpPath) {
    Remove-Item $localDumpPath -Force -ErrorAction SilentlyContinue
  }

  Invoke-Checked "docker" @("cp", ("{0}:{1}" -f $containerIdResult.StdOut, $containerDumpPath), $localDumpPath) "Lokaler DB-Dump konnte nicht kopiert werden."
  Invoke-Captured "docker" (Get-LocalComposeArguments @("exec", "-T", "db", "rm", "-f", $containerDumpPath)) | Out-Null

  Write-Info ("Transfer-Dump bereit: {0}" -f $localDumpPath)
  return $localDumpPath
}

function Push-CurrentBranch() {
  Step "Lokalen Stand nach GitHub pushen"
  $targetBranch = Get-CurrentBranchName

  if (Is-DryRun) {
    if (Test-IsGitRepository) {
      Assert-SelectedBranchMatchesCheckedOut "Push"
      $upstream = Get-UpstreamBranch
      Write-WhatIf ("Wuerde lokalen Branch pushen: {0}" -f $targetBranch)
      Write-Info "Lokaler Befehl:"
      if ($upstream) {
        Write-Host ("git push origin {0}" -f $targetBranch) -ForegroundColor DarkGray
      } else {
        Write-Host ("git push -u origin {0}" -f $targetBranch) -ForegroundColor DarkGray
      }
    } else {
      Write-WhatIf ("Wuerde lokalen Branch pushen: {0}" -f $targetBranch)
      Write-Info "Lokaler Befehl:"
      Write-Host ("git push -u origin {0}" -f $targetBranch) -ForegroundColor DarkGray
    }
    return
  }

  Assert-CleanWorkingTree
  Assert-SelectedBranchMatchesCheckedOut "Push"
  $upstream = Get-UpstreamBranch
  if ($upstream) {
    Invoke-Checked "git" @("push", "origin", $targetBranch) "Git-Push ist fehlgeschlagen."
  } else {
    Invoke-Checked "git" @("push", "-u", "origin", $targetBranch) "Git-Push mit neuem Upstream ist fehlgeschlagen."
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
  $remoteComposeCommand = Get-RemoteComposeCommand
  Step "Server-Deploy ueber Pull-only-Ablauf starten"
  Show-DeployPlan

  if (-not (Is-DryRun)) {
    $hasLocalGit = Test-IsGitRepository

    if ($hasLocalGit) {
      Assert-CleanWorkingTree
      if ($target.Type -eq "branch") {
        Assert-SelectedBranchMatchesCheckedOut "Deploy"
      }
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
if [ ! -f '$ComposeEnvFile' ]; then
  echo 'Env-Datei $ComposeEnvFile fehlt.' >&2
  exit 1
fi
echo 'Backup wird vor dem Deploy ausgefuehrt.'
set -a
. './$ComposeEnvFile'
set +a
unset DATABASE_URL
export PGHOST='127.0.0.1'
export PGPORT="`${POSTGRES_PUBLIC_PORT:-55440}"
export PGUSER="`$POSTGRES_USER"
export PGPASSWORD="`$POSTGRES_PASSWORD"
export PGDATABASE="`$POSTGRES_DB"
BACKUP_DIR='$BackupDir' bash './scripts/backup-postgres.sh'
"@
  } else {
    "echo 'Kein Backup angefordert.'"
  }

  $remoteMigrationCommand = if ($RunMigration) {
    "$remoteComposeCommand run --rm backend sh -lc 'node apps/backend/dist/scripts/migrate.js' </dev/null"
  } else {
    "echo 'Keine Migration angefordert.'"
  }

  $remoteSeedCommand = if ($RunSeed) {
    @"
echo 'WARNUNG: Seed wird explizit ausgefuehrt.'
$remoteComposeCommand run --rm backend sh -lc 'node apps/backend/dist/scripts/seed.js' </dev/null
"@
  } else {
    "echo 'Kein Seed angefordert.'"
  }

  $remoteScript = @"
set -euo pipefail
if [ ! -d '$ServerRepoPath/.git' ]; then
  echo 'Server-Repository fehlt unter $ServerRepoPath. Fuer den Erstlauf bitte den Menuepunkt Serverabgleich oder -Action server-sync verwenden.' >&2
  exit 1
fi
cd '$ServerRepoPath'
if [ ! -f '$ComposeEnvFile' ]; then
  echo 'Env-Datei $ComposeEnvFile fehlt.' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server-Repository enthaelt lokale Aenderungen. Pull-only-Deploy bricht ab.' >&2
  exit 1
fi
git fetch --prune --tags origin
$remoteCheckoutCommand
TARGET_COMMIT=`$(git rev-parse --short HEAD)
echo "Deploy-Ziel: $($target.Type) $($target.Name) (`$TARGET_COMMIT)"
$remoteBackupCommand
echo 'App-Services werden ohne Build-Cache neu gebaut.'
$remoteComposeCommand build --pull --no-cache backend frontend worker
echo 'Optionale Datenbankschritte.'
$remoteMigrationCommand
$remoteSeedCommand
echo 'Compose-Stack wird mit frisch gebauten App-Services aktualisiert.'
$remoteComposeCommand up -d --force-recreate --remove-orphans backend frontend worker
$remoteComposeCommand ps
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

function Invoke-ServerSync() {
  Ensure-GitRepository

  $targetBranch = Get-CurrentBranchName
  $remoteComposeCommand = Get-RemoteComposeCommand
  $effectiveRemoteGitUrl = Get-EffectiveRemoteGitUrl
  $remoteRepoParent = Get-ParentUnixPath $ServerRepoPath
  $remoteBootstrapClonePath = "/tmp/leitstelle-bootstrap-clone"
  $remoteDbDumpPath = "/tmp/leitstelle-db-transfer.sql.gz"
  $remoteDbContainerDumpPath = "/tmp/leitstelle-db-transfer.sql.gz"
  $remoteMediaArchivePath = "/tmp/leitstelle-media-transfer.tar.gz"
  $localDumpPath = $null
  $localMediaArchivePath = $null
  $localUserCount = 0

  Step "Serverabgleich vorbereiten"
  Write-Info ("Branch: {0}" -f $targetBranch)
  Write-Info ("Server: {0}" -f $Server)
  Write-Info ("Remote Git: {0}" -f $effectiveRemoteGitUrl)
  Write-Info ("DB-Transfer: {0}" -f $(if ($SyncDatabase) { "ja" } else { "nein" }))
  Write-Info ("Media-Transfer: {0}" -f $(if ($SyncMedia) { "ja" } else { "nein" }))
  if ($SyncMedia) {
    Write-Info ("Lokaler Medienpfad: {0}" -f $LocalMediaPath)
  }
  if ($SyncDatabase -and $Environment -eq "prod") {
    Write-Info ("PROD-Override freigegeben: {0}" -f $(if ($AllowProdDatabaseSync) { "ja" } else { "nein" }))
  }

  Show-GitStatus
  Assert-SelectedBranchMatchesCheckedOut "Serverabgleich"
  Push-CurrentBranch

  if ($SyncDatabase) {
    $localDumpPath = New-LocalDatabaseTransferDump
    $localUserCount = Get-LocalDatabaseUserCount
    Write-Info ("Lokale Benutzer im Transfer-Dump: {0}" -f $localUserCount)
  }
  if ($SyncMedia) {
    $localMediaArchivePath = New-LocalMediaTransferArchive
  }

  $remoteHealthCommand = if ($SkipHealthCheck) {
    "echo 'Healthcheck uebersprungen.'"
  } else {
    "curl -fsS '$HealthUrl' >/dev/null && echo 'Healthcheck erfolgreich.'"
  }

  $remoteRestoreCommand = if ($SyncDatabase) {
    @"
if [ ! -f '$remoteDbDumpPath' ]; then
  echo 'DB-Transferdatei fehlt auf dem Server.' >&2
  exit 1
fi
if [ ! -f './scripts/backup-postgres.sh' ]; then
  echo 'Backup-Skript ./scripts/backup-postgres.sh fehlt.' >&2
  exit 1
fi
if [ ! -f '$ComposeEnvFile' ]; then
  echo 'Env-Datei $ComposeEnvFile fehlt.' >&2
  exit 1
fi
echo '[db] Sicherung der Server-Datenbank vor Restore.'
set -a
. './$ComposeEnvFile'
set +a
if PGPASSWORD="`$POSTGRES_PASSWORD" pg_isready -h 127.0.0.1 -p "`${POSTGRES_PUBLIC_PORT:-55440}" -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" >/dev/null 2>&1; then
  unset DATABASE_URL
  export PGHOST='127.0.0.1'
  export PGPORT="`${POSTGRES_PUBLIC_PORT:-55440}"
  export PGUSER="`$POSTGRES_USER"
  export PGPASSWORD="`$POSTGRES_PASSWORD"
  export PGDATABASE="`$POSTGRES_DB"
  BACKUP_DIR='$BackupDir' bash './scripts/backup-postgres.sh'
else
  echo '[db] Keine erreichbare bestehende Server-Datenbank gefunden. Backup wird fuer den Erstlauf uebersprungen.'
fi
echo '[db] Starte DB-Container fuer Restore.'
$remoteComposeCommand up -d db
for i in `$(seq 1 30); do
  if $remoteComposeCommand exec -T db sh -lc 'export PGPASSWORD="`$POSTGRES_PASSWORD"; pg_isready -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" >/dev/null 2>&1' </dev/null; then
    break
  fi
  sleep 2
done
DB_CONTAINER_ID=`$($remoteComposeCommand ps -q db)
if [ -z "`$DB_CONTAINER_ID" ]; then
  echo '[db] DB-Container-ID konnte fuer den Restore nicht ermittelt werden.' >&2
  exit 1
fi
echo '[db] Transferdatei wird in den DB-Container kopiert.'
docker cp '$remoteDbDumpPath' "`$DB_CONTAINER_ID:$remoteDbContainerDumpPath"
echo '[db] Ziel-Datenbank wird ersetzt.'
$remoteComposeCommand exec -T db sh -lc 'export PGPASSWORD="`$POSTGRES_PASSWORD"; dropdb --force -U "`$POSTGRES_USER" --if-exists "`$POSTGRES_DB" && createdb -U "`$POSTGRES_USER" "`$POSTGRES_DB"' </dev/null
$remoteComposeCommand exec -T db sh -lc 'export PGPASSWORD="`$POSTGRES_PASSWORD"; gzip -dc "$remoteDbContainerDumpPath" | psql -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" -v ON_ERROR_STOP=1' </dev/null
ACTUAL_USER_COUNT=`$($remoteComposeCommand exec -T db sh -lc 'export PGPASSWORD="`$POSTGRES_PASSWORD"; psql -U "`$POSTGRES_USER" -d "`$POSTGRES_DB" -t -A -c "select count(*) from users;"' </dev/null | tr -d '[:space:]')
if [ -z "`$ACTUAL_USER_COUNT" ]; then
  echo '[db] Benutzeranzahl nach Restore konnte nicht ermittelt werden.' >&2
  exit 1
fi
echo "[db] Benutzer nach Restore: `$ACTUAL_USER_COUNT (Quelle: $localUserCount)"
if [ "$localUserCount" -gt 0 ] && [ "`$ACTUAL_USER_COUNT" -eq 0 ]; then
  echo '[db] Restore hat keine Benutzer auf dem Server hinterlassen, obwohl die Quelle Benutzer enthielt.' >&2
  exit 1
fi
$remoteComposeCommand exec -T db sh -lc 'rm -f "$remoteDbContainerDumpPath"' </dev/null
rm -f '$remoteDbDumpPath'
"@
  } else {
    "echo '[db] Kein Datenbanktransfer angefordert.'"
  }

  $remoteMediaRestoreCommand = if ($SyncMedia) {
    @"
if [ ! -f '$remoteMediaArchivePath' ]; then
  echo '[media] Transferarchiv fehlt auf dem Server.' >&2
  exit 1
fi
echo '[media] Entpacke Medienarchiv nach $serverMediaPath.'
mkdir -p '$serverMediaPath'
tar -xzf '$remoteMediaArchivePath' -C '$serverMediaPath'
rm -f '$remoteMediaArchivePath'
"@
  } else {
    "echo '[media] Kein Medientransfer angefordert.'"
  }

  $remoteMigrationCommand = if ($RunMigration) {
    "$remoteComposeCommand run --rm backend sh -lc 'node apps/backend/dist/scripts/migrate.js' </dev/null"
  } else {
    "echo 'Keine Migration angefordert.'"
  }

  $remoteSeedCommand = if ($RunSeed) {
    @"
echo 'WARNUNG: Seed wird explizit ausgefuehrt.'
$remoteComposeCommand run --rm backend sh -lc 'node apps/backend/dist/scripts/seed.js' </dev/null
"@
  } else {
    "echo 'Kein Seed angefordert.'"
  }

  $remoteScript = @"
set -euo pipefail
mkdir -p '$remoteRepoParent'
mkdir -p '$ServerRepoPath'
if [ ! -d '$ServerRepoPath/.git' ]; then
  echo '[git] Server-Repo fehlt. Initialer Clone wird angelegt.'
  rm -rf '$remoteBootstrapClonePath'
  git clone '$effectiveRemoteGitUrl' '$remoteBootstrapClonePath'
  cp -a '$remoteBootstrapClonePath'/. '$ServerRepoPath'/
  rm -rf '$remoteBootstrapClonePath'
fi
mkdir -p '$serverMediaPath' '$BackupDir'
cd '$ServerRepoPath'
if [ ! -f '$ComposeEnvFile' ]; then
  echo 'Env-Datei $ComposeEnvFile fehlt.' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Server-Repository enthaelt lokale Aenderungen. Serverabgleich bricht ab.' >&2
  exit 1
fi
git remote set-url origin '$effectiveRemoteGitUrl'
git fetch --prune --tags origin
if git show-ref --verify --quiet 'refs/heads/$targetBranch'; then
  git checkout '$targetBranch'
else
  git checkout -b '$targetBranch' --track 'origin/$targetBranch'
fi
git pull --ff-only origin '$targetBranch'
TARGET_COMMIT=`$(git rev-parse --short HEAD)
echo "Server-Ziel: branch $targetBranch (`$TARGET_COMMIT)"
$remoteRestoreCommand
$remoteMediaRestoreCommand
echo 'App-Services werden ohne Build-Cache neu gebaut.'
$remoteComposeCommand build --pull --no-cache backend frontend worker
echo 'Optionale Datenbankschritte nach dem Abgleich.'
$remoteMigrationCommand
$remoteSeedCommand
echo 'Compose-Stack wird mit frisch gebauten App-Services aktualisiert.'
$remoteComposeCommand up -d --force-recreate --remove-orphans backend frontend worker
$remoteComposeCommand ps
$remoteHealthCommand
echo "Serverabgleich abgeschlossen: branch $targetBranch (`$TARGET_COMMIT)"
"@

  if (Is-DryRun) {
    Step "Trockenlauf"
    Write-WhatIf ("Wuerde Branch '{0}' nach GitHub pushen und auf dem Server abgleichen." -f $targetBranch)
    Write-Info "Lokale Befehle in dieser Aktion:"
    Write-Host "git status --short --branch" -ForegroundColor DarkGray
    $upstream = Get-UpstreamBranch
    if ($upstream) {
      Write-Host ("git push origin {0}" -f $targetBranch) -ForegroundColor DarkGray
    } else {
      Write-Host ("git push -u origin {0}" -f $targetBranch) -ForegroundColor DarkGray
    }
    if ($SyncDatabase) {
      $envFile = Get-LocalComposeEnvFile
      Write-Host ("docker compose --env-file ""{0}"" up -d db" -f $envFile) -ForegroundColor DarkGray
      Write-Host ("docker compose --env-file ""{0}"" exec -T db sh -lc 'export PGPASSWORD=""`$POSTGRES_PASSWORD""; pg_dump -U ""`$POSTGRES_USER"" --format=plain --no-owner --no-privileges ""`$POSTGRES_DB"" | gzip -9 > /tmp/leitstelle-db-transfer.sql.gz'" -f $envFile) -ForegroundColor DarkGray
      Write-Host ("scp ""{0}"" ""{1}:{2}""" -f (Get-LocalDatabaseDumpPath), $Server, $remoteDbDumpPath) -ForegroundColor DarkGray
    }
    if ($SyncMedia) {
      Write-Host ("tar -czf ""{0}"" -C ""<lokaler-media-pfad>"" ." -f (Get-LocalMediaArchivePath)) -ForegroundColor DarkGray
      Write-Host ("scp ""{0}"" ""{1}:{2}""" -f (Get-LocalMediaArchivePath), $Server, $remoteMediaArchivePath) -ForegroundColor DarkGray
    }
    Write-Info "Remote-Befehle auf dem Server waeren:"
    Write-Host $remoteScript -ForegroundColor DarkGray
    return
  }

  if ($SyncDatabase) {
    Step "DB-Transferdatei auf den Server kopieren"
    Invoke-Checked "scp" @($localDumpPath, ("{0}:{1}" -f $Server, $remoteDbDumpPath)) "DB-Transferdatei konnte nicht auf den Server kopiert werden."
  }
  if ($SyncMedia) {
    Step "Medienarchiv auf den Server kopieren"
    Invoke-Checked "scp" @($localMediaArchivePath, ("{0}:{1}" -f $Server, $remoteMediaArchivePath)) "Medienarchiv konnte nicht auf den Server kopiert werden."
  }

  Step "Serverabgleich auf dem Server ausfuehren"
  $remoteScript | ssh $Server "bash -s"
  if ($LASTEXITCODE -ne 0) {
    Fail "Serverabgleich ist fehlgeschlagen."
  }

  if ($localDumpPath -and (Test-Path $localDumpPath)) {
    Remove-Item $localDumpPath -Force -ErrorAction SilentlyContinue
  }
  if ($localMediaArchivePath -and (Test-Path $localMediaArchivePath)) {
    Remove-Item $localMediaArchivePath -Force -ErrorAction SilentlyContinue
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
        Show-GitStatus -AllowMissingLocalGit
        Warn "Lokales Git-Repository nicht verfuegbar. Deploy verwendet nur den Remote-Stand fuer den angegebenen Branch oder Tag."
      }
      Invoke-ServerDeploy
    }
    "all" {
      Ensure-GitRepository
      Run-All
    }
    "server-sync" {
      Invoke-ServerSync
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
    $rawValue = Read-Host $Prompt
    if ($null -eq $rawValue) {
      Warn "Eingabe darf nicht leer sein."
      continue
    }

    $value = $rawValue.Trim()
    if ($value.Length -gt 0) {
      return $value
    }
    Warn "Eingabe darf nicht leer sein."
  }
}

function Read-InputOrDefault([string]$Prompt, [string]$DefaultValue) {
  $suffix = if ($DefaultValue.Trim().Length -gt 0) {
    "$Prompt [$DefaultValue]"
  } else {
    $Prompt
  }

  $rawValue = Read-Host $suffix
  if ($null -eq $rawValue) {
    return $DefaultValue
  }

  $value = $rawValue.Trim()
  if ($value.Length -gt 0) {
    return $value
  }

  return $DefaultValue
}

function Read-YesNo([string]$Prompt) {
  $rawAnswer = Read-Host "$Prompt [y/N]"
  if ($null -eq $rawAnswer) {
    return $false
  }

  $answer = $rawAnswer.Trim().ToLowerInvariant()
  return $answer -eq "y" -or $answer -eq "yes" -or $answer -eq "j" -or $answer -eq "ja"
}

function Read-YesNoDefaultYes([string]$Prompt) {
  $rawAnswer = Read-Host "$Prompt [Y/n]"
  if ($null -eq $rawAnswer) {
    return $true
  }

  $answer = $rawAnswer.Trim().ToLowerInvariant()
  if ($answer.Length -eq 0) {
    return $true
  }

  return -not ($answer -eq "n" -or $answer -eq "no" -or $answer -eq "nein")
}

function Read-EnvironmentChoice() {
  $defaultChoice = if ($Environment -eq "custom") { "prod" } else { $Environment }
  while ($true) {
    $selected = Read-InputOrDefault "Umgebung (prod/stage)" $defaultChoice
    switch ($selected.Trim().ToLowerInvariant()) {
      "prod" { return "prod" }
      "stage" { return "stage" }
      "custom" { Warn "custom ist im interaktiven Menue gesperrt. Bitte als CLI-Parameter mit expliziten Werten nutzen." }
      default { Warn "Bitte prod oder stage eingeben." }
    }
  }
}

function Commit-InteractiveLocalChanges() {
  $statusLines = @(Get-WorkingTreeStatusLines)
  if ($statusLines.Count -eq 0) {
    return
  }

  Step "Lokale Aenderungen vorbereiten"
  Invoke-Checked "git" @("status", "--short", "--branch") "Git-Status konnte nicht angezeigt werden."

  if (-not (Read-YesNoDefaultYes "Aenderungen jetzt adden und committen?")) {
    Fail "Arbeitsverzeichnis ist nicht sauber. Vorgang abgebrochen."
  }

  $commitMessage = Read-NonEmptyInput "Commit-Message"
  Invoke-Checked "git" @("add", ".") "git add ist fehlgeschlagen."
  Invoke-Checked "git" @("commit", "-m", $commitMessage) "git commit ist fehlgeschlagen."
}

function Prepare-InteractiveGitAction([switch]$PushBeforeProceeding) {
  Ensure-GitRepository
  Commit-InteractiveLocalChanges
  Assert-SelectedBranchMatchesCheckedOut "Interaktive Aktion"

  if ($PushBeforeProceeding -and (Get-AheadCount) -gt 0) {
    Step "Lokalen Branch vorab nach GitHub pushen"
    if (-not (Read-YesNoDefaultYes "Lokalen Branch jetzt nach GitHub pushen?")) {
      Fail "Fuer diesen Deploy muss der aktuelle Branch zuerst nach GitHub gepusht werden."
    }
    Push-CurrentBranch
  }
}

function Get-InteractiveScriptHost() {
  $pwshCommand = Get-Command "pwsh" -ErrorAction SilentlyContinue
  if ($pwshCommand) {
    return $pwshCommand.Source
  }

  return (Get-Command "powershell" -ErrorAction Stop).Source
}

function Invoke-ScriptSubprocess([string]$ResolvedAction, [hashtable]$AdditionalParameters) {
  $hostPath = Get-InteractiveScriptHost
  $arguments = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-Action", $ResolvedAction,
    "-Environment", $Environment,
    "-Server", $Server,
    "-ServerRepoPath", $ServerRepoPath,
    "-ComposeEnvFile", $ComposeEnvFile,
    "-HealthUrl", $HealthUrl,
    "-BackupDir", $BackupDir
  )

  foreach ($key in $AdditionalParameters.Keys) {
    $value = $AdditionalParameters[$key]
    if ($value -is [bool]) {
      if ($value) {
        $arguments += "-$key"
      }
      continue
    }

    if ($null -eq $value) {
      continue
    }

    $text = [string]$value
    if ($text.Trim().Length -eq 0) {
      continue
    }

    $arguments += "-$key"
    $arguments += $text
  }

  & $hostPath @arguments
  if ($LASTEXITCODE -ne 0) {
    Fail ("Unterprozess fuer Action '{0}' ist fehlgeschlagen." -f $ResolvedAction)
  }
}

function Start-InteractiveMenu() {
  while ($true) {
    Clear-Host
    $gitRepoStatus = if (Test-IsGitRepository) { "ja" } else { "nein" }
    $versionLabel = Get-VersionLabel
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "      LEITSTELLE OPERATIONS MENU" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ("Server      : {0}" -f $Server)
    Write-Host ("Umgebung    : {0}" -f $Environment)
    Write-Host ("Repo-Path   : {0}" -f $ServerRepoPath)
    Write-Host ("Compose Env : {0}" -f $ComposeEnvFile)
    Write-Host ("Git-Repo    : {0}" -f $gitRepoStatus)
    Write-Host ("Version     : {0}" -f $versionLabel)
    Write-Host ""
    Write-Host "1  Git Status anzeigen"
    Write-Host "2  Git Push aktueller Branch"
    Write-Host "3  Deploy Branch"
    Write-Host "4  Deploy Tag"
    Write-Host "5  Alles: Push + Deploy Branch"
    Write-Host "6  Version-Tag erstellen"
    Write-Host "7  Serverabgleich - Push GitHub + SSH + Pull/Bootstrap + optional DB"
    Write-Host "20 Exit"
    Write-Host ""

    $rawChoice = Read-Host "Select option"
    if ($null -eq $rawChoice) {
      return
    }

    $choice = $rawChoice.Trim()
    if ($choice -eq "20") {
      return
    }

    try {
      switch ($choice) {
        "1" {
          Ensure-GitRepository
          Invoke-ScriptSubprocess "check" @{}
          Pause
        }
        "2" {
          $script:Branch = ""
          Prepare-InteractiveGitAction
          Invoke-ScriptSubprocess "push" @{}
          Pause
        }
        "3" {
          $script:Environment = Read-EnvironmentChoice
          Apply-EnvironmentPreset
          $script:Tag = ""
          $script:Branch = Read-InputOrDefault "Branch" "main"
          Prepare-InteractiveGitAction -PushBeforeProceeding
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
          Invoke-ScriptSubprocess "deploy" @{
            Branch = $Branch
            RunBackup = [bool]$RunBackup
            RunMigration = [bool]$RunMigration
            RunSeed = [bool]$RunSeed
            ConfirmSeed = [bool]$ConfirmSeed
            SkipHealthCheck = [bool]$SkipHealthCheck
          }
          Pause
        }
        "4" {
          $script:Environment = Read-EnvironmentChoice
          Apply-EnvironmentPreset
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
          Invoke-ScriptSubprocess "deploy" @{
            Tag = $Tag
            RunBackup = [bool]$RunBackup
            RunMigration = [bool]$RunMigration
            RunSeed = [bool]$RunSeed
            ConfirmSeed = [bool]$ConfirmSeed
            SkipHealthCheck = [bool]$SkipHealthCheck
          }
          Pause
        }
        "5" {
          $script:Environment = Read-EnvironmentChoice
          Apply-EnvironmentPreset
          $script:Tag = ""
          $script:Branch = Read-InputOrDefault "Branch" "main"
          Prepare-InteractiveGitAction
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
          Invoke-ScriptSubprocess "all" @{
            Branch = $Branch
            RunBackup = [bool]$RunBackup
            RunMigration = [bool]$RunMigration
            RunSeed = [bool]$RunSeed
            ConfirmSeed = [bool]$ConfirmSeed
            SkipHealthCheck = [bool]$SkipHealthCheck
          }
          Pause
        }
        "6" {
          $script:Branch = ""
          Prepare-InteractiveGitAction
          $script:Version = Read-NonEmptyInput "Version (z. B. v0.1.0)"
          $rawVersionMessage = Read-Host "Version-Message (leer = Standard)"
          $script:VersionMessage = if ($null -eq $rawVersionMessage) { "" } else { $rawVersionMessage.Trim() }
          Validate-Arguments
          Invoke-ScriptSubprocess "version" @{
            Version = $Version
            VersionMessage = $VersionMessage
          }
          Pause
        }
        "7" {
          $script:Environment = Read-EnvironmentChoice
          Apply-EnvironmentPreset
          $script:Tag = ""
          $script:Branch = Read-InputOrDefault "Branch fuer GitHub und Server" "main"
          Prepare-InteractiveGitAction
          $rawRemoteGitUrl = Read-Host "Remote Git URL (leer = origin)"
          $script:RemoteGitUrl = if ($null -eq $rawRemoteGitUrl) { "" } else { $rawRemoteGitUrl.Trim() }
          $script:RunBackup = $false
          $script:RunMigration = Read-YesNo "Migration nach dem Abgleich ausfuehren?"
          $script:RunSeed = $false
          $script:ConfirmSeed = $false
          if (Read-YesNo "Seed explizit ausfuehren?") {
            $script:RunSeed = $true
            $script:ConfirmSeed = Read-YesNo "Seed-Schutz bestaetigen?"
          }
          $script:SyncDatabase = Read-YesNo "Lokale Datenbank mit Inhalten auf den Server uebertragen?"
          $script:SyncMedia = Read-YesNo "Lokale Medien auf den Server uebertragen?"
          if ($SyncDatabase) {
            $script:RunBackup = $true
            if ($Environment -eq "prod") {
              if (-not (Read-YesNo "WARNUNG: PROD-Datenbank wird ueberschrieben. Wirklich fortfahren?")) {
                Fail "PROD-DB-Transfer vom Benutzer abgebrochen."
              }
              $script:AllowProdDatabaseSync = $true
            } else {
              $script:AllowProdDatabaseSync = $false
            }
          } else {
            $script:AllowProdDatabaseSync = $false
          }
          if ($SyncMedia) {
            $mediaInput = Read-InputOrDefault "Lokaler Medienpfad" $LocalMediaPath
            $script:LocalMediaPath = $mediaInput.Trim()
            if ($script:LocalMediaPath.Length -eq 0) {
              $script:LocalMediaPath = "media"
            }
          }
          $script:SkipHealthCheck = -not (Read-YesNo "Healthcheck nach dem Abgleich ausfuehren?")
          Validate-Arguments
          Invoke-ScriptSubprocess "server-sync" @{
            Branch = $Branch
            RemoteGitUrl = $RemoteGitUrl
            RunBackup = [bool]$RunBackup
            RunMigration = [bool]$RunMigration
            RunSeed = [bool]$RunSeed
            ConfirmSeed = [bool]$ConfirmSeed
            SyncDatabase = [bool]$SyncDatabase
            SyncMedia = [bool]$SyncMedia
            AllowProdDatabaseSync = [bool]$AllowProdDatabaseSync
            LocalMediaPath = $LocalMediaPath
            SkipHealthCheck = [bool]$SkipHealthCheck
          }
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
