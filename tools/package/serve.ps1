# Tiny static file server using only what ships with Windows (no Node.js needed).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = $null
$port = 0
foreach ($p in 5173..5195) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l; $port = $p
    break
  } catch { }
}
if (-not $listener) {
  Write-Host "Could not find a free port between 5173 and 5195."
  Read-Host "Press Enter to close"
  exit 1
}

$url = "http://localhost:$port/"
Write-Host ""
Write-Host "  KNOCK is running at $url"
Write-Host "  Keep this window open while you play. Close it to quit."
Write-Host ""
if (-not $env:KNOCK_NO_BROWSER) { Start-Process $url }

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json'
  '.jpg' = 'image/jpeg'; '.png' = 'image/png'; '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch { } finally {
    try { $ctx.Response.Close() } catch { }
  }
}
