# PlayRooms v1.0 — Implementation Roadmap

**Status:** Draft  
**Date:** 2026-02-28  
**Reference:** `ARCHITECTURE-v1.0.md`  
**Preceding version:** HAButtPlugIO-PlayRooms v3.3.0 (QA passed, ready for merge)

---

## Pre-Work: Close Out 3.x

Before v1.0 work begins, finalize the 3.x series:

- [ ] Verify beta branch matches what passed 3.3.0 QA (config.yaml shows 3.2.0 — may need push)
- [ ] Merge beta → main for 3.3.0 release
- [ ] Tag `v3.3.0` as the final release of the HAButtPlugIO-PlayRooms repo
- [ ] Archive or mark HAButtPlugIO-PlayRooms as succeeded-by PlayRooms v1.0

---

## Milestone 1: Repository Scaffolding

**Goal:** Set up the multi-repo structure with proper foundations. No functional changes — just the new homes for code.

### Tasks

**1.1 — Create `PlayRooms` Host repository**
- Initialize repo with Apache 2.0 license, README, CONTRIBUTING, SECURITY, NOTICE, CLAUDE.md
- Port the following from HAButtPlugIO-PlayRooms verbatim (no refactoring yet):
  - `server/src/` (everything except `buttplug/` directory and portal server mode)
  - `client/src/`
  - `Dockerfile`, `build.yaml`, `config.yaml`, `run.sh`
  - `docs/` (include ARCHITECTURE-v1.0.md and ROADMAP-v1.0.md)
  - `translations/`
- Remove `PORTAL_MODE` toggle — Host is always the host
- Keep the outbound relay client (Host's connection to Portal)
- Create shared relay types file at `src/shared/relay-types.ts` with `RELAY_PROTOCOL_VERSION`
- Add placeholder `providers/` directory in server with a `loader.ts` stub
- Add placeholder plugin config section in `config.yaml`
- The `server/src/buttplug/` directory stays temporarily as a shim so the app still works during transition

**1.2 — Create `PlayRooms-Portal` repository**
- Initialize repo with Apache 2.0 license, README, CLAUDE.md
- Extract portal server code from HAButtPlugIO-PlayRooms (the `PORTAL_MODE=true` path)
- Copy `src/shared/relay-types.ts` from Host repo (clearly marked as a copy)
- Own Dockerfile — lightweight Node image, no Intiface Engine, no SQLite
- HA addon configuration files (config.yaml, build.yaml) for sister addon deployment
- Standalone Docker deployment docs (docker-compose.yml for VPS/cloud)
- Protocol version handshake validation on relay connection

**1.3 — Create `PlayRooms-DP-Buttplug` repository**
- Initialize repo with Apache 2.0 license, README stub, CLAUDE.md
- Create the required provider file structure: `manifest.yaml`, `README.md`, `SAFETY.md`, `CONTROLS.md`, `src/index.ts`
- Copy `server/src/buttplug/` contents into `src/`
- Write initial `manifest.yaml` with current Buttplug config options
- Provider does NOT need to implement the full ProviderInterface yet — this milestone is about structure

**1.4 — Create `PlayRooms-DP-DGLabs-WS` repository**
- Initialize repo with Apache 2.0 license, CLAUDE.md
- Create the required file structure with placeholder content
- Write `manifest.yaml` based on DG-LAB WebSocket protocol requirements
- Write initial `SAFETY.md` covering e-stim safety considerations
- `src/index.ts` is a stub that exports a placeholder class

**1.5 — Create `PlayRooms-DP-DGLabs-BLE` repository**
- Same as 1.4 but for BLE variant
- `manifest.yaml` declares `requirements.bluetooth: true`

### Done Looks Like
- Five repos exist with proper structure and CLAUDE.md files
- PlayRooms Host repo runs the existing app (no regressions from 3.3.0) without portal toggle
- PlayRooms-Portal repo runs as a standalone relay server
- Host can connect outbound to Portal; Portal validates and relays guest connections
- Each provider repo has all required files (manifest, README, SAFETY, CONTROLS)
- Buttplug provider repo contains the extracted Buttplug code
- DG-LAB repos have well-written safety docs and meaningful stubs
- Relay protocol version check works in the handshake

---

## Milestone 2: Plugin Loader, Provider Interface & Guest Roles

**Goal:** Define the ProviderInterface contract, build the typed plugin loader, implement the guest role system, and wire up the settings cascade.

### Tasks

**2.1 — Define core types**
- `PluginManifest` — base manifest with `type` field for dispatch
- `ProviderInterface` — the device provider contract (see Architecture doc §3.3)
- `ProviderConfig` — settings passed to `initialize()`
- `ProviderDevice` — device identity and state
- `DeviceProviderCommand` — rich command model replacing the current `DeviceCommand`
- `ProviderHealthStatus` — health check response
- `ToyPanelSchema` and all control primitives (see Architecture doc §4)
- `SettingsSchema` — for provider settings declaration
- `GuestRole` — `'viewer' | 'social' | 'participant' | 'moderator'`
- `ShareLinkConfig` — extended with `role` and optional `deviceCaps`
- Publish these as a shared types package or a file in the core repo that providers import

**2.2 — Build the plugin loader**
- Reads plugin config from addon config
- Dispatches by `type` field to type-specific initializers
- For `device-provider` type, for each enabled provider:
  - Locates the provider directory
  - Reads and validates `manifest.yaml`
  - Checks `providerApiVersion` compatibility
  - Checks host requirements (bluetooth, serial, network)
  - Checks required settings are configured
  - Reads `aiInteraction` policy and stores it for the permission system
  - Reads `riskFlags` and stores them for the disclosure system
  - Dynamically imports `src/index.ts`
  - Calls `initialize()` with config
- On failure: logs clearly, skips provider, continues startup
- Exposes a `PluginRegistry` that the rest of the server uses to access loaded plugins
- Designed for future `type: pal` — the dispatch exists, just no handler yet

**2.3 — Build the command router**
- Replaces the current `toybox.service.ts` → `buttplugClient.sendCommand()` path
- When a device command arrives:
  - Checks guest role (must be Participant or above)
  - Checks AI interaction flag if the guest is a Pal (future-proofing)
  - Identifies which provider owns the target device (from panel ID prefix)
  - Applies the settings cascade (Tier 2 device cap → Tier 3 room cap → share link cap → clamp value)
  - Calls the provider's `sendCommand()`
- Provider events (device discovered, connected, disconnected) are wired to the existing listener pattern

**2.4 — Implement settings cascade**
- Tier 1: Loaded from provider manifest + addon config
- Tier 2: Stored in database per device (evolve existing `globalSettings`)
- Tier 3: Stored in database per room-device assignment (evolve existing `settings` on device assignment)
- Share link caps: Stored on the share link record, applied during command routing
- Clamping logic: utility function that takes a command value and returns the clamped value after applying all applicable tiers

**2.5 — Implement guest role system**
- Extend `ShareLinkConfig` with `role` field (default: `participant` for backward compat)
- Extend share link creation API and UI to include role selection
- Extend `roomGuests` table with `role` column
- Update `handleGuestConnection` to store and enforce the role
- Update `device:command` handler to check role before routing
- Update chat/voice/media handlers to check role (Social and above for communication, Viewer gets nothing)
- Moderator: wire emergency stop access, activity feed visibility

**2.6 — Risk disclosure system**
- When a provider with `riskFlags` is enabled for the first time, show a disclosure screen with all flags (severity + description)
- Host must acknowledge ("I understand") to complete enablement — stored per provider so it only shows once
- If a provider update introduces new risk flags, re-show disclosure for the new flags only
- In room config, show a compact risk badge next to devices from providers with high-severity flags
- Tapping the badge shows the full flag descriptions
- Store acknowledgments in the database (provider name + flag hash → acknowledged timestamp)

**2.7 — In-room access pairing**
- PlayRooms exposes a direct port (e.g., 3000) separate from HA Ingress for guest and in-room connections
- Admin dashboard: "Show In-Room QR" button in room header, generates pairing URL (`/pair/room-{id}`)
- Pairing endpoint: on unknown device, generate 4-digit code (60s TTL, one-use, rate-limited 3 attempts/min)
- Code challenge flow: display code on admin dashboard + phone, phone submits code, Host validates
- On match: issue signed JWT (room ID, Moderator role, `present: true`, session-scoped expiry)
- Reconnection: phone presents stored token, Host validates signature and expiry, reconnects silently
- Admin controls: status indicator (connected/not connected), revoke access button, regenerate QR button
- Token invalidation: admin revoke, QR regeneration, or room session end all kill active in-room tokens

**2.8 — External emergency stop triggers**
- Register `playrooms.emergency_stop` as an HA service at addon startup (HA mode only)
- Implement `POST /api/emergency-stop` REST endpoint with admin-token auth (standalone mode, also available in HA mode)
- Both paths call the same internal `stopAll()` as the UI button
- Log the trigger source (HA service / REST API / UI button / Socket.IO) in the activity feed
- Publish a companion HA Blueprint YAML for voice safeword and physical button automations (separate file in `blueprints/` directory)

**2.9 — Command coordination (server-side)**
- Per-guest throttle in CommandRouter: configurable max commands/sec per guest per device (default 10)
- Room aggregate rate limit: configurable max commands/sec across all guests per device (default 20)
- Control cooldown: after a guest changes a control, lock that control (or panel) for other guests for N seconds
- Lock granularity support: read `lockGranularity` from panel schema (panel or control), host can override per room
- Provider coalescing: providers declare `maxCommandRate` and `coalescingStrategy` in manifest; CommandRouter respects declared rate
- Cooldown bypass for Moderator+ commands
- Room-level `commandPolicy` configuration: `guestThrottle`, `controlCooldown`, `deviceCooldown`, `aggregateRate`

**2.10 — Guest moderation tools (server-side)**
- Guest freeze: block all device commands from a specific guest, with configurable duration
- Voice mute: block a guest's audio broadcast, with configurable duration
- Video disable: block a guest's video broadcast, with configurable duration
- Chat mute: block a guest's chat messages, with configurable duration
- Kick: remove guest from room, invalidate token for configurable rejoin cooldown
- Ban: remove guest and permanently invalidate token
- Duration system: all non-permanent actions accept a duration (1m, 5m, 15m, session, custom), auto-restore on expiry
- Privacy-first re-enable: on timer expiry, controls/mic/camera unlock but stay off — guest must re-enable
- Activity feed logging for all moderation actions (action taken, target guest, duration, auto-restore events)
- Room-level default durations: configurable defaults for each moderation action type

### Done Looks Like
- TypeScript types for the full plugin system are defined and importable
- The server starts up, reads plugin config, loads the Buttplug provider through the new loader
- Commands flow through the router and cascade, reaching the same Buttplug code as before
- Share links can be created with different roles (viewer, social, participant, moderator)
- A viewer guest can observe but not interact; a social guest can chat but not control devices
- Enabling a provider with risk flags shows a disclosure screen; the host acknowledges and proceeds
- Risk badges appear next to flagged devices in room configuration
- PlayRooms is accessible on its direct port without HA Ingress auth
- Admin can display a QR code, in-room person scans it, completes code challenge, gets Moderator access with quick-action UI
- In-room person's phone reconnects silently after screen lock without re-pairing
- Admin can revoke in-room access and regenerate the QR code
- An HA automation calling `playrooms.emergency_stop` triggers stopAll() on all active devices
- The REST endpoint `/api/emergency-stop` works with admin auth in standalone mode
- Activity feed shows which trigger source fired the stop
- Per-guest command throttle prevents flooding — commands beyond the limit are dropped
- Control cooldown prevents slider tug-of-war — a guest who changes a control locks it briefly for others
- Moderator can freeze a guest's controls, mute voice/chat, disable video — all with timed auto-restore
- Frozen guest sees locked indicators with countdown; controls unlock but stay off on expiry
- Moderator can kick or ban a guest from the context menu
- All 3.3.0 functionality still works for participant-role guests — this is a transparent abstraction layer
- A second (stub) provider could be enabled in config and would load without crashing

---

## Milestone 3: Toy Panel Rendering

**Goal:** Replace the hardcoded ToyBox client UI with a schema-driven renderer that builds panels from provider schemas.

### Tasks

**3.1 — Schema-driven panel renderer**
- New React component: `ToyPanelRenderer`
- Accepts a `ToyPanelSchema` and renders the appropriate controls
- Control primitive components (11 types — see Architecture doc §4.3):
  - `PanelSlider` — standard scalar control (covers ~90% of Buttplug devices)
  - `PanelRampSlider` — slider with smooth transition, countdown animation, mandatory ramp mode
  - `PanelPositionControl` — compound position + duration for LinearCmd devices (strokers)
  - `PanelBidirectionalSlider` — center-zero with direction labels for rotation
  - `PanelTimedButton` — action for duration, countdown UI, cancel on re-press
  - `PanelLinkedGroup` — wraps child controls with link/unlink toggle
  - `PanelToggle`, `PanelButton`, `PanelButtonGroup`, `PanelDropdown`, `PanelPatternPicker`
- Each control component handles its own state and emits commands via the existing Socket.IO `device:command` event (with expanded command payload)
- `PanelStatusIndicator` — renders battery, signal, activity, and custom sensor types

**3.2 — Role-based panel views**
- `ToyPanelHost` — renders `hostControls` + status indicators + per-device stop button + activity feed
- `ToyPanelModerator` — renders `hostControls` + status indicators + per-device stop button (same as host minus room config)
- `ToyPanelGuest` — renders `guestControls` filtered by host's toggle configuration (used for Participant and Social roles)
- `ToyPanelViewer` — renders read-only device state (no interactive controls)
- Host toggle UI: checkboxes in room settings that control which `guestToggleable` controls are visible

**3.3 — Emergency stop UI**
- Global "Kill All" button in ToyBox widget header — always visible when any device is active
- Sends platform-level stop command (not routed through any specific panel)
- Per-device stop button in each host panel
- Visual confirmation: panels go to an "emergency stopped" state with clear indication

**3.4 — Host activity feed**
- Compact live feed in the ToyBox showing per-device status
- Current intensity values, active patterns, last-changed-by
- Connection status per device
- Scrollable, capped buffer (last N events)

**3.5 — Room-level panel configuration UI**
- In Room Settings → Devices section:
  - For each assigned device, show the provider's panel schema
  - Per-control max overrides (Tier 3)
  - Guest panel toggle controls (show/hide each guestToggleable control)
  - Preview of what the guest will see

**3.6 — Presets (platform feature)**
- Save/load named snapshots of panel control state
- "Save preset" button in host panel, stored per room-device assignment
- "Presets" drawer with named recall buttons
- No provider involvement — platform stores `{ controlId: value, ... }` and restores

**3.7 — Control state indicators**
- Three-channel visual system on every interactive control: ring color + corner icon badge + tap-to-reveal popover
- Ring colors: none (available), blue (active/you), amber (cooldown/locked by guest), red (hard lock/safety), grey (disabled)
- Corner icons: timer, user avatar, lock, shield, snowflake/pause, exclamation, question mark, slash (see Architecture doc §9.4)
- Cooldown ring animation: circular wipe draining like a clock, driven by CSS custom properties + JS timer
- Tap-to-reveal: shadcn/ui Popover with plain-language explanation of current state
- Accessibility: no control state relies on color alone — icon channel always present
- Ring thickness: 3–4px minimum for readability on 375px screens in dim lighting

**3.8 — Guest moderation UI**
- Guest context menu: tap guest name in guest list → available actions with current state indicators
- Duration picker: 1 min / 5 min / 15 min / session / custom — one-tap uses room default, long-press for full picker
- Visual feedback for moderated guests: locked indicators with countdown on affected controls/widgets
- Timed moderation countdown: visible ring countdown on affected mic/video/chat controls, matching §9.4 indicator system
- System messages: "Your voice is available again" / "Your video is available again" on timer expiry
- Moderator view: guest list shows current moderation state per guest (muted icon, frozen icon, etc.)

**3.9 — Tiered intervention UI**
- Per-control zero button: small stop icon on each control, visible to Moderator+ only
- Per-panel zero button: stop button in Toy Panel header, visible to Moderator+ only
- "Zeroed by moderator" indicator on controls that have been moderator-zeroed
- Override visual: when moderator adjusts a control, activity feed shows "Moderator overrode {control}: {old} → {new}"
- Emergency stop UI (from 3.3) remains unchanged — global Kill All in ToyBox header

**3.10 — Widget layout system**
- Mobile (375px): primary content area (70–80% screen) + one floating PiP overlay
- PiP overlay: small draggable window, tap to expand, tap outside to shrink, drag to any corner
- Default: ToyBox primary, Webcam as PiP overlay
- Widget switcher: bottom tab bar or drawer for widgets not visible as primary or overlay
- Desktop (1024px+): flexible grid with multiple widgets side-by-side, collapsible to header bars
- Collapsed headers show minimal status (unread count, active device count)
- State persistence: layout preference stored per-session, survives reconnect
- Responsive breakpoints: 375px (mobile PiP), 768px (tablet), 1024px+ (desktop grid)

### Done Looks Like
- ToyBox renders panels dynamically from provider schemas using all 11 control primitives
- A Buttplug vibrator shows the same slider control as before (visual parity with 3.3.0)
- A dual-motor device (Lovense Edge) shows a linked group with sync toggle
- A DG-LAB Coyote shows ramp sliders with smooth transitions and device-side feedback indicators
- A stroker (The Handy) shows position + duration compound control
- Different roles see different panel views: host gets full control + monitoring, moderator gets controls + emergency stop, participant gets interactive controls, social sees read-only state, viewer sees minimal state
- Emergency stop works globally and per-device
- Host can see live activity for all devices in their room
- Share link role determines which panel view a guest gets
- Every control shows ring color + icon badge reflecting its state (available, active, cooldown, locked, disabled)
- Tapping a state indicator shows a popover explaining why (cooldown timer, who's controlling, role restriction)
- Cooldown countdown ring animates on locked controls
- Moderator can zero individual controls or entire panels from the UI
- Moderator can freeze/mute/disable guests from the context menu with duration picker
- Moderated guests see locked indicators with countdown; controls/mic/camera re-enable manually after expiry
- Mobile layout shows primary widget + PiP overlay; desktop shows flexible grid
- Guest can drag PiP overlay to any corner, expand/collapse, switch primary widget

---

## Milestone 4: Buttplug Provider (Full Implementation)

**Goal:** The extracted Buttplug code fully implements ProviderInterface and works through the new abstraction with zero regressions.

### Tasks

**4.1 — Implement ProviderInterface**
- Wrap existing `client.ts`, `engine.ts`, `protocol-filter.ts`, `device-approval.ts` behind the interface
- `initialize()`: starts engine, connects client
- `startDiscovery()` / `stopDiscovery()`: wraps existing scan logic
- `sendCommand()`: translates `DeviceProviderCommand` → existing Buttplug command calls
- `stopAll()` / `stopDevice()`: calls `device.stop()` on all/specific devices
- `getDevicePanelSchema()`: dynamically generates panel schema from `device.messageAttributes`

**4.2 — Dynamic panel schema generation**
- Inspect each discovered device's capabilities
- Build a `ToyPanelSchema` with appropriate controls:
  - Vibrate capability → intensity slider
  - Rotate capability → speed slider + direction toggle
  - Linear capability → position slider
  - Battery → status indicator
- Handle multi-actuator devices (e.g., dual vibration motors)

**4.3 — Provider documentation**
- Write comprehensive `README.md`: supported devices, connection requirements, setup
- Write `SAFETY.md`: what stop does, connection loss behavior, Intiface Engine dependency
- Write `CONTROLS.md`: each control type, value ranges, physical behavior mapping

**4.4 — Regression testing**
- Every item from the 3.3.0 QA checklist must still pass
- Device discovery, approval, protocol filtering all work through the provider layer
- Settings cascade correctly clamps values
- Commands reach devices at the correct intensity

### Done Looks Like
- Buttplug provider is a standalone repo implementing ProviderInterface
- All existing 3.3.0 device functionality works identically through the new architecture
- Provider has complete documentation meeting the spec requirements
- Panel schemas render correctly in the new ToyBox UI

---

## Milestone 5: DG-LAB Providers

**Goal:** Build the first non-Buttplug providers, validating the architecture with a fundamentally different device type.

### Tasks

**5.1 — DG-LAB WebSocket provider (dglab-ws)**
- Implement WebSocket connection to DG-LAB relay server
- Implement the pairing flow (QR code generation, client ID binding)
- Implement the command protocol:
  - `setIntensityA` / `setIntensityB` → strength commands
  - `setWaveformA` / `setWaveformB` → pulse waveform data
  - `emergencyStop` → zero both channels + clear waveform queues
- Build the Coyote panel schema (dual channel, waveform picker, status)
- Handle connection lifecycle (DG-LAB app connect/disconnect, heartbeat)
- Implement the strength feedback loop (receiving current device state from app)

**5.2 — DG-LAB BLE provider (dglab-ble)**
- Implement BLE connection to Coyote V3 hardware
- Implement the V3 BLE protocol:
  - B0 commands (100ms interval, dual channel intensity + waveform)
  - BF commands (soft limits, frequency balance)
  - B1 response handling (strength feedback)
  - Battery monitoring (0x1500 characteristic)
- Handle BLE connection lifecycle, reconnection
- Same panel schema as dglab-ws (shared or duplicated)

**5.3 — Provider documentation for both**
- `SAFETY.md` for e-stim: electrode placement, contraindications, intensity guidance, connection loss behavior specific to each transport
- `CONTROLS.md`: dual-channel controls, waveform patterns, value ranges and physical meaning
- `README.md`: setup instructions specific to each connection method

**5.4 — Integration testing**
- Both providers load alongside Buttplug without conflicts
- Coyote panels render correctly with all controls functional
- Emergency stop works reliably for both transports
- Settings cascade applies correctly (Tier 2 caps respected at Tier 3/4)

### Done Looks Like
- Two DG-LAB providers ship, each with complete documentation
- A user can install either based on their setup (has Bluetooth vs. has DG-LAB app)
- The Coyote dual-channel UI works in ToyBox alongside Buttplug devices
- The architecture is validated — two fundamentally different device types coexist cleanly

---

## Milestone 6: Polish & Documentation

**Goal:** Prepare for release. Documentation, testing, edge cases.

### Tasks

- Provider developer guide: "How to build a PlayRooms Device Provider"
- User documentation: updated setup guides for the new repo structure
- Curated list of community / unofficial providers (GitHub markdown list)
- Edge case handling: provider crash recovery, device disconnect mid-command, etc.
- Performance: panel schema rendering with many devices (10+ panels)
- Accessibility: keyboard navigation for panel controls, screen reader labels

---

## Estimated Scope

| Milestone | Size | Dependencies |
|---|---|---|
| 1: Repo Scaffolding | Medium | None |
| 2: Plugin Loader, Provider Interface & Guest Roles | Large | M1 |
| 3: Toy Panel Rendering | Large | M2 |
| 4: Buttplug Provider | Medium | M2, M3 |
| 5: DG-LAB Providers | Large | M2, M3 |
| 6: Polish & Docs | Medium | M4, M5 |

Milestones 4 and 5 can run in parallel once M2 and M3 are complete.

---

## v1.1 Horizon: PlayRooms Pals

Not in scope for this roadmap. See Architecture doc §12 for design notes. The v1.0 plugin loader, guest role system, and AI interaction flags are designed to support Pals without rearchitecting. Key v1.1 tasks would include:

- Define `PalInterface` contract
- Build Pal plugin handler in the loader
- Build internal Socket.IO connection path for system guests
- Build personality/system prompt configuration UI
- Build AI-specific intensity cap logic in the command router
- Implement `PlayRooms-Pal-Ollama` as the first Pal plugin
- Privacy disclosure UI for cloud-backed Pal plugins

---

## Notes for Claude Code

This roadmap defines **what** needs to be built and **what done looks like** for each milestone. It intentionally does not prescribe **how** to implement each task. Claude Code should:

1. Read the Architecture doc (`ARCHITECTURE-v1.0.md`) before starting any milestone
2. Make implementation decisions based on the codebase and the problem brief
3. Produce a QA checklist after each milestone scoped to exactly what changed
4. Update the CHANGELOG in each affected repository
5. Flag any conflicts between this roadmap and reality encountered during implementation
