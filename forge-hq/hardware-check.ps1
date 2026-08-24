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

Write-Host "`nForgeHQ candidates (model file size, not total runtime memory):" -ForegroundColor Cyan
$candidates = @(
    [pscustomobject]@{ Role='Planner'; Model='qwen3.8:27b-q4_K_M'; ModelSizeGB=18; Context='256K' },
    [pscustomobject]@{ Role='Coder'; Model='qwen3-coder:30b'; ModelSizeGB=19; Context='256K' },
    [pscustomobject]@{ Role='Reviewer'; Model='gpt-oss:20b'; ModelSizeGB=14; Context='128K' }
)
$candidates | Format-Table -AutoSize

Write-Host "Fit guidance:" -ForegroundColor Cyan
if ($maxVram -ge 24) {
    Write-Host "- GPU VRAM looks suitable for benchmarking all three candidates one at a time."
} elseif ($maxVram -ge 16) {
    Write-Host "- Start by benchmarking gpt-oss:20b. Qwen 27B/30B may require RAM offload and can be slower."
} elseif ($totalRamGb -ge 32) {
    Write-Host "- Heavy local models may run with CPU/RAM offload, but speed could be poor. Benchmark before switching defaults."
} else {
    Write-Host "- Keep the current smaller local fallback and use hybrid/cloud escalation for heavy jobs unless benchmarks prove otherwise."
}

Write-Host "`nNext command is intentionally NOT run automatically:" -ForegroundColor Yellow
Write-Host "  ollama pull <model>"
Write-Host "Choose one candidate only after reviewing this probe."
