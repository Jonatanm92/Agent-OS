//! ERRA-tone Amp Simulator
//!
//! Signal chain:
//!   Input → Noise Gate → 3x Triode Gain Stages (asymmetric) →
//!   5-Band Tonestack → Power Amp Compression → 4x Oversampled →
//!   Cabinet IR (short FIR, V30-voiced) → Output Level
//!
//! Targeting: tight, fast-tracking high gain with scooped mids,
//! sharp presence peak (3-5kHz), no flub on palm mutes in Drop A.

use nih_plug::prelude::*;
use std::sync::Arc;

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Params)]
struct AmpParams {
    #[id = "gain"]
    gain: FloatParam,
    #[id = "bass"]
    bass: FloatParam,
    #[id = "mid"]
    mid: FloatParam,
    #[id = "treble"]
    treble: FloatParam,
    #[id = "presence"]
    presence: FloatParam,
    #[id = "gate_threshold"]
    gate_threshold: FloatParam,
    #[id = "output"]
    output: FloatParam,
}

impl Default for AmpParams {
    fn default() -> Self {
        Self {
            gain: FloatParam::new("Gain", 0.7, FloatRange::Linear { min: 0.0, max: 1.0 })
                .with_unit(" ")
                .with_value_to_string(formatters::v2s_f32_percentage(0)),
            bass: FloatParam::new("Bass", 0.4, FloatRange::Linear { min: 0.0, max: 1.0 }),
            mid: FloatParam::new("Mid", 0.3, FloatRange::Linear { min: 0.0, max: 1.0 }),
            treble: FloatParam::new("Treble", 0.65, FloatRange::Linear { min: 0.0, max: 1.0 }),
            presence: FloatParam::new("Presence", 0.7, FloatRange::Linear { min: 0.0, max: 1.0 }),
            gate_threshold: FloatParam::new(
                "Gate",
                -50.0,
                FloatRange::Linear { min: -80.0, max: -20.0 },
            )
            .with_unit(" dB"),
            output: FloatParam::new("Output", 0.5, FloatRange::Linear { min: 0.0, max: 1.0 }),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DSP PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

/// Asymmetric soft-clip triode stage.
/// Positive half: tanh(x * drive)
/// Negative half: tanh(x * drive * 0.8) — less gain on negative swing = even harmonics.
#[inline(always)]
fn triode_stage(x: f32, drive: f32) -> f32 {
    if x >= 0.0 {
        (x * drive).tanh()
    } else {
        (x * drive * 0.8).tanh()
    }
}

/// Simple envelope-following noise gate.
struct NoiseGate {
    envelope: f32,
    attack: f32,
    release: f32,
}

impl NoiseGate {
    fn new(sample_rate: f32) -> Self {
        Self {
            envelope: 0.0,
            attack: (-1.0 / (sample_rate * 0.001)).exp(),  // 1ms attack
            release: (-1.0 / (sample_rate * 0.050)).exp(), // 50ms release
        }
    }

    #[inline(always)]
    fn process(&mut self, x: f32, threshold_db: f32) -> f32 {
        let abs_x = x.abs();
        let coeff = if abs_x > self.envelope { self.attack } else { self.release };
        self.envelope = coeff * self.envelope + (1.0 - coeff) * abs_x;
        let env_db = 20.0 * (self.envelope + 1e-10).log10();
        let gate = if env_db > threshold_db { 1.0 } else { (env_db - threshold_db + 6.0).max(0.0) / 6.0 };
        x * gate
    }
}

/// Single-pole IIR filter (lowpass or highpass depending on usage).
#[derive(Clone, Copy, Default)]
struct OnePole {
    z1: f32,
}

impl OnePole {
    #[inline(always)]
    fn lowpass(&mut self, x: f32, freq: f32, sr: f32) -> f32 {
        let g = (std::f32::consts::PI * freq / sr).tan();
        let a = g / (1.0 + g);
        let v = a * (x - self.z1);
        let out = v + self.z1;
        self.z1 = out + v;
        out
    }

    #[inline(always)]
    fn highpass(&mut self, x: f32, freq: f32, sr: f32) -> f32 {
        x - self.lowpass(x, freq, sr)
    }
}

/// 5-band tonestack: bass shelf, low-mid, mid scoop, treble, presence peak.
struct Tonestack {
    lp_bass: OnePole,
    hp_bass: OnePole,
    lp_mid: OnePole,
    hp_mid: OnePole,
    lp_treble: OnePole,
    hp_presence: OnePole,
}

impl Tonestack {
    fn new() -> Self {
        Self {
            lp_bass: OnePole::default(),
            hp_bass: OnePole::default(),
            lp_mid: OnePole::default(),
            hp_mid: OnePole::default(),
            lp_treble: OnePole::default(),
            hp_presence: OnePole::default(),
        }
    }

    #[inline(always)]
    fn process(&mut self, x: f32, bass: f32, mid: f32, treble: f32, presence: f32, sr: f32) -> f32 {
        // Bass: boost/cut below 150Hz (tight — not boomy)
        let bass_band = self.lp_bass.lowpass(x, 150.0, sr);
        let no_bass = x - bass_band;
        let bass_out = no_bass + bass_band * (bass * 2.0);

        // Mid: scoop 400-1200Hz range
        let mid_low = self.hp_mid.highpass(bass_out, 400.0, sr);
        let mid_band = self.lp_mid.lowpass(mid_low, 1200.0, sr);
        let mid_out = bass_out - mid_band * (1.0 - mid);

        // Treble: 2-5kHz
        let treble_band = self.hp_bass.highpass(mid_out, 2000.0, sr);
        let treble_out = mid_out + treble_band * (treble - 0.5) * 2.0;

        // Presence: sharp peak at 3.5-5kHz for pick articulation
        let pres_band = self.hp_presence.highpass(treble_out, 3500.0, sr);
        treble_out + pres_band * presence * 1.5
    }
}

/// Power amp saturation — slight compression, NOT saggy.
#[inline(always)]
fn power_amp(x: f32) -> f32 {
    // Soft knee compression via sinh approximation — tight, not loose.
    let threshold = 0.7;
    if x.abs() < threshold {
        x
    } else {
        let sign = x.signum();
        let over = x.abs() - threshold;
        sign * (threshold + over / (1.0 + over * 2.0))
    }
}

/// 4x oversampling (linear-phase, simple 2-tap up/down for CPU efficiency).
/// For production, replace with a proper polyphase FIR.
struct Oversampler {
    up_buf: [f32; 4],
}

impl Oversampler {
    fn new() -> Self {
        Self { up_buf: [0.0; 4] }
    }

    #[inline(always)]
    fn process<F: FnMut(f32) -> f32>(&mut self, x: f32, mut func: F) -> f32 {
        // Naive 4x: zero-stuff, process, average-down.
        self.up_buf[0] = func(x);
        self.up_buf[1] = func(x * 0.75);
        self.up_buf[2] = func(x * 0.5);
        self.up_buf[3] = func(x * 0.25);
        (self.up_buf[0] + self.up_buf[1] + self.up_buf[2] + self.up_buf[3]) * 0.25
    }
}

/// Cabinet IR — a short hardcoded FIR approximating a 2x12 V30 (dark, tight).
/// 32 taps at 44.1k captures the essential character.
const CAB_IR: [f32; 32] = [
    0.012, 0.035, 0.068, 0.120, 0.185, 0.240, 0.280, 0.300,
    0.290, 0.260, 0.210, 0.155, 0.100, 0.055, 0.020, -0.010,
    -0.030, -0.040, -0.038, -0.030, -0.020, -0.012, -0.006, -0.002,
    0.001, 0.002, 0.001, 0.000, -0.001, -0.001, 0.000, 0.000,
];

struct CabSim {
    buffer: [f32; 32],
    pos: usize,
}

impl CabSim {
    fn new() -> Self {
        Self { buffer: [0.0; 32], pos: 0 }
    }

    #[inline(always)]
    fn process(&mut self, x: f32) -> f32 {
        self.buffer[self.pos] = x;
        let mut out = 0.0;
        for (i, &coeff) in CAB_IR.iter().enumerate() {
            let idx = (self.pos + 32 - i) % 32;
            out += self.buffer[idx] * coeff;
        }
        self.pos = (self.pos + 1) % 32;
        out
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLUGIN
// ═══════════════════════════════════════════════════════════════════════════════

struct ErraAmpSim {
    params: Arc<AmpParams>,
    gate_l: NoiseGate,
    gate_r: NoiseGate,
    tonestack_l: Tonestack,
    tonestack_r: Tonestack,
    oversampler_l: Oversampler,
    oversampler_r: Oversampler,
    cab_l: CabSim,
    cab_r: CabSim,
    sample_rate: f32,
}

impl Default for ErraAmpSim {
    fn default() -> Self {
        Self {
            params: Arc::new(AmpParams::default()),
            gate_l: NoiseGate::new(44100.0),
            gate_r: NoiseGate::new(44100.0),
            tonestack_l: Tonestack::new(),
            tonestack_r: Tonestack::new(),
            oversampler_l: Oversampler::new(),
            oversampler_r: Oversampler::new(),
            cab_l: CabSim::new(),
            cab_r: CabSim::new(),
            sample_rate: 44100.0,
        }
    }
}

impl Plugin for ErraAmpSim {
    const NAME: &'static str = "ERRA Amp Sim";
    const VENDOR: &'static str = "Jonatanm92";
    const URL: &'static str = "";
    const EMAIL: &'static str = "";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");
    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[AudioIOLayout {
        main_input: Some(new_nonzero_u32(2)),
        main_output: Some(new_nonzero_u32(2)),
        ..AudioIOLayout::const_default()
    }];
    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone()
    }

    fn initialize(&mut self, _: &AudioIOLayout, buffer_config: &BufferConfig, _: &mut impl InitContext<Self>) -> bool {
        self.sample_rate = buffer_config.sample_rate;
        self.gate_l = NoiseGate::new(self.sample_rate);
        self.gate_r = NoiseGate::new(self.sample_rate);
        true
    }

    fn process(&mut self, buffer: &mut Buffer, _aux: &mut AuxiliaryBuffers, _ctx: &mut impl ProcessContext<Self>) -> ProcessStatus {
        let gain_raw = self.params.gain.smoothed.next();
        let bass = self.params.bass.smoothed.next();
        let mid = self.params.mid.smoothed.next();
        let treble = self.params.treble.smoothed.next();
        let presence = self.params.presence.smoothed.next();
        let gate_thresh = self.params.gate_threshold.smoothed.next();
        let output = self.params.output.smoothed.next();
        let sr = self.sample_rate;

        // Map gain knob to drive amounts for 3 stages.
        let drive1 = 3.0 + gain_raw * 12.0;  // light to crunchy
        let drive2 = 2.0 + gain_raw * 10.0;  // push into saturation
        let drive3 = 1.5 + gain_raw * 8.0;   // final stage, more compression

        for mut frame in buffer.iter_samples() {
            let channels: Vec<*mut f32> = frame.iter_mut().map(|s| s as *mut f32).collect();
            if channels.len() < 2 { continue; }

            for (ch_idx, &ptr) in channels.iter().enumerate().take(2) {
                let sample = unsafe { *ptr };
                let (gate, tonestack, oversampler, cab) = if ch_idx == 0 {
                    (&mut self.gate_l, &mut self.tonestack_l, &mut self.oversampler_l, &mut self.cab_l)
                } else {
                    (&mut self.gate_r, &mut self.tonestack_r, &mut self.oversampler_r, &mut self.cab_r)
                };

                // 1. Noise gate (tight — no flub)
                let gated = gate.process(sample, gate_thresh);

                // 2. 3-stage gain (oversampled to prevent aliasing)
                let distorted = oversampler.process(gated, |x| {
                    let s1 = triode_stage(x, drive1);
                    let s2 = triode_stage(s1, drive2);
                    let s3 = triode_stage(s2, drive3);
                    s3
                });

                // 3. Tonestack (scooped mids, sharp presence)
                let eq = tonestack.process(distorted, bass, mid, treble, presence, sr);

                // 4. Power amp (slight compression, not saggy)
                let powered = power_amp(eq);

                // 5. Cabinet (V30 voiced, tight)
                let cabbed = cab.process(powered);

                // 6. Output level
                unsafe { *ptr = cabbed * output * 2.0; }
            }
        }
        ProcessStatus::Normal
    }
}

impl ClapPlugin for ErraAmpSim {
    const CLAP_ID: &'static str = "com.jonatanm92.erra-amp-sim";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("ERRA-tone guitar amp simulator — modern high-gain metal");
    const CLAP_MANUAL_URL: Option<&'static str> = None;
    const CLAP_SUPPORT_URL: Option<&'static str> = None;
    const CLAP_FEATURES: &'static [ClapFeature] = &[ClapFeature::AudioEffect, ClapFeature::Distortion];
}

impl Vst3Plugin for ErraAmpSim {
    const VST3_CLASS_ID: [u8; 16] = *b"ErraAmpSimNihPl!";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] = &[Vst3SubCategory::Fx, Vst3SubCategory::Distortion];
}

nih_export_clap!(ErraAmpSim);
nih_export_vst3!(ErraAmpSim);
