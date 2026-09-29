# Contributing to Agent OS

Thanks for considering a contribution.

Agent OS is an early-stage, self-hosted workspace for running multiple coding
agents with shared local memory, auditable workflows, and project-scoped tools.
Contributions that improve portability, provider interoperability, security,
testing, documentation, and first-run setup are especially useful.

## Before you start

- Open an issue for substantial feature work so the direction can be discussed first.
- Keep changes focused. Small pull requests are easier to review and test.
- Do not commit API keys, tokens, private vault contents, generated databases, or
  other user data.
- New provider integrations should preserve the project's provider-agnostic design.

## Local development

Requirements:

- Node.js 20 or newer
- npm

Install dependencies:

```bash
npm ci
```

Run the backend and frontend in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Run verification before opening a pull request:

```bash
npm test
npm run build
```

## Pull requests

A good pull request includes:

1. A short problem statement.
2. What changed and why.
3. How the change was verified.
4. Screenshots for visible UI changes.
5. Any known limitations or follow-up work.

Please avoid unrelated formatting churn or generated changes that make the
functional diff difficult to review.

## Good first contributions

Useful starter areas include:

- clearer installation diagnostics
- cross-platform setup fixes
- documentation improvements
- provider compatibility tests
- accessibility fixes
- test coverage for agent tool loops
- safer defaults for remote access

## License

By contributing, you agree that your contribution will be licensed under the
MIT License used by this repository.
