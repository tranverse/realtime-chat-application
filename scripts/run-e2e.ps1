$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "compose.e2e.yml"

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

function Wait-ForEndpoint([string]$Url, [string]$Name) {
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                return
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    throw "$Name did not become ready at $Url"
}

Push-Location $projectRoot
try {
    Invoke-Checked "docker" @("compose", "-p", "luma-e2e", "-f", $composeFile, "down", "--volumes", "--remove-orphans")
    Invoke-Checked "docker" @("compose", "-p", "luma-e2e", "-f", $composeFile, "up", "--build", "--detach")
    Wait-ForEndpoint "http://127.0.0.1:18080/actuator/health" "Backend"
    Wait-ForEndpoint "http://127.0.0.1:15173/health" "Frontend"
    Wait-ForEndpoint "http://127.0.0.1:18025/api/v1/messages" "Mailpit"
    Invoke-Checked "npm" @("run", "e2e")
    Invoke-Checked "docker" @("compose", "-p", "luma-e2e", "-f", $composeFile, "run", "--rm", "k6", "run", "/scripts/chat-api.k6.js")
} finally {
    try {
        Invoke-Checked "docker" @("compose", "-p", "luma-e2e", "-f", $composeFile, "down", "--volumes", "--remove-orphans")
    } finally {
        Pop-Location
    }
}
