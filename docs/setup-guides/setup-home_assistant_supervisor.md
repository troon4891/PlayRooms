# Home Assistant Supervisor Setup Guide

> **Note:** This guide is being updated for PlayRooms v1.0. Some details may reference the previous version.

Official setup guide for running PlayRooms as a Home Assistant add-on via the Supervisor.

> **Platform status:** ✅ Primary platform

---

## Overview

This guide covers installing and configuring PlayRooms as a native Home Assistant add-on. The Supervisor handles the Docker build, container lifecycle, and ingress authentication — no manual Docker or user account setup required.

### Architecture

```
Home Assistant OS / Supervised
└─ HA Supervisor
   └─ PlayRooms Add-on Container (Docker)
      ├─ intiface-engine ─── device protocols
      ├─ Node.js server ──── web UI (via ingress)
      ├─ SQLite database ─── persistent data
      └─ Hardware access:
         ├─ D-Bus ─────────── Bluetooth adapter (host_dbus)
         ├─ /dev/ttyUSB* ──── Serial dongle (uart)
         └─ /dev/hidraw* ──── USB HID dongle (usb)
```

### What You Need

- **Home Assistant OS** or **Home Assistant Supervised** on amd64 hardware
- **A web browser** to access the HA frontend
- **Optional hardware**: Bluetooth USB adapter, Lovense USB dongle, or other Buttplug.io-compatible device physically connected to the HA host

> **amd64 only.** The Intiface Engine binary is x86_64 Linux only. There is no ARM build. Raspberry Pi and other ARM-based HA installations are not supported.

---

## 1. Install the Add-on

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**
2. Click the three-dot menu (top right) and select **Repositories**
3. Add this repository URL:
   ```
   https://github.com/troon4891/PlayRooms
   ```
4. Close the dialog and refresh the page
5. Find **PlayRooms** in the add-on list and click it
6. Click **Install**

**Build time:** The first install builds the Docker image from source. This downloads all dependencies, compiles the server and client, and downloads the Intiface Engine binary. Expect **5-15 minutes** depending on your hardware and internet speed. This only happens on first install or when the add-on is rebuilt.

### Verify Installation

After the build completes:
- The add-on status should show **Started** (if auto-start is enabled) or ready to start
- A **PlayRooms** entry appears in the HA sidebar (if "Show in sidebar" is enabled)

---

## 2. Configure Transports

Before the engine can discover devices, you must enable at least one transport matching your hardware.

Go to the add-on's **Configuration** tab and set the transport options:

| Option | Default | Set to `true` if... |
|--------|---------|---------------------|
| `use_bluetooth` | `false` | You have a Bluetooth USB adapter on the HA host |
| `use_serial` | `false` | You have a serial dongle (Lovense USB, FTDI adapter) |
| `use_hid` | `false` | You have a USB HID dongle (Lovense HID) |

Click **Save** after changing options, then **restart** the add-on.

> Transport changes require an add-on restart. No rebuild is needed.

### Hardware Requirements by Transport

| Transport | Hardware | HA Permission | How to Verify |
|-----------|----------|---------------|---------------|
| Bluetooth LE | USB Bluetooth adapter on HA host | `host_dbus` (automatic) | `ha host info` shows Bluetooth, or check HA hardware page |
| Serial | USB-to-serial adapter (e.g., `/dev/ttyUSB0`) | `uart` (automatic) | HA **Settings > System > Hardware** shows serial device |
| USB HID | USB HID dongle (e.g., `/dev/hidraw0`) | `usb` (automatic) | HA **Settings > System > Hardware** shows HID device |

The add-on declares `host_dbus`, `uart`, and `usb` permissions automatically — no manual Docker flags needed. The Supervisor handles hardware access.

---

## 3. Start the Add-on

1. Go to the add-on's **Info** tab
2. Click **Start**
3. Optionally enable:
   - **Start on boot** — the add-on starts when HA boots
   - **Show in sidebar** — adds a PlayRooms link to the HA sidebar

### Check the Logs

Go to the add-on's **Log** tab. Expected output on first start:

```
[PlayRooms] Auth mode: ha-ingress
[PlayRooms] Running database migrations...
[PlayRooms] Engine will start when host clicks 'Start Engine' in Settings
[PlayRooms] Server listening on port 8099
```

If `scan_on_start` is `true`, you'll see:

```
[PlayRooms] Auth mode: ha-ingress
[PlayRooms] Running database migrations...
[PlayRooms] scan_on_start enabled — starting Intiface Engine...
[Engine] Transport configuration:
[Engine]   Bluetooth LE: ENABLED
[Engine]   Serial Port:  disabled
[Engine]   USB HID:      disabled
[Engine]   Bluetooth hardware: Found adapter(s): hci0
[Engine] Starting Intiface Engine on port 12345
[PlayRooms] Intiface Engine started
[PlayRooms] Connecting Buttplug client...
[PlayRooms] Buttplug client connected
[PlayRooms] Auto-scan started
[PlayRooms] Server listening on port 8099
```

---

## 4. Open the Web UI

Click **Open Web UI** on the add-on's Info tab, or click **PlayRooms** in the HA sidebar.

The web UI loads via HA ingress — you're automatically authenticated as the host using your HA session. No separate login is needed.

---

## 5. Device Setup

PlayRooms uses a three-step device safety system to prevent unintended device connections.

### Step 1: Start the Engine

1. Go to **Settings** in the PlayRooms web UI
2. Click **Start Engine** — this launches the Intiface Engine process
3. Wait for the status to show "Engine: Running" and "Client: Connected"

> The engine does **not** auto-start unless `scan_on_start` is `true`. This is intentional — it prevents the engine from connecting to devices in Bluetooth range (including neighbors' devices) without your knowledge.

### Step 2: Configure Allowed Protocols

Before scanning, expand the **Allowed Protocols** section in Settings. This controls which device brands the engine will recognize.

- **Lovense** and **Hismith** are enabled by default
- Enable additional protocols matching your devices (We-Vibe, Kiiroo, Satisfyer, etc.)
- Devices from disabled protocols are silently ignored during scanning

### Step 3: Scan and Approve Devices

1. Click **Scan for Devices** — the engine begins Bluetooth/serial/HID discovery
2. Discovered devices appear in the **Discovered Devices** section as "Pending"
3. Click **Approve** on devices you recognize and want to use
4. Click **Deny** on devices you don't recognize
5. Approved devices become available for room assignment in the Toy Box

Approval decisions are persistent — approved devices auto-approve on future scans.

### Step 4: Assign Devices to Rooms

1. Create a Play Room from the Dashboard
2. Add a **Toy Box** widget to the room
3. Assign approved devices to the room from the device list

---

## 6. Configuration Reference

All options are set on the add-on's **Configuration** tab in HA.

| Option | Default | Description |
|--------|---------|-------------|
| `intiface_port` | `12345` | WebSocket port for the Intiface Engine server (internal) |
| `server_port` | `8099` | HTTP port for the PlayRooms web server (ingress port) |
| `scan_on_start` | `false` | Auto-start engine and scan for devices on boot. If `false`, host starts engine manually from Settings. |
| `use_bluetooth` | `false` | Enable Bluetooth LE device scanning (requires Bluetooth adapter on host) |
| `use_serial` | `false` | Enable serial port device scanning (requires serial device on host) |
| `use_hid` | `false` | Enable USB HID device scanning (requires HID device on host) |
| `portal_url` | `""` | URL of a PlayRoom Portal relay server (for remote guest access) |
| `portal_secret` | `""` | Shared secret for portal relay authentication |

---

## 7. Troubleshooting

### Engine won't start

| Check | How | Fix |
|-------|-----|-----|
| Add-on is running | Add-on Info tab | Click Start |
| Transports enabled | Add-on Configuration tab | Enable at least one (`use_bluetooth`, etc.) |
| Check logs | Add-on Log tab | Look for `[Engine]` error messages |

### "No Bluetooth adapter detected"

| Check | How | Fix |
|-------|-----|-----|
| Adapter plugged in | HA **Settings > System > Hardware** | Plug in a USB Bluetooth adapter |
| `use_bluetooth` enabled | Add-on Configuration | Set to `true` and restart |
| D-Bus access | Add-on logs | Should auto-work; `host_dbus` is declared in config |

> Bluetooth LE requires a USB Bluetooth adapter physically connected to the HA host. Built-in Wi-Fi/Bluetooth combos on laptops may not work reliably. A dedicated USB adapter (e.g., Cambridge Silicon Radio CSR 4.0) is recommended.

### Devices not appearing after scan

| Check | How | Fix |
|-------|-----|-----|
| Engine running | Settings page shows "Engine: Running" | Click Start Engine |
| Protocol enabled | Settings > Allowed Protocols | Enable the protocol for your device brand |
| Device in pairing mode | Put the physical device in pairing/discovery mode | Consult device manual |
| Check discovered list | Settings > Discovered Devices | Device may be "Pending" — click Approve |

### "Scan for Devices" button is disabled

The scan button is only active when the engine is running and the client is connected. Click **Start Engine** first.

### Add-on build fails

- Check internet connectivity on the HA host
- Try rebuilding: Add-on Info tab → three-dot menu → **Rebuild**
- Check HA Supervisor logs: **Settings > System > Logs** → select "Supervisor"

### Port 8099 conflict

If another add-on uses port 8099, change `server_port` in the add-on configuration. The ingress system will route through the new port automatically.

---

## 8. QA Checklist

```
[ ] Add-on installs without build errors
[ ] Add-on starts and logs show no errors
[ ] Web UI opens via sidebar or "Open Web UI"
[ ] Settings page loads with Engine controls
[ ] Start Engine succeeds (status: Running / Connected)
[ ] Allowed Protocols section shows toggle list
[ ] Scan for Devices discovers hardware (if device in pairing mode)
[ ] Discovered device appears as "Pending"
[ ] Approve device succeeds
[ ] Room creation works from Dashboard
[ ] Approved device assignable to room Toy Box
[ ] Share Link generation works
[ ] Share Link accessible from external browser
[ ] Guest joins through lobby flow
[ ] Add-on survives restart (data persists)
[ ] Engine stays stopped after add-on restart (unless scan_on_start=true)
```

---

## Quick Reference

### Add-on Lifecycle

| Action | Where |
|--------|-------|
| Install | HA Settings > Add-ons > Add-on Store |
| Configure | Add-on Configuration tab |
| Start/Stop | Add-on Info tab |
| View logs | Add-on Log tab |
| Rebuild | Add-on Info tab > three-dot menu > Rebuild |
| Uninstall | Add-on Info tab > Uninstall |

### Device Safety Controls (Settings Page)

| Control | Action |
|---------|--------|
| Start Engine | Launches Intiface Engine + connects Buttplug client |
| Stop Engine | Disconnects client + kills engine process |
| Scan for Devices | Begins BLE/serial/HID device discovery |
| Approve | Allows a discovered device for room assignment |
| Deny | Blocks a device (hidden from future scans) |
| Reset | Returns a denied device to pending status |
| Protocol toggles | Enable/disable device brand recognition |
