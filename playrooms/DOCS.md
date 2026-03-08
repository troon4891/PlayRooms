# PlayRooms Technical Documentation

## Overview

PlayRooms is a Home Assistant addon (or standalone Docker container) for managing intimate device control rooms with guest access, real-time communication, and plugin-based device providers.

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

## Configuration

### HA Addon Options (`config.yaml`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `accept_terms` | bool | `false` | Must be true for addon to start |
| `intiface_port` | int | `12345` | Intiface Engine WebSocket port |
| `server_port` | int | `8099` | HTTP server port |
| `scan_on_start` | bool | `false` | Auto-scan for devices on startup |
| `scan_timeout` | int | `30000` | Scan auto-stop timeout (ms) |
| `device_stale_days` | int | `90` | Auto-remove denied devices after N days |
| `log_level` | string | `"info"` | Log verbosity |
| `use_bluetooth` | bool | `false` | Enable BLE scanning |
| `use_serial` | bool | `false` | Enable serial device scanning |
| `use_hid` | bool | `false` | Enable USB HID scanning |
| `portal_url` | string | `""` | Portal server URL |
| `portal_secret` | string | `""` | Portal shared secret |

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
