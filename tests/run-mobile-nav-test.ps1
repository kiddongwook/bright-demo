$ErrorActionPreference = 'Stop'

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$testPage = (Resolve-Path "$PSScriptRoot\mobile-nav-test.html").Path
$testUrl = 'file:///' + ($testPage -replace '\\', '/')
$profile = Join-Path ([System.IO.Path]::GetTempPath()) ("bright-mobile-nav-" + [guid]::NewGuid())

try {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $chrome
  $startInfo.Arguments = "--headless=new --disable-gpu --allow-file-access-from-files --no-first-run --user-data-dir=`"$profile`" --virtual-time-budget=1500 --dump-dom `"$testUrl`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $output = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($process.ExitCode -ne 0) {
    Write-Error $errorOutput
  }

  $result = [regex]::Match($output, '<pre id="result">(?<message>[^<]+)</pre>').Groups['message'].Value
  Write-Output $result
  if (-not $result.StartsWith('PASS:')) { exit 1 }
}
finally {
  if (Test-Path -LiteralPath $profile) {
    Remove-Item -LiteralPath $profile -Recurse -Force
  }
}
