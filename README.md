# PlayRooms

![Content Rating](https://img.shields.io/badge/Content-Adults_Only-red?style=for-the-badge)
![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Home_Assistant_|_Docker-41BDF5?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-v1.0_Development-orange?style=for-the-badge)

> **⚠️ Notice**
> PlayRooms is a platform for intimate device control and is intended for adults only. By using this software, you confirm that you are of legal age in your jurisdiction. See [Terms of Use](#terms-of-use) below.

---

## What is PlayRooms?

PlayRooms is a **self-hosted platform** that creates private rooms where users can share control of connected intimate hardware devices. It runs on your own network — either as a [Home Assistant](https://www.home-assistant.io/) addon or a standalone Docker container — with no reliance on cloud services for core functionality.

Rooms combine device control with communication: text chat, voice, video, and a configurable webcam feed. Guests connect through share links, each with role-based permissions that determine what they can see and do. A relay server (the Portal) enables remote guest access without exposing your home network.

### Key Capabilities

- **Private and self-hosted** — your hardware, your network, no cloud dependency for device control
- **Multi-device support** — vibrators, e-stim, strokers, and 100+ device types through the plugin system
- **Role-based guest access** — Viewer, Social, Participant, Moderator roles with granular permission control
- **Real-time communication** — text chat, voice, video, and one-way webcam feed as independent widgets
- **Remote access** — guests connect through the Portal relay server, no port forwarding needed
- **Safety-first design** — multi-channel emergency stop (UI, voice command, physical button), tiered intervention controls, and provider-level risk disclosure
- **Extensible** — device providers are plugins; third-party developers can add support for new hardware ecosystems

---

## Architecture

PlayRooms is a multi-repository project. Each component is independently versioned and maintained:

| Repository | Purpose |
|---|---|
| **PlayRooms** (this repo) | Host platform — server, client, plugin loader, device control, guest roles, communication widgets |
| [PlayRooms-Portal](https://github.com/troon4891/PlayRooms-Portal) | Relay server for remote guest access — stateless message proxy |
| [PlayRooms-DP-Buttplug](https://github.com/troon4891/PlayRooms-DP-Buttplug) | Device Provider: [Buttplug.io](https://buttplug.io/) / Intiface Engine — vibrators, strokers, and 100+ devices |
| [PlayRooms-DP-DGLabs-WS](https://github.com/troon4891/PlayRooms-DP-DGLabs-WS) | Device Provider: DG-LAB Coyote e-stim via WebSocket (through DG-LAB mobile app) |
| [PlayRooms-DP-DGLabs-BLE](https://github.com/troon4891/PlayRooms-DP-DGLabs-BLE) | Device Provider: DG-LAB Coyote e-stim via direct Bluetooth LE |

### How It Connects

```
┌─────────────────────────────────────────────────────┐
│  Your Home Network                                  │
│                                                     │
│  ┌──────────────┐    ┌─────────────────────────┐    │
│  │ Devices      │◄──►│ PlayRooms Host           │    │
│  │ (BLE/WiFi/   │    │ ┌─────────────────────┐ │    │
│  │  Serial)     │    │ │ Device Providers    │ │    │
│  └──────────────┘    │ │ (Buttplug, DG-LAB)  │ │    │
│                      │ ├─────────────────────┤ │    │
│  ┌──────────────┐    │ │ Room Engine         │ │    │
│  │ Admin        │◄──►│ │ (ToyBox, Chat,      │ │    │
│  │ (HA / Web)   │    │ │  Voice, Video,      │ │    │
│  └──────────────┘    │ │  Webcam)            │ │    │
│                      │ └─────────────────────┘ │    │
│  ┌──────────────┐    │            ▲             │    │
│  │ LAN Guests   │◄──►│            │             │    │
│  └──────────────┘    └────────────┼─────────────┘    │
│                                   │                  │
└───────────────────────────────────┼──────────────────┘
                                    │ (outbound)
                         ┌──────────▼──────────┐
                         │  PlayRooms Portal   │
                         │  (Cloud/VPS)        │
                         └──────────▲──────────┘
                                    │
                         ┌──────────┴──────────┐
                         │  Remote Guests      │
                         │  (Phone/Browser)    │
                         └─────────────────────┘
```

---

## Safety

Safety is a core design constraint, not a feature. PlayRooms implements multiple independent safety mechanisms:

**Emergency Stop** — a platform-level kill command that immediately zeros all devices across all providers. Available as a prominent UI button, and also triggerable via Home Assistant voice commands, physical buttons (ESP32/ESPHome), or REST API. No confirmation dialogs. Providers must implement stop as a mandatory contract requirement.

**Tiered Intervention** — five levels of response between "everything is fine" and "kill all": value override, control zero, device zero, guest freeze, and emergency stop. Moderators and hosts can respond proportionally to situations without disrupting an entire session.

**Risk Disclosure** — device providers declare risk flags in their manifests (e.g., `electrical-stimulation: high`). The platform surfaces these as informed disclosure when the host enables a provider or assigns devices to a room. Not blocking — but impossible to miss.

**Settings Cascade** — a five-tier permission system where each level can only restrict, never expand. Provider defaults → device global caps → room configuration → share link caps → live state. A guest can never exceed the limits the host configured.

**Guest Roles** — Viewer, Social, Participant, and Moderator roles gate access to every feature. Share links carry a role, and the role determines what a guest can see and do.

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, SQLite (Drizzle ORM)
- **Frontend:** React, Tailwind CSS, shadcn/ui, Lucide icons
- **Device Integration:** Plugin-based providers loaded at startup
- **Deployment:** Home Assistant addon (primary) or standalone Docker
- **License:** Apache 2.0

---

## Installation

> **v1.0 is currently in development.** Installation instructions will be provided with the first release. For the previous version, see [HAButtPlugIO-PlayRooms](https://github.com/troon4891/HAButtPlugIO-PlayRooms) (v3.3.0 — final 3.x release, archived).

### Home Assistant Addon

1. Add this repository URL to your Home Assistant addon store
2. Install the PlayRooms addon
3. In the addon configuration, set `accept_terms: true` (required — see [Terms of Use](#terms-of-use))
4. Start the addon
5. Open the web UI and complete the first-boot setup

### Standalone Docker

```yaml
services:
  playrooms:
    image: ghcr.io/troon4891/playrooms:latest
    ports:
      - "3000:3000"
    environment:
      - ACCEPT_TERMS=true  # Required — see Terms of Use
    volumes:
      - playrooms-data:/data
```

---

## Terms of Use

**This software controls physical devices that interact with the human body.** By using PlayRooms, you acknowledge and accept the following:

1. Incorrect configuration, network failures, software bugs, or connection loss could result in unexpected device behavior
2. You are solely responsible for safe use, including proper device selection, intensity limits, emergency stop accessibility, and physical safety precautions
3. Electrical stimulation (e-stim) devices carry specific risks including cardiac events, burns, and muscle injury — you accept full responsibility for understanding these risks before enabling e-stim providers
4. The developers, contributors, and maintainers accept **no liability** for injury, harm, damage, or any other consequence resulting from use of this software
5. You must ensure all participants provide informed consent before participating in any room session
6. This software is provided **"AS IS"** without warranty of any kind, express or implied
7. You are responsible for compliance with all applicable laws in your jurisdiction
8. This platform is intended for use by adults of legal age in their jurisdiction

The software will not run until you explicitly accept these terms via the configuration flag (`accept_terms: true`). A detailed disclaimer is also presented on first launch.

---

## Project History

PlayRooms v1.0 is the successor to [HAButtPlugIO-PlayRooms](https://github.com/troon4891/HAButtPlugIO-PlayRooms), which reached its final release at v3.3.0. The original project was a single-repository Home Assistant addon built around the Buttplug.io library. v1.0 splits the codebase into a multi-repo architecture, introduces a hardware-agnostic plugin system, and adds support for standalone Docker deployment.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

This project uses a multi-repo structure — please ensure you're contributing to the correct repository. Device provider contributions go to the appropriate provider repo, not this one.

### AI Collaboration

This project is built with AI assistance and celebrates it openly. The architecture, documentation, and implementation involve collaboration between a human Project Designer and AI tools (Claude by Anthropic). If you're interested in how AI-assisted development works in practice, this project is an open example.

---

## Documentation

| Document | Description |
|---|---|
| [Architecture Specification](docs/ARCHITECTURE-v1.0.md) | Full technical specification — plugin system, schemas, roles, safety, consent |
| [Development Roadmap](docs/ROADMAP-v1.0.md) | Implementation milestones, task breakdowns, and acceptance criteria |
| [CLAUDE.md](CLAUDE.md) | Development instructions for AI coding assistants working on this repo |
| [Changelog](CHANGELOG.md) | Version history |
| [Third-Party Notices](NOTICE.md) | Third-party library attributions and licenses |
| [Security Policy](SECURITY.md) | How to report security vulnerabilities |

---

## License

```
Copyright 2024–2026 troon4891

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
