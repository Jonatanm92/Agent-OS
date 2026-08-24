$ErrorActionPreference = 'SilentlyContinue'

Write-Host "ForgeHQ hardware + local model probe" -ForegroundColor Cyan
Write-Host "No models will be downloaded and no settings will be changed.`n"

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$totalRamGb = if ($os.TotalVisibleMemorySize) { [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) } else { $null }

Write-Host "CPU: $($cpu.Name)"
Write-Host "System RAM: $totalRamGb GB"

$nvidia = Get-Command nvidia-smi -ErrorAction SilentlyContinue
$gpuRows = @()
if ($nvidia) {
    $raw = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
    foreach ($line in $raw) {
        if ($line -match '^(.*),\s*([0-9]+)\s*$') {
            $gpuRows += [pscustomobject]@{
                Name = $matches[1].Trim()
                VramGB = [math]::Round(([double]$matches[2]) / 1024, 1)
                Source = 'nvidia-smi'
            }
        }
    }
}

if ($gpuRows.Count -eq 0) {
    Get-CimInstance Win32_VideoController | ForEach-Object {
        $vram = if ($_.AdapterRAM) { [math]::Round(([double]$_.AdapterRAM) / 1GB, 1) } else { $null }
        $gpuRows += [pscustomobject]@{
            Name = $_.Name
            VramGB = $vram
            Source = 'Windows CIM (VRAM can be inaccurate on some GPUs)'
        }
    }
}

Write-Host "`nGPU:"
$gpuRows | Format-Table -AutoSize

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) {
    Write-Host "Ollama: installed ($(& ollama --version 2>$null))"
    Write-Host "`nInstalled Ollama models:"
    & ollama list
} else {
    Write-Host "Ollama: not found on PATH"
}

$maxVram = 0
foreach ($gpu in $gpuRows) {
    if ($gpu.VramGB -and $gpu.VramGB -gt $maxVram) { $maxVram = $gpu.VramGB }
}

Write-Host "`nForgeHQ core candidates (model file size, not total runtime memory):" -ForegroundColor Cyan
$core = @(
    [pscustomobject]@{ Role='Router'; Model='lfm2.5:8b'; ModelSizeGB=5.2; Context='125K' },
    [pscustomobject]@{ Role='Planner'; Model='qwen3:8b'; ModelSizeGB=5.2; Context='40K' },
    [pscustomobject]@{ Role='Coder'; Model='ornith:9b'; ModelSizeGB=5.6; Context='256K' },
    [pscustomobject]@{ Role='Vision'; Model='qwen3-vl:8b'; ModelSizeGB=6.1; Context='256K' }
)
$core | Format-Table -AutoSize

Write-Host "Upgrade candidates:" -ForegroundColor Cyan
$upgrade = @(
    [pscustomobject]@{ Model='qwen3:14b'; ModelSizeGB=9.3; Note='Try only after core models benchmark well' },
    [pscustomobject]@{ Model='gpt-oss:20b'; ModelSizeGB=14; Note='Needs substantial memory headroom' },
    [pscustomobject]@{ Model='qwen3.8:27b-q4_K_M'; ModelSizeGB=18; Note='Stronger hardware tier' },
    [pscustomobject]@{ Model='qwen3-coder:30b'; ModelSizeGB=19; Note='Stronger hardware tier' }
)
$upgrade | Format-Table -AutoSize

Write-Host "Fit guidance:" -ForegroundColor Cyan
if ($maxVram -ge 24 -and $totalRamGb -ge 32) {
    Write-Host "- Core models should be easy benchmark targets; the 18-19GB upgrade tier is also worth testing one at a time."
} elseif ($totalRamGb -ge 16 -or $maxVram -ge 8) {
    Write-Host "- Benchmark lfm2.5:8b and ornith:9b first. They are the preferred ForgeHQ starting pair."
    Write-Host "- Add qwen3:8b for independent planning/review and qwen3-vl:8b only when visual work is useful."
    Write-Host "- Do not make the 14-19GB models defaults until measured speed and memory headroom are acceptable."
} else {
    Write-Host "- Keep the installed small fallback and use hybrid/cloud escalation for heavy jobs unless a core candidate proves usable."
}

Write-Host "`nNext command is intentionally NOT run automatically:" -ForegroundColor Yellow
Write-Host "  ollama pull <model>"
Write-Host "Benchmark one core candidate at a time before installing larger models."
