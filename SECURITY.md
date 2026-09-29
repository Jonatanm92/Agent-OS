# Security Policy

Agent OS can execute commands, read and write workspace files, connect to model
providers, and optionally expose a local web interface. Treat it as developer
infrastructure with access to the machine on which it runs.

## Reporting a vulnerability

Please do not publish exploit details in a public issue before a fix is available.

Use GitHub's private security advisory flow for this repository when possible.
Include:

- affected version or commit
- reproduction steps
- expected and observed behavior
- security impact
- suggested mitigation, if known

If the issue is not security-sensitive, use the normal issue tracker instead.

## Security assumptions

- Agent OS is intended to be self-hosted.
- Remote access should use a private network such as Tailscale or another
  authenticated tunnel.
- Set `AGENT_OS_PASSWORD` before exposing the dashboard beyond a trusted LAN.
- Model-provider keys and tokens must never be committed to the repository.
- Tool execution is powerful by design. Review what an agent is allowed to run,
  especially in repositories containing secrets or production credentials.

## Supported version

Security fixes are applied to the current `main` branch while the project is
pre-1.0/still evolving rapidly.
