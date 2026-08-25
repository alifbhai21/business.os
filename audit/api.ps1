param(
  [Parameter(Mandatory=$true)][string]$Method,
  [Parameter(Mandatory=$true)][string]$Path,
  [string]$Body = '',
  [string]$Token = ''
)
$ErrorActionPreference = 'Stop'
$url = 'http://localhost:4000' + $Path
$headers = @{ 'Content-Type' = 'application/json'; 'Accept' = 'application/json' }
if ($Token) { $headers['Authorization'] = 'Bearer ' + $Token }
$params = @{ Uri = $url; Method = $Method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 90 }
if ($Body) { $params['Body'] = $Body }
try {
  $resp = Invoke-WebRequest @params
  Write-Output ('HTTP ' + [int]$resp.StatusCode)
  Write-Output $resp.Content
} catch {
  $r = $_.Exception.Response
  if ($r) {
    $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    $c = $sr.ReadToEnd()
    Write-Output ('HTTP ' + [int]$r.StatusCode)
    if ($c) { Write-Output $c }
  } else {
    Write-Output ('HTTP 000 ' + $_.Exception.Message)
  }
}