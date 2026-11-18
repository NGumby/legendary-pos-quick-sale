<#
.SYNOPSIS
    Validate, stage, or publish a Legendary POS - Just4Games app version.

.DESCRIPTION
    Run from anywhere; the script operates in its own repository directory.
    Uses the explicit "production" Shopify app configuration for builds and releases.
    Default mode validates only and NEVER creates or releases a version.

.EXAMPLE
    .\publish-pos-version.ps1
    .\publish-pos-version.ps1 -Mode Stage -Version j4g-2026-11-18-01
    .\publish-pos-version.ps1 -Mode Publish -Version j4g-2026-11-18-02

.NOTES
    Requires Node.js 22.12+, npm, Git and Shopify CLI, with Shopify authentication.
    Shopify app deploy creates an app version for config/extensions, not a hosted web server.
#>
[CmdletBinding()]
param(
    [ValidateSet('Validate', 'Stage', 'Publish')]
    [string]$Mode = 'Validate',

    [string]$Version = '',

    [string]$Message = '',

    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Guard against deploying the development app or the wrong merchant app.
$ExpectedProductionClientId = '47a22b6a0f634ce363abd9876b3e8a5d'
$ExpectedProductionName = 'Legendary POS - Just4Games'
$ProductionConfigName = 'production'

function Resolve-Tool {
    param([Parameter(Mandatory = $true)][string]$Name)

    # Windows npm/Shopify supply .cmd shims; these bypass PowerShell's .ps1
    # execution-policy restrictions without weakening the user's policy.
    if ($env:OS -eq 'Windows_NT') {
        $cmd = Get-Command ($Name + '.cmd') -ErrorAction SilentlyContinue
        if ($null -ne $cmd) { return $cmd.Source }
    }
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) {
        throw "$Name is not installed or not in PATH. Install Node.js and Shopify CLI before continuing."
    }
    return $cmd.Source
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$Arguments = @()
    )
    Write-Host ''
    Write-Host ('==> ' + $Title) -ForegroundColor Cyan
    Write-Host ((Split-Path $Executable -Leaf) + ' ' + ($Arguments -join ' '))
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Title failed (exit code $LASTEXITCODE). Release stopped."
    }
}

function Assert-CleanSource {
    param([switch]$RequireMain)

    $git = Resolve-Tool 'git'
    $repositoryRoot = & $git rev-parse --show-toplevel
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
        throw 'A Git checkout is required to stage or publish a reproducible version.'
    }
    $actualRoot = [System.IO.Path]::GetFullPath($repositoryRoot.Trim()).TrimEnd('\', '/')
    $expectedRoot = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
    if (-not [string]::Equals($actualRoot, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The script must be executed from inside the legendary-pos-quick-sale repository.'
    }

    $changes = @(& $git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read Git working tree status.' }
    if ($changes.Count -gt 0) {
        throw 'Git working tree is not clean. Commit or stash changes before creating an app version.'
    }

    $branch = & $git symbolic-ref --quiet --short HEAD
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
        throw 'Publishing/staging requires a named Git branch (not a detached HEAD).'
    }
    if ($RequireMain -and $branch.Trim() -ne 'main') {
        throw "Publishing requires the main branch after PR review/merge. Current branch: $branch"
    }

    $commit = & $git rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[a-f0-9]{40}$') {
        throw 'Could not resolve Git commit SHA.'
    }
    Write-Host ("Source branch: " + $branch.Trim() + "  commit: " + $commit.Substring(0, 12))
    return $commit.Trim()
}

Push-Location -LiteralPath $PSScriptRoot
try {
    $requiredFiles = @(
        'package.json',
        'package-lock.json',
        'shopify.app.toml',
        'shopify.app.production.toml',
        'tests/configurable-quick-sales.test.mjs'
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) {
            throw "Required project file not found: $file"
        }
    }

    $productionToml = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'shopify.app.production.toml') -Raw
    $clientIdMatch = [regex]::Match($productionToml, '(?m)^\s*client_id\s*=\s*"([^"]+)"\s*$')
    $appNameMatch = [regex]::Match($productionToml, '(?m)^\s*name\s*=\s*"([^"]+)"\s*$')
    if (-not $clientIdMatch.Success -or $clientIdMatch.Groups[1].Value -cne $ExpectedProductionClientId) {
        throw 'Production client_id does not match the approved Just4Games app. Refusing to deploy.'
    }
    if (-not $appNameMatch.Success -or $appNameMatch.Groups[1].Value -cne $ExpectedProductionName) {
        throw 'Production app name does not match Legendary POS - Just4Games. Refusing to deploy.'
    }

    $gitCommit = ''
    if ($Mode -ne 'Validate') {
        $gitCommit = Assert-CleanSource -RequireMain:($Mode -eq 'Publish')
    }

    Write-Host 'Legendary POS - Just4Games release checks' -ForegroundColor Cyan
    Write-Host ("Mode: $Mode")
    Write-Host ("Production app: $ExpectedProductionName")
    Write-Host ("Production client_id: $ExpectedProductionClientId")
    Write-Host ("Directory: $PSScriptRoot")

    $node = Resolve-Tool 'node'
    $npm = Resolve-Tool 'npm'
    $shopify = Resolve-Tool 'shopify'

    Invoke-Checked -Title 'Node.js version' -Executable $node -Arguments @('--version')
    Invoke-Checked -Title 'Shopify CLI version' -Executable $shopify -Arguments @('version')

    if (-not $SkipInstall) {
        Invoke-Checked -Title 'Install locked npm dependencies' -Executable $npm -Arguments @('ci')
    }
    else {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules') -PathType Container)) {
            throw '-SkipInstall was requested but node_modules does not exist. Run without -SkipInstall.'
        }
        Write-Host 'Skipping npm ci; using existing node_modules.' -ForegroundColor Yellow
    }

    $testPaths = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'tests') -File -Filter '*.test.mjs' |
        Sort-Object Name | ForEach-Object { $_.FullName })
    if ($testPaths.Count -eq 0) { throw 'No test files found. Refusing to deploy.' }
    $nodeTestArgs = @('--test') + $testPaths
    Invoke-Checked -Title 'Run all POS unit tests' -Executable $node -Arguments $nodeTestArgs

    # Check BOTH app configs. Only the named production config is built/deployed.
    Invoke-Checked -Title 'Validate default Shopify app and all extension configs' -Executable $shopify -Arguments @(
        'app', 'config', 'validate', '--json'
    )
    Invoke-Checked -Title 'Validate production Shopify app and all extension configs' -Executable $shopify -Arguments @(
        'app', 'config', 'validate', '--config', $ProductionConfigName, '--json'
    )
    Invoke-Checked -Title 'Build the production app/extension bundle' -Executable $shopify -Arguments @(
        'app', 'build', '--config', $ProductionConfigName
    )

    # npm/build tools must not silently modify the release source after the
    # first Git check. Re-check before any remote version is created.
    if ($Mode -ne 'Validate') {
        $checkedCommit = Assert-CleanSource -RequireMain:($Mode -eq 'Publish')
        if ($checkedCommit -cne $gitCommit) {
            throw 'Git HEAD changed during validation. Refusing to deploy.'
        }
    }

    if ($Mode -eq 'Validate') {
        Write-Host ''
        Write-Host 'VALIDATED: No Shopify app version was created or released.' -ForegroundColor Green
        return
    }

    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = 'j4g-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
    }
    if ($Version -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
        throw 'Version must be 1-64 characters: letters, digits, periods, underscores or hyphens.'
    }

    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Validated Just4Games POS release $Version; Git $($gitCommit.Substring(0, 12))"
    }
    if ($Message.Length -gt 255) { throw 'Release message must be at most 255 characters.' }

    $deployArgs = @(
        'app', 'deploy',
        '--config', $ProductionConfigName,
        '--version', $Version,
        '--message', $Message,
        '--source-control-url', "https://github.com/NGumby/legendary-pos-quick-sale/commit/$gitCommit"
    )

    if ($Mode -eq 'Stage') {
        # Creates a version but does NOT replace the active production version.
        $deployArgs += '--no-release'
        Invoke-Checked -Title "Stage unreleased Shopify version $Version" -Executable $shopify -Arguments $deployArgs
        Write-Host ''
        Write-Host "STAGED: $Version. NOT active on Just4Games." -ForegroundColor Green
        Write-Host "To activate the staged version after reviewing it: shopify app release --config production --version $Version"
        return
    }

    # This operation affects every store where the production app is installed.
    Write-Host ''
    Write-Host 'PRODUCTION RELEASE WARNING' -ForegroundColor Yellow
    Write-Host "App: $ExpectedProductionName ($ExpectedProductionClientId)"
    Write-Host "New active Shopify version: $Version"
    Write-Host "Git commit: $gitCommit"
    Write-Host 'This will replace the currently active Shopify app version (config and extensions).'
    $expected = "PUBLISH $Version"
    $answer = Read-Host "Type exactly [$expected] to continue"
    if ($answer -cne $expected) {
        throw 'Publication cancelled. No Shopify app version was deployed.'
    }

    # Do not set --allow-deletes, --allow-updates, or --no-input:
    # Shopify CLI must remain free to request its own safety confirmation.
    Invoke-Checked -Title "Deploy and release production Shopify version $Version" -Executable $shopify -Arguments $deployArgs
    Write-Host ''
    Write-Host "PUBLISHED: $Version to $ExpectedProductionName." -ForegroundColor Green
    Write-Host 'Verify the active version in the Shopify Dev Dashboard and smoke-test Shopify POS.'
}
catch {
    Write-Host ''
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    throw
}
finally {
    Pop-Location
}
