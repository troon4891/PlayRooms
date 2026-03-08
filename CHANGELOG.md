# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
