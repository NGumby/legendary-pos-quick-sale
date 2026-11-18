# Regression test for output contamination from git pull in a PowerShell function.
# Only loads the Sync-SourceBeforeRelease FUNCTION definition; never executes
# the publish script itself and never contacts Shopify or a remote Git repo.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'publish-pos-version.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath, [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw ('Publish script parse errors: ' + ($parseErrors -join '; ')) }

$definition = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq 'Sync-SourceBeforeRelease'
}, $true)
if ($null -eq $definition) { throw 'Sync-SourceBeforeRelease not found.' }

# Dot-source only the parsed function; the rest of the publisher is inert.
. ([scriptblock]::Create($definition.Extent.Text))

$expectedSha = 'a' * 40
$script:pullCount = 0

function Assert-CleanSource {
    param([switch]$RequireMain)
    return $expectedSha
}
function Resolve-Tool {
    param([string]$Name)
    if ($Name -ne 'git') { throw ('Unexpected command: ' + $Name) }
    return 'git'
}
function git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $global:LASTEXITCODE = 0
    return 'origin/main'
}
function Invoke-Checked {
    param([string]$Title, [string]$Executable, [string[]]$Arguments)
    if ($Executable -ne 'git' -or ($Arguments -join ' ') -ne 'pull --ff-only') {
        throw 'Unexpected command was executed by Sync-SourceBeforeRelease.'
    }
    $script:pullCount++
    # Native git stdout MUST be visible to the user but MUST NOT become part
    # of the function's returned SHA.
    'Already up to date.'
    'Updating tracked files ...'
}

foreach ($requireMain in @($true, $false)) {
    $result = @(Sync-SourceBeforeRelease -RequireMain:$requireMain)
    if ($result.Count -ne 1 -or $result[0] -cne $expectedSha) {
        throw "Git sync returned $($result.Count) items instead of exactly one SHA: $($result -join '|')"
    }
}
if ($script:pullCount -ne 2) { throw 'The mocked Git pull did not run twice.' }
Write-Host 'PASS: Git pull output is not captured in release commit SHA.'
