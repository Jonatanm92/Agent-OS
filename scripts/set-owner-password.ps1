[CmdletBinding()]
param(
  [switch]$Clear
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Clear) {
  Remove-Item Env:AGENT_OS_PASSWORD -ErrorAction SilentlyContinue
  Write-Host 'AGENT_OS_PASSWORD was removed from this PowerShell process.' -ForegroundColor Yellow
  return
}

$securePassword = Read-Host 'Choose the local Agent OS owner password (minimum 16 characters)' -AsSecureString
$pointer = [IntPtr]::Zero
$plainPassword = $null

try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

  if ([string]::IsNullOrWhiteSpace($plainPassword) -or $plainPassword.Length -lt 16) {
    throw 'Owner password must contain at least 16 characters.'
  }
  if ($plainPassword -match '[\r\n\0]') {
    throw 'Owner password cannot contain line breaks or null characters.'
  }

  # Environment variables are process-scoped. The value remains available to
  # child processes started from this PowerShell window but is not written to Git,
  # the repository, PowerShell history, or a persistent user/machine environment.
  $env:AGENT_OS_PASSWORD = $plainPassword

  Write-Host ''
  Write-Host 'Owner gate enabled for this PowerShell process.' -ForegroundColor Green
  Write-Host 'Start Agent OS from this same PowerShell window.'
  Write-Host 'The browser will request this password once and store the returned token locally.'
  Write-Host 'Close the PowerShell window or run this script with -Clear to remove the process value.'
} finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $plainPassword = $null
  Remove-Variable securePassword, pointer, plainPassword -ErrorAction SilentlyContinue
}
