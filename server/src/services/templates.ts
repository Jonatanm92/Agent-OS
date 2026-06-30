import * as workspace from './workspace.js';

/**
 * Project templates — one-click scaffolds for common audio/music dev projects.
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
}

const TEMPLATES: Template[] = [
  {
    id: 'nih-plug-amp',
    name: 'nih-plug Amp Sim',
    description: 'Rust VST3/CLAP amp simulator plugin using nih-plug. Includes gain stage, tonestack, and cab sim.',
    files: {
      'Cargo.toml': `[package]
name = "amp-sim"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
nih_plug = { git = "https://github.com/robbert-vdh/nih-plug.git", features = ["standalone"] }

[profile.release]
lto = "thin"
`,
      'src/lib.rs': `use nih_plug::prelude::*;
use std::sync::Arc;

struct AmpSim {
    params: Arc<AmpSimParams>,
}

#[derive(Params)]
struct AmpSimParams {
    #[id = "gain"]
    gain: FloatParam,
    #[id = "tone"]
    tone: FloatParam,
    #[id = "output"]
    output: FloatParam,
}

impl Default for AmpSim {
    fn default() -> Self {
        Self { params: Arc::new(AmpSimParams::default()) }
    }
}

impl Default for AmpSimParams {
    fn default() -> Self {
        Self {
            gain: FloatParam::new("Gain", 0.5, FloatRange::Linear { min: 0.0, max: 1.0 }),
            tone: FloatParam::new("Tone", 0.5, FloatRange::Linear { min: 0.0, max: 1.0 }),
            output: FloatParam::new("Output", 0.7, FloatRange::Linear { min: 0.0, max: 1.0 }),
        }
    }
}

impl Plugin for AmpSim {
    const NAME: &'static str = "Amp Sim";
    const VENDOR: &'static str = "Your Name";
    const URL: &'static str = "";
    const EMAIL: &'static str = "";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");
    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[
        AudioIOLayout { main_input: Some(new_nonzero_u32(2)), main_output: Some(new_nonzero_u32(2)), ..AudioIOLayout::const_default() },
    ];
    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> { self.params.clone() }

    fn process(&mut self, buffer: &mut Buffer, _aux: &mut AuxiliaryBuffers, _ctx: &mut impl ProcessContext<Self>) -> ProcessStatus {
        let gain = self.params.gain.smoothed.next();
        let output = self.params.output.smoothed.next();
        for samples in buffer.iter_samples() {
            for sample in samples {
                // Simple waveshaper: tanh soft-clip
                *sample = (*sample * gain * 10.0).tanh() * output;
            }
        }
        ProcessStatus::Normal
    }
}

impl ClapPlugin for AmpSim {
    const CLAP_ID: &'static str = "com.yourname.amp-sim";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("Guitar amp simulator for metal");
    const CLAP_MANUAL_URL: Option<&'static str> = None;
    const CLAP_SUPPORT_URL: Option<&'static str> = None;
    const CLAP_FEATURES: &'static [ClapFeature] = &[ClapFeature::AudioEffect, ClapFeature::Distortion];
}

impl Vst3Plugin for AmpSim {
    const VST3_CLASS_ID: [u8; 16] = *b"AmpSimNihPlug00!";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] = &[Vst3SubCategory::Fx, Vst3SubCategory::Distortion];
}

nih_export_clap!(AmpSim);
nih_export_vst3!(AmpSim);
`,
      'README.md': `# Amp Sim (nih-plug)

A guitar amp simulator VST3/CLAP plugin built with nih-plug (Rust).

## Build
\`\`\`bash
cargo xtask bundle amp-sim --release
\`\`\`

## Features
- Gain stage with tanh soft-clipping
- Tone control
- Output level
- VST3 + CLAP formats
`,
    },
  },
  {
    id: 'juce-plugin',
    name: 'JUCE Audio Plugin',
    description: 'C++ VST3/AU plugin with JUCE. Processor + Editor + CMake.',
    files: {
      'CMakeLists.txt': `cmake_minimum_required(VERSION 3.22)
project(MyPlugin VERSION 0.1.0)

find_package(JUCE 7 REQUIRED)

juce_add_plugin(MyPlugin
    COMPANY_NAME "YourCompany"
    PLUGIN_MANUFACTURER_CODE Mfgr
    PLUGIN_CODE Plgn
    FORMATS VST3 AU Standalone
    PRODUCT_NAME "My Plugin")

target_sources(MyPlugin PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_compile_features(MyPlugin PUBLIC cxx_std_17)
target_link_libraries(MyPlugin PRIVATE juce::juce_audio_utils juce::juce_dsp)
`,
      'Source/PluginProcessor.h': `#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

class MyPluginProcessor : public juce::AudioProcessor {
public:
    MyPluginProcessor();
    ~MyPluginProcessor() override = default;
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "My Plugin"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    juce::AudioProcessorValueTreeState apvts;
private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
};
`,
      'Source/PluginProcessor.cpp': `#include "PluginProcessor.h"
#include "PluginEditor.h"

MyPluginProcessor::MyPluginProcessor()
    : AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts(*this, nullptr, "Parameters", createParameterLayout()) {}

juce::AudioProcessorValueTreeState::ParameterLayout MyPluginProcessor::createParameterLayout() {
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.push_back(std::make_unique<juce::AudioParameterFloat>("gain", "Gain", 0.0f, 1.0f, 0.5f));
    params.push_back(std::make_unique<juce::AudioParameterFloat>("output", "Output", 0.0f, 1.0f, 0.7f));
    return { params.begin(), params.end() };
}

void MyPluginProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    juce::ignoreUnused(sampleRate, samplesPerBlock);
}

void MyPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) {
    auto gain = apvts.getRawParameterValue("gain")->load();
    auto output = apvts.getRawParameterValue("output")->load();
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch) {
        auto* data = buffer.getWritePointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            data[i] = std::tanh(data[i] * gain * 10.0f) * output;
    }
}

juce::AudioProcessorEditor* MyPluginProcessor::createEditor() { return new MyPluginEditor(*this); }
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new MyPluginProcessor(); }
`,
      'Source/PluginEditor.h': `#pragma once
#include "PluginProcessor.h"

class MyPluginEditor : public juce::AudioProcessorEditor {
public:
    explicit MyPluginEditor(MyPluginProcessor&);
    ~MyPluginEditor() override = default;
    void paint(juce::Graphics&) override;
    void resized() override;
private:
    MyPluginProcessor& processor;
    juce::Slider gainSlider, outputSlider;
    juce::AudioProcessorValueTreeState::SliderAttachment gainAttach, outputAttach;
};
`,
      'Source/PluginEditor.cpp': `#include "PluginEditor.h"

MyPluginEditor::MyPluginEditor(MyPluginProcessor& p)
    : AudioProcessorEditor(&p), processor(p),
      gainAttach(p.apvts, "gain", gainSlider),
      outputAttach(p.apvts, "output", outputSlider) {
    for (auto* s : {&gainSlider, &outputSlider}) {
        s->setSliderStyle(juce::Slider::RotaryVerticalDrag);
        s->setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 20);
        addAndMakeVisible(s);
    }
    setSize(300, 200);
}

void MyPluginEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colours::black);
    g.setColour(juce::Colours::white);
    g.setFont(16.0f);
    g.drawText("My Plugin", getLocalBounds().removeFromTop(30), juce::Justification::centred);
}

void MyPluginEditor::resized() {
    auto area = getLocalBounds().reduced(20).withTrimmedTop(30);
    auto w = area.getWidth() / 2;
    gainSlider.setBounds(area.removeFromLeft(w));
    outputSlider.setBounds(area);
}
`,
    },
  },
  {
    id: 'static-site',
    name: 'Landing Page',
    description: 'Simple HTML/CSS landing page — good for product pages, cover art, etc.',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Project Name</h1>
    <p>One line about what it does.</p>
  </header>
  <main>
    <section class="features">
      <div class="feature">Feature 1</div>
      <div class="feature">Feature 2</div>
      <div class="feature">Feature 3</div>
    </section>
  </main>
</body>
</html>
`,
      'style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #eee; min-height: 100vh; }
header { text-align: center; padding: 80px 20px 40px; }
h1 { font-size: 3rem; }
p { color: #888; margin-top: 8px; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; max-width: 800px; margin: 40px auto; padding: 0 20px; }
.feature { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 24px; text-align: center; }
`,
    },
  },
  {
    id: 'node-cli',
    name: 'Node.js CLI Tool',
    description: 'Quick Node.js command-line tool with arg parsing.',
    files: {
      'package.json': `{
  "name": "my-tool",
  "version": "1.0.0",
  "type": "module",
  "bin": { "my-tool": "index.mjs" },
  "scripts": { "start": "node index.mjs" }
}
`,
      'index.mjs': `#!/usr/bin/env node
const args = process.argv.slice(2);
console.log('Hello from my-tool!', args.length ? 'Args: ' + args.join(', ') : '');
`,
    },
  },
];

export function listTemplates(): Omit<Template, 'files'>[] {
  return TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}

export function scaffold(templateId: string, projectName: string): { projectId: string; files: string[] } {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  const project = workspace.createProject(projectName || tpl.name);
  const written: string[] = [];
  for (const [path, content] of Object.entries(tpl.files)) {
    workspace.writeFileContent(project.id, path, content);
    written.push(path);
  }
  return { projectId: project.id, files: written };
}
