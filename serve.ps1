$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$address = [Net.IPAddress]::Parse("127.0.0.1")
$firstPort = 8765
$lastPort = 8815
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript"
  ".wasm" = "application/wasm"
  ".png"  = "image/png"
  ".gif"  = "image/gif"
  ".mp4"  = "video/mp4"
  ".vtt"  = "text/vtt; charset=utf-8"
  ".swf"  = "application/x-shockwave-flash"
  ".pdf"  = "application/pdf"
  ".map"  = "application/json"
  ".txt"  = "text/plain; charset=utf-8"
}

function Send-ResponseHeader {
  param(
    [IO.Stream]$Stream,
    [string]$Status,
    [string]$ContentType,
    [long]$ContentLength,
    [string[]]$ExtraHeaders = @()
  )
  $lines = @(
    "HTTP/1.1 $Status",
    "Content-Type: $ContentType",
    "Content-Length: $ContentLength",
    "Accept-Ranges: bytes",
    "Cache-Control: no-cache",
    "Connection: close"
  ) + $ExtraHeaders + @("", "")
  $header = [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n"))
  $Stream.Write($header, 0, $header.Length)
}

$listener = $null
$port = $null
foreach ($candidatePort in ($firstPort..$lastPort)) {
  $candidateListener = $null
  try {
    $candidateListener = [Net.Sockets.TcpListener]::new($address, $candidatePort)
    $candidateListener.Start()
    $listener = $candidateListener
    $port = $candidatePort
    break
  } catch {
    if ($null -ne $candidateListener) {
      try { $candidateListener.Stop() } catch { }
    }
  }
}

if ($null -eq $listener) {
  throw "Could not find a free local port between $firstPort and $lastPort."
}

Start-Process "http://127.0.0.1:$port/STUDENT_LESSONS.html"
Write-Host "Waves & Sound STUDENT EDITION is running."
Write-Host "Student lesson menu: http://127.0.0.1:$port/STUDENT_LESSONS.html"
Write-Host "Keep this window open while presenting. Press Ctrl+C to stop."

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      $requestParts = $requestLine.Split(" ")
      $method = $requestParts[0].ToUpperInvariant()
      $target = $requestParts[1]
      $rangeHeader = $null
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
        if ($line.StartsWith("Range:", [StringComparison]::OrdinalIgnoreCase)) {
          $rangeHeader = $line.Substring(6).Trim()
        }
      }

      if ($method -ne "GET" -and $method -ne "HEAD") {
        Send-ResponseHeader $stream "405 Method Not Allowed" "text/plain" 0
        continue
      }

      $uri = [Uri]("http://127.0.0.1" + $target)
      $relative = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
      $candidate = [IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        Send-ResponseHeader $stream "404 Not Found" "text/plain" 0
        continue
      }

      $file = [IO.File]::OpenRead($candidate)
      try {
        $fileLength = $file.Length
        $start = 0L
        $end = $fileLength - 1
        $status = "200 OK"
        $extra = @()

        if ($rangeHeader -match '^bytes=(\d+)-(\d*)$') {
          $start = [long]$Matches[1]
          if ($Matches[2]) { $end = [Math]::Min([long]$Matches[2], $fileLength - 1) }
          if ($start -lt $fileLength -and $end -ge $start) {
            $status = "206 Partial Content"
            $extra = @("Content-Range: bytes $start-$end/$fileLength")
          } else {
            Send-ResponseHeader $stream "416 Range Not Satisfiable" "text/plain" 0 @("Content-Range: bytes */$fileLength")
            continue
          }
        }

        $length = $end - $start + 1
        $extension = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
        $contentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { "application/octet-stream" }
        Send-ResponseHeader $stream $status $contentType $length $extra

        if ($method -eq "GET") {
          [void]$file.Seek($start, [IO.SeekOrigin]::Begin)
          $buffer = New-Object byte[] 65536
          $remaining = $length
          while ($remaining -gt 0) {
            $maxRead = [int][Math]::Min($buffer.Length, $remaining)
            $count = $file.Read($buffer, 0, $maxRead)
            if ($count -le 0) { break }
            $stream.Write($buffer, 0, $count)
            $remaining -= $count
          }
        }
      } finally {
        $file.Dispose()
      }
    } catch {
      Write-Warning $_.Exception.Message
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
