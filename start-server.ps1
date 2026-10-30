# Smart Maintenance local-only server (no external network, no admin rights).
$ErrorActionPreference = 'Stop'
$site = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'docs\smart-maintenance'))
$rootPrefix = $site.TrimEnd([char]'\') + [System.IO.Path]::DirectorySeparatorChar
$port = 8765
$uri = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$types = @{
 '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
 '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
 '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webp'='image/webp'
}
function Send-Response($stream,[int]$code,[string]$reason,[byte[]]$body,[string]$mime) {
  if ($null -eq $body) { $body = [byte[]]@() }
  $header = "HTTP/1.1 $code $reason`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $hdr = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($hdr,0,$hdr.Length)
  if ($body.Length -gt 0) { $stream.Write($body,0,$body.Length) }
  $stream.Flush()
}
try {
  $listener.Start()
  Write-Host 'Smart Maintenance is running.' -ForegroundColor Green
  Write-Host "Address: $uri"
  Write-Host 'Keep this window open while using the app. Close this window to stop.'
  Start-Process $uri
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 5000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $requestBuffer = New-Object 'System.Byte[]' 16384
      $length = 0
      while ($length -lt $requestBuffer.Length) {
        $read = $stream.Read($requestBuffer,$length,$requestBuffer.Length-$length)
        if ($read -eq 0) { break }
        $length += $read
        $head = [System.Text.Encoding]::ASCII.GetString($requestBuffer,0,$length)
        if ($head.Contains("`r`n`r`n")) { break }
      }
      $first = ([System.Text.Encoding]::ASCII.GetString($requestBuffer,0,$length) -split "`r`n")[0]
      if ($first -notmatch '^GET\s+(\S+)\s+HTTP/1\.[01]$') {
        Send-Response $stream 405 'Method Not Allowed' ([System.Text.Encoding]::UTF8.GetBytes('GET only')) 'text/plain; charset=utf-8'
        continue
      }
      $pathOnly = ($matches[1] -split '\?')[0]
      $decoded = [Uri]::UnescapeDataString($pathOnly)
      if ($decoded -eq '/') { $decoded = '/index.html' }
      $relative = $decoded.TrimStart('/').Replace('/','\')
      $file = [System.IO.Path]::GetFullPath((Join-Path $site $relative))
      if (-not $file.StartsWith($rootPrefix,[System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Response $stream 403 'Forbidden' ([System.Text.Encoding]::UTF8.GetBytes('Forbidden')) 'text/plain; charset=utf-8'
        continue
      }
      $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
      if ((-not $types.ContainsKey($ext)) -or (-not [System.IO.File]::Exists($file))) {
        Send-Response $stream 404 'Not Found' ([System.Text.Encoding]::UTF8.GetBytes('Not found')) 'text/plain; charset=utf-8'
        continue
      }
      $body = [System.IO.File]::ReadAllBytes($file)
      Send-Response $stream 200 'OK' $body $types[$ext]
    } catch {
      Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Yellow
    } finally { if ($null -ne $client) { $client.Close() } }
  }
} catch {
  Write-Host "Failed to start: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "If the port is already used, close the old Smart Maintenance launcher first."
  exit 1
} finally {
  $listener.Stop()
}
