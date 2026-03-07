# Contributing to PlayRooms

Thank you for your interest in contributing to PlayRooms. This guide covers the project structure, development setup, code expectations, and how to submit changes.

## Multi-Repo Structure

PlayRooms is a multi-repository project. Make sure you're contributing to the correct repo:

| Repository | What belongs here |
|---|---|
| **PlayRooms** (this repo) | Host platform — server, client, plugin loader, room engine, widgets, auth, guest roles |
| **PlayRooms-Portal** | Relay server for remote guest access |
| **PlayRooms-DP-Buttplug** | Device Provider: Buttplug.io / Intiface Engine |
| **PlayRooms-DP-DGLabs-WS** | Device Provider: DG-LAB Coyote via WebSocket |
| **PlayRooms-DP-DGLabs-BLE** | Device Provider: DG-LAB Coyote via Bluetooth LE |

**Device provider contributions go to the appropriate provider repo, not this one.** If you want to add support for a new hardware ecosystem, create a new provider repo (see [Adding a New Device Provider](#adding-a-new-device-provider) below).

## Branch Model

- `main` — release branch. Only receives merges from `beta` at release time.
- `beta` — development branch. All work targets `beta`.

Always branch from `beta` and submit PRs against `beta`.

## Development Environment Setup

### Prerequisites

- Node.js (LTS recommended)
- npm
- Git
- SQLite (included via Drizzle ORM, no external install needed)
- Docker (optional, for container testing)
- Home Assistant (optional, for addon testing)

### Getting Started

```bash
# Clone the repository
git clone -b beta https://github.com/troon4891/PlayRooms.git
cd PlayRooms

# Install dependencies
npm install

# Start the development server
npm run dev
```

For testing with device providers, clone the relevant provider repo(s) into a sibling directory and configure the plugin loader to point to them.

## Code Style

- **TypeScript** for all server and client code
- **React** functional components with hooks
- **Tailwind CSS** for styling, using shadcn/ui components and Lucide icons
- Follow existing patterns in the codebase — consistency matters more than personal preference
- Keep functions focused and files reasonably sized

### i18n Requirement

**All user-facing strings must use the i18n translation system.** Use the `t()` function via `react-i18next` — never hardcode UI text in components. English is the only shipped language for v1.0, but the architecture supports adding languages without code changes.

Translation files live in `client/src/locales/{lang}/` as namespaced JSON files.

### Accessibility

Control state indicators must never rely on color alone to convey state. Use the three-channel approach: color + icon + text-on-tap. See the Architecture specification (§9.4) for details.

## Pull Request Process

1. **Branch from `beta`** — create a feature or fix branch from `beta`
2. **Keep changes focused** — one feature or fix per PR
3. **Update documentation** — if your change affects README.md, DOCS.md, CHANGELOG.md, NOTICE.md, or any other project documentation, update them in the same PR
4. **Test your changes** — verify the feature works end-to-end before submitting
5. **Write a clear PR description** — explain what changed, why, and how to test it
6. **Submit against `beta`** — never submit PRs directly to `main`

### What to Include in a PR

- The implementation
- Updated documentation (if applicable)
- A brief description of how to verify the change works

## Team Structure

PlayRooms uses a four-role development team:

| Role | Responsibility |
|---|---|
| **Project Designer** | Product owner. Makes all design and priority decisions. Reviews and tests implementations. |
| **Project Manager** | Plans work, writes problem briefs, reviews output for quality and spec compliance. |
| **QA Tester** | Tests implementations using browser-based review (dev tools, console, network inspection). |
| **Coder** | Implements features and fixes. Maintains code quality, tests, and documentation. |

External contributors interact primarily through GitHub issues and pull requests. The team will review and provide feedback on PRs.

## Adding a New Device Provider

Device providers are plugins loaded by the Host's plugin loader at startup. To add support for a new hardware ecosystem:

1. **Create a new repository** following the naming convention: `PlayRooms-DP-{Name}`
2. **Implement the `ProviderInterface`** — this is the contract between the Host and providers
3. **Include a plugin manifest** with a `type: "device-provider"` field
4. **Implement the emergency stop contract** — this is mandatory for all providers
5. **Declare risk flags** in the manifest for any hardware that carries physical safety implications
6. **Emit panel schemas** that the ToyBox can render — no hardcoded device UI in the Host client
7. **Maintain provider-specific documentation**: `SAFETY.md` (emergency stop behavior, physical safety) and `CONTROLS.md` (panel control definitions)

See the existing provider repos for reference implementations.

## Adding a New Language Translation

PlayRooms uses `react-i18next` for internationalization. To add a new language:

1. Copy the `client/src/locales/en/` directory to `client/src/locales/{lang}/` (using the appropriate ISO 639-1 language code)
2. Translate all string values in the JSON files — keep the keys unchanged
3. The application will automatically detect and load the new locale
4. Test the translation by switching languages in the UI

No code changes should be required to add a new language.

## Reporting Issues

- **Bugs and feature requests** — use [GitHub Issues](https://github.com/troon4891/PlayRooms/issues)
- **Security vulnerabilities** — see [SECURITY.md](SECURITY.md) for responsible disclosure instructions

## License

By contributing to PlayRooms, you agree that your contributions will be licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
