# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-03-08

### Changed

- **Health endpoint version sync** — `/api/health` now reads version from `server/package.json` instead of hardcoding it
- Bumped `server/package.json` and `client/package.json` from 1.0.0 to 1.0.1 to match `config.yaml`
- Added version bumping guide to `CLAUDE.md`

### Fixed

- **HA addon repository structure** — Home Assistant Supervisor could not find the addon because `config.yaml` was at the repo root. HA only scans subdirectories. Moved all addon content (`config.yaml`, `build.yaml`, `Dockerfile`, `run.sh`, `server/`, `client/`, `translations/`, `DOCS.md`) into a `playrooms/` subdirectory.
- Added `repository.yaml` at root for HA addon repository discovery
- **HA addon changelog** — added `playrooms/CHANGELOG.md` so HA Supervisor displays the changelog tab correctly
- Removed leftover root `server/` directory from pre-restructure
- Standardized QA checklist filenames to `v{version}-{description}.md` convention

### Added

- **Platform setup guides** — ported from HAButtPlugIO-PlayRooms for Home Assistant Supervisor, VirtualBox, and Proxmox VE (`docs/setup-guides/`)
- **DOCS.md expanded** — now includes transport requirements, hardware passthrough guide for standalone Docker, tested platforms matrix, and links to setup guides
- **CLAUDE.md updated** — added Home Assistant Addon Structure section and Git Workflow section; updated directory layout to reflect new structure
- `qa/` directory for QA checklists

## [1.0.0] - 2026-03-08

### Added

- **Carry-forward port** from HAButtPlugIO-PlayRooms v3.3.0 into new multi-repo structure
- Server code (Express, Socket.IO, SQLite/Drizzle, room management, auth, widgets) ported to `server/`
- Client code (React SPA) ported to `client/`
- Shared relay protocol types at `server/src/shared/relay-types.ts` with `RELAY_PROTOCOL_VERSION = 1`
- Plugin loader stub at `server/src/plugins/loader.ts` (Buttplug shim remains built-in during transition)
- **Acceptance gate**: addon refuses to start unless `accept_terms: true` in config. Clear error log on failure. Standalone Docker mode supported via `ACCEPT_TERMS` env var
- **First-boot disclaimer screen**: full-screen scrollable terms with checkbox confirmation, stored in database. Re-shown if terms are updated in future versions
- **Guest lobby consent screen**: shown before every room join (not stored persistently). Describes activity consent without exposing platform details
- **react-i18next integration**: all UI strings use `t()` function. English translations in namespaced JSON files (`common.json`, `room.json`, `toybox.json`, `consent.json`, `moderation.json`) under `client/src/locales/en/`
- `config.yaml` updated with `accept_terms` option, full schema for all options
- `translations/en.yaml` updated with HA addon option descriptions
- Technical documentation at `docs/DOCS.md` covering API endpoints, Socket.IO events, configuration reference
- `server/src/providers/` placeholder directory for future provider-specific initialization

### Changed

- **PORTAL_MODE removed**: Host is always the host. Portal mode is now a separate repository (PlayRooms-Portal)
- Server entry point no longer has portal mode branch — always starts in host mode
- Version bumped from 3.3.0 to 1.0.0 (fresh start for the PlayRooms project)
- Health endpoint now reports version as `1.0.0`
- Dockerfile simplified: always includes Intiface Engine (no PORTAL_MODE conditional)
- `run.sh` simplified: no portal mode detection, exports `ACCEPT_TERMS`

### Fixed

- License references corrected from MIT to Apache 2.0 in ROADMAP-v1.0.md (4 occurrences)
- DG-LAB WS provider manifest example in ARCHITECTURE-v1.0.md corrected from `license: "MIT"` to `license: "Apache-2.0"`
