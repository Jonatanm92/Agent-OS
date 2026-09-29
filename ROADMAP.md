# Agent OS Roadmap

Agent OS is being developed as a vendor-neutral, self-hosted control plane for
coding agents and durable local context.

This roadmap is directional rather than a promise of dates.

## Near term

- harden first-run setup on Windows, macOS, and Linux
- expand automated tests around workspace tools and agent loops
- add explicit capability detection for provider/model combinations
- improve secrets handling and remote-access defaults
- improve accessibility and mobile usability
- document provider adapters and agent integration points

## Next

- plugin/adapter interface for third-party agent backends
- import/export for skills, loops, and agent identities
- reproducible workflow bundles that can be shared between installations
- project-level permission profiles for file and command tools
- richer run history and audit export
- backup/restore for SQLite state plus markdown memory

## Longer term

- package the core orchestration layer independently of the dashboard
- establish stable extension contracts
- publish compatibility fixtures for model/provider adapters
- make installation and upgrades fully reproducible
- support community-maintained integrations without requiring core changes

## Design principles

1. **Local ownership** — project files and durable memory remain under the user's control.
2. **Provider portability** — changing models should not require rebuilding the workflow.
3. **Explicit authority** — agent capabilities should be visible and configurable.
4. **Inspectable state** — important actions and durable context should be auditable.
5. **Useful without a cloud control plane** — core functionality should remain self-hostable.
