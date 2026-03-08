# PlayRooms Documentation

## Overview

PlayRooms is a Home Assistant addon (or standalone Docker container) for managing intimate device control rooms with guest access, real-time communication, and plugin-based device providers.

**Key features:**
- **Rooms** — create private rooms with configurable widgets (ToyBox, Chat, Voice, Video, Webcam)
- **Guest access** — share rooms via links with role-based permissions (viewer, social, participant, moderator, host)
- **Device control** — plugin-based device providers with a three-step safety system (engine start, protocol filter, device approval)
- **Remote access** — connect to a PlayRooms Portal server for guest access from outside your network
- **Privacy-first** — runs entirely on your home network, no cloud dependency

## Configuration Reference

### HA Addon Options (`config.yaml`)

All options are set on the addon's **Configuration** tab in Home Assistant.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `accept_terms` | bool | `false` | Must be `true` for the addon to start. Acceptance of the Terms of Use and Liability Disclaimer. |
| `intiface_port` | int | `12345` | WebSocket port for the Intiface Engine server (internal, not exposed) |
| `server_port` | int | `8099` | HTTP port for the PlayRooms web server (ingress port) |
| `scan_on_start` | bool | `false` | Auto-start engine and scan for devices on boot. If `false`, host starts engine manually from Settings. |
| `scan_timeout` | int | `30000` | Auto-stop device scan after this many milliseconds (5000–120000) |
| `device_stale_days` | int | `90` | Automatically remove denied devices not seen in this many days. Set to 0 to disable. |
| `log_level` | string | `"info"` | Server log verbosity level (`debug`, `info`, `warn`, `error`) |
| `use_bluetooth` | bool | `false` | Enable Bluetooth LE device scanning. Requires a Bluetooth adapter on the host. Restart required after change. |
| `use_serial` | bool | `false` | Enable serial port device scanning (USB-to-serial adapters, Lovense serial dongles). Restart required after change. |
| `use_hid` | bool | `false` | Enable USB HID device scanning (Lovense HID dongles). Restart required after change. |
| `portal_url` | string | `""` | URL of a PlayRooms Portal server for remote guest access. Leave empty to disable. |
| `portal_secret` | string | `""` | Shared secret for authenticating with the Portal server. Must match the Portal's configured secret. |

### Standalone Docker Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCEPT_TERMS` | `false` | Must be `true` to start |
| `SERVER_PORT` | `8099` | HTTP server port |
| `AUTH_MODE` | auto-detected | `ha-ingress` or `standalone` |
| `JWT_SECRET` | auto-generated | JWT signing secret |
| `DATA_DIR` | `./data` | Database and config storage |
| `CORS_ORIGINS` | `*` (HA) / `""` (standalone) | Allowed CORS origins |
| `PORTAL_URL` | — | Portal relay server URL |
| `PORTAL_SECRET` | — | Portal shared secret |

## Transport Requirements

PlayRooms discovers and communicates with physical devices via the Intiface Engine. Each transport type requires specific hardware and host permissions.

### Bluetooth LE

- **Hardware:** USB Bluetooth adapter physically connected to the host machine
- **HA Permission:** `host_dbus` (declared automatically in config.yaml)
- **Notes:** Built-in Wi-Fi/Bluetooth combos may not work reliably. A dedicated USB adapter (e.g., Cambridge Silicon Radio CSR 4.0) is recommended. The adapter must be available to the HA host — if running in a VM, USB passthrough is required.

### Serial Port

- **Hardware:** USB-to-serial adapter (e.g., Lovense USB dongle, FTDI adapter) connected to the host
- **HA Permission:** `uart` (declared automatically in config.yaml)
- **Device path:** Typically `/dev/ttyUSB0` or `/dev/ttyACM0`

### USB HID

- **Hardware:** USB HID dongle (e.g., Lovense HID dongle) connected to the host
- **HA Permission:** `usb` (declared automatically in config.yaml)
- **Device path:** Typically `/dev/hidraw0`

### Important Notes

- Transport changes require an addon restart (no rebuild needed)
- At least one transport must be enabled for device discovery to work
- The addon declares `host_dbus`, `uart`, and `usb` permissions automatically — no manual Docker flags are needed when running as an HA addon

## Hardware Passthrough (Standalone Docker)

When running PlayRooms as a standalone Docker container (not via HA Supervisor), you must manually configure hardware access.

### Docker Compose Example

```yaml
services:
  playrooms:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8099:8099"
    volumes:
      - playrooms-data:/data
      - /var/run/dbus:/var/run/dbus        # Required for Bluetooth
    devices:
      # Uncomment the devices you have:
      # - /dev/ttyUSB0:/dev/ttyUSB0        # Serial dongle
      # - /dev/hidraw0:/dev/hidraw0        # HID dongle
    environment:
      - ACCEPT_TERMS=true
      - SERVER_PORT=8099
      - USE_BLUETOOTH=true
      - USE_SERIAL=false
      - USE_HID=false
    privileged: true                        # Simplest approach for dev
    restart: unless-stopped

volumes:
  playrooms-data:
```

### Minimal Permissions (Production)

Instead of `privileged: true`, you can use granular capabilities:

```yaml
cap_add:
  - NET_ADMIN        # Bluetooth
  - SYS_ADMIN        # Device access
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
  - /dev/hidraw0:/dev/hidraw0
```

## Setup Guides

Detailed platform-specific setup guides are available:

- [Home Assistant Supervisor](../../docs/setup-guides/setup-home_assistant_supervisor.md) — primary platform
- [VirtualBox on Windows](../../docs/setup-guides/setup-virtualbox.md) — development/testing
- [Proxmox VE](../../docs/setup-guides/setup-proxmox.md) — tested

## Tested Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Home Assistant Supervisor | ✅ Primary platform | Native addon, Supervisor handles hardware access |
| VirtualBox on Windows | ✅ Development/testing | Requires Extension Pack for USB passthrough |
| Proxmox VE | ✅ Tested | Full VM recommended for Bluetooth, LXC for serial/HID only |
| Standalone Docker | Supported | Manual hardware passthrough required (see above) |

> **amd64 only.** The Intiface Engine binary is x86_64 Linux only. There is no ARM build. Raspberry Pi and other ARM-based installations are not supported.

## Architecture

### Server

- **Runtime:** Node.js with Express and Socket.IO
- **Database:** SQLite via Drizzle ORM (WAL mode)
- **Auth:** Dual-mode — HA Ingress for admin, token-based for guests
- **Device Control:** Plugin-based providers (currently Buttplug.io shim)

### Client

- **Framework:** React 18 SPA served by Express
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **i18n:** react-i18next with namespaced JSON translations
- **Build:** Vite

## API Endpoints

### Health & Status
- `GET /api/health` — Server health check (public)

### Auth (Standalone mode only)
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/register` — Register initial admin user

### Rooms
- `GET /api/rooms` — List all rooms (host only)
- `POST /api/rooms` — Create a room
- `GET /api/rooms/:id` — Get room details
- `PUT /api/rooms/:id` — Update room
- `DELETE /api/rooms/:id` — Delete room

### Share Links
- `POST /api/rooms/:id/share` — Create share link
- `GET /api/rooms/:id/share` — List share links for room
- `DELETE /api/share/:token` — Revoke share link
- `GET /api/join/:token` — Validate share link (public, rate-limited)

### Engine Lifecycle
- `POST /api/engine/start` — Start Intiface Engine
- `POST /api/engine/stop` — Stop Intiface Engine
- `POST /api/engine/restart` — Restart Intiface Engine
- `GET /api/engine/status` — Engine status

### Devices
- `GET /api/devices` — List approved connected devices
- `GET /api/devices/discovered` — List all discovered devices
- `POST /api/devices/scan/start` — Start scanning
- `POST /api/devices/scan/stop` — Stop scanning
- `GET /api/devices/scan/status` — Scan status
- `POST /api/devices/:id/approve` — Approve device
- `POST /api/devices/:id/deny` — Deny device
- `POST /api/devices/:id/reset` — Reset device to pending
- `DELETE /api/devices/:id` — Forget device
- `POST /api/devices/:id/assign` — Assign device to room
- `POST /api/devices/:id/unassign` — Unassign device
- `GET /api/devices/:id/settings` — Get device global settings
- `PUT /api/devices/:id/settings` — Update device global settings

### Protocols
- `GET /api/protocols` — List protocols
- `PUT /api/protocols/:name` — Enable/disable protocol

### Disclaimer
- `GET /api/disclaimer/status` — Check disclaimer acceptance status
- `POST /api/disclaimer/accept` — Accept current disclaimer version

### Webhooks
- `GET /api/rooms/:roomId/webhooks` — List webhooks
- `POST /api/rooms/:roomId/webhooks` — Create webhook
- `PUT /api/rooms/:roomId/webhooks/:id` — Update webhook
- `DELETE /api/rooms/:roomId/webhooks/:id` — Delete webhook

### API Keys
- `GET /api/keys` — List API keys
- `POST /api/keys` — Create API key
- `DELETE /api/keys/:id` — Delete API key

### Portal
- `GET /api/portal/info` — Portal connection info

## Socket.IO Events

### Server → Client
- `guest:approved` — Guest approved to join
- `guest:joined` — Guest joined room
- `guest:left` — Guest left room
- `lobby:pending` — Guest waiting for approval
- `device:state` — Device state update
- `chat:message` — Chat message
- `room:state` — Full room state sync
- `webrtc:offer/answer/ice` — WebRTC signaling
- `voice:ptt-start/end` — Push-to-talk

### Client → Server
- `guest:join` — Guest join request
- `lobby:approve/reject` — Host approves/rejects guest
- `device:command` — Device control command
- `chat:message` — Send chat message
- `webrtc:offer/answer/ice` — WebRTC signaling
- `voice:ptt-start/end` — Push-to-talk

## Relay Protocol

The Host connects outbound to a Portal server via Socket.IO for remote guest access. The relay protocol types are defined in `server/src/shared/relay-types.ts` (source of truth — copied to Portal).

Current protocol version: `RELAY_PROTOCOL_VERSION = 1`

## i18n

All user-facing strings use `react-i18next`. Translation files are in `client/src/locales/{lang}/`:

- `common.json` — Shared UI strings
- `room.json` — Room-related strings
- `toybox.json` — ToyBox and device control strings
- `consent.json` — Legal/consent text
- `moderation.json` — Moderation actions

To add a new language, copy the `en/` directory and translate all strings.
