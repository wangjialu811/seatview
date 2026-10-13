$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$runtimePath = Join-Path $projectPath '.runtime'
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$nodePath = (Get-Command node -ErrorAction Stop).Source
$tunnelPath = Join-Path $runtimePath 'cloudflared.exe'
if (!(Test-Path -LiteralPath $tunnelPath)) { throw '缺少 cloudflared.exe，请先安装 Cloudflare 官方工具。' }
function Test-Website($address) {
  try { return (Invoke-WebRequest -Uri $address -TimeoutSec 3).StatusCode -eq 200 } catch { return $false }
}
if (!(Test-Website 'http://127.0.0.1:5178/')) {
  Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'website.log') -RedirectStandardError (Join-Path $runtimePath 'website-error.log')
  Start-Sleep -Seconds 2
}
if (!(Test-Website 'http://127.0.0.1:5179/')) {
  Start-Process -FilePath $nodePath -ArgumentList 'mobile-gateway.cjs' -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimePath 'mobile-gateway.log') -RedirectStandardError (Join-Path $runtimePath 'mobile-gateway-error.log')
  Start-Sleep -Seconds 2
}
if (!(Test-Website 'http://127.0.0.1:5179/')) { throw '网站未成功启动，请查看 .runtime 内的日志。' }
$tunnelLogPath = Join-Path $runtimePath ('tunnel-' + [DateTime]::Now.ToString('yyyyMMddHHmmss') + '.log')
Start-Process -FilePath $tunnelPath -ArgumentList 'tunnel --url http://127.0.0.1:5179 --no-autoupdate --protocol http2' -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardError $tunnelLogPath
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 2
  $logText = Get-Content -LiteralPath $tunnelLogPath -Raw -ErrorAction SilentlyContinue
  if ($logText -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $publicUrl = $Matches[0]
    Set-Content -LiteralPath (Join-Path $runtimePath 'mobile-url.txt') -Value $publicUrl
    Write-Host "手机访问地址：$publicUrl"
    Write-Host '请保持电脑联网、不休眠。重新启动通道后地址会改变。'
    exit 0
  }
}
throw "公网地址未生成，请查看：$tunnelLogPath"
