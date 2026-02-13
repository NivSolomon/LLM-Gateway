# Fire 6 requests rapidly; the 6th should return 429 Too Many Requests.
# Usage: .\scripts\test-rate-limit.ps1 [-BaseUrl "http://localhost:3000"]

param([string]$BaseUrl = "http://localhost:3000")

$endpoint = "$BaseUrl/api/chat/stream?prompt=hi"
Write-Host "Sending 6 requests to $endpoint..."
Write-Host ""

for ($i = 1; $i -le 6; $i++) {
    Write-Host "Request $i`:"
    try {
        $response = Invoke-WebRequest -Uri $endpoint -Method Get -UseBasicParsing -TimeoutSec 5
        Write-Host "  HTTP $($response.StatusCode)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  HTTP $statusCode"
        if ($i -eq 6 -and $statusCode -eq 429) {
            Write-Host "  OK: 6th request correctly returned 429 Too Many Requests"
        } elseif ($i -eq 6) {
            Write-Host "  FAIL: Expected 429, got $statusCode"
            exit 1
        }
    }
    Write-Host ""
}

Write-Host "Rate limit test passed."
