$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "compose.e2e.yml"
$dockerConfig = Join-Path $projectRoot ".docker-e2e"
New-Item -ItemType Directory -Force -Path $dockerConfig | Out-Null
$env:DOCKER_CONFIG = $dockerConfig

function Wait-ForEndpoint([string]$Url, [string]$Name) {
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
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
    docker compose -p luma-e2e -f $composeFile down --volumes --remove-orphans
    docker compose -p luma-e2e -f $composeFile up --build --detach
    Wait-ForEndpoint "http://127.0.0.1:18080/actuator/health" "Backend"
    Wait-ForEndpoint "http://127.0.0.1:15173/health" "Frontend"
    Wait-ForEndpoint "http://127.0.0.1:18025/api/v1/messages" "Mailpit"
    npm run e2e
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright failed with exit code $LASTEXITCODE"
    }
    docker compose -p luma-e2e -f $composeFile run --rm k6 run /scripts/chat-api.k6.js
    if ($LASTEXITCODE -ne 0) {
        throw "k6 performance smoke test failed with exit code $LASTEXITCODE"
    }
} finally {
    docker compose -p luma-e2e -f $composeFile down --volumes --remove-orphans
    Pop-Location
}
