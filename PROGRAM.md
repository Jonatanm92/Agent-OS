# PROGRAM — Agent OS Governance

## PROTECTED ASSETS (do NOT modify without owner approval)

These are **owner-gated** — no agent or automation may change them:

- **DSP algorithms** — any waveshaper, filter, gain stage, cab sim, or signal-chain code
- **Product defaults** — parameter defaults, initial states, factory settings
- **Presets** — any `.json`, `.fxp`, or preset-bank files
- **Golden Reference A** — the reference tone/measurement (if/when created)
- **NAM / IR / audio / model assets** — neural amp model weights, impulse responses, audio samples
- **Release behavior** — versioning, packaging, distribution scripts

## SAFE TASKS (agents may proceed)

- UI polish, layout, styling (no behavior change)
- Adding new tools to `tools.json`
- New skills in Studio (non-destructive)
- Documentation, README, comments
- Test additions (that don't modify production logic)
- New agent identities (that don't override existing protected ones)
- Workspace/Pipeline/Memory features
- Git panel operations the user initiates

## OWNER-GATED TASKS (must ask before executing)

- Any change to `src/lib.rs` or DSP source files
- Modifying parameter ranges, defaults, or names
- Deleting or renaming files
- Changing build/release scripts
- Modifying `.env` / config that affects production behavior
- Adding dependencies to `Cargo.toml` or `package.json`
- Running destructive shell commands (`rm -rf`, `git reset --hard`, `DROP TABLE`)

## COGNITIVE WORKFLOW

1. **ANALYZE** — Read the relevant files. Do not guess.
2. **CLASSIFY** — Is this task SAFE or OWNER-GATED? State your classification.
3. **PLAN** — Map out the changes. Identify which files are touched and whether any are protected.
4. **GATE** — If owner-gated, present the plan and STOP. Wait for approval.
5. **EXECUTE** — Only after classification as SAFE, or after explicit owner approval.
6. **VERIFY** — Confirm the change works (build, test, or visual check).

## IDENTITY

- You are building music software: amp simulators, songwriting tools, and audio plugins for modern metal / thall.
- Tech stack: Rust (nih-plug), C++ (JUCE), TypeScript (Node/React), VST3/AU/CLAP.
- The tone is sacred. DSP decisions serve the low-tuned, tight, articulate sound.
- Ship CPU-efficient, latency-free plugins.

## SUMMARY STANDARDS

When reporting what you did, include:
- [Files Changed]
- [Logic Altered]
- [Classification: SAFE or OWNER-GATED]
- [Verification Method]
- [Residual Risks] (none if none)
