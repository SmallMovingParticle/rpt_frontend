$ErrorActionPreference = 'Stop'
$dashboardFrontend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dashboardBackend = [IO.Path]::GetFullPath((Join-Path $dashboardFrontend '..\aws_deployed_raush_pt_stride_keap'))
if (-not (Test-Path -LiteralPath (Join-Path $dashboardBackend 'pyproject.toml'))) {
  throw 'Place the companion backend beside rpt_frontend before starting the dashboard.'
}
if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) {
  $dashboardUv = (Get-Command uv -ErrorAction Stop).Source
  Start-Process -FilePath $dashboardUv -ArgumentList @('run','--frozen','uvicorn','rpt_agent.api:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $dashboardBackend -WindowStyle Hidden | Out-Null
}
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c','npm.cmd run dev') -WorkingDirectory $dashboardFrontend -WindowStyle Hidden | Out-Null
}
$dashboardConnected = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $dashboardHealth = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2
    $dashboardPage = Invoke-WebRequest 'http://localhost:3000/login' -UseBasicParsing -TimeoutSec 2
    if ($dashboardHealth.service -eq 'rpt-agent-api' -and $dashboardPage.StatusCode -eq 200) {
      $dashboardConnected = $true
      break
    }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $dashboardConnected) { throw 'Local dashboard startup failed. Check the API and frontend configuration.' }
Write-Output 'Dashboard running: http://localhost:3000'
Write-Output 'API running: http://127.0.0.1:8000 (dashboard only; no outreach or Sheet workers started)'
Write-Output 'Services remain running after this command exits. This does not enable booking or change the database.'
