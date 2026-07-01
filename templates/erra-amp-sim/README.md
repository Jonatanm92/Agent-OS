# ERRA Amp Sim (nih-plug)

ERRA-tone guitar amp simulator: tight high-gain, scooped mids, sharp presence, no flub in Drop A. VST3 + CLAP via nih-plug (Rust).

## Build
```bash
cargo xtask bundle erra-amp-sim --release
```

## Signal chain
Input → Noise Gate → 3x Triode (asymmetric) → 4x Oversampled → 5-Band Tonestack → Power Amp → V30 Cabinet FIR → Output
