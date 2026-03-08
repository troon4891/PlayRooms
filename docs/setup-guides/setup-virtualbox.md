# VirtualBox Platform Setup Guide

> **Note:** This guide is being updated for PlayRooms v1.0. Some details may reference the previous version.

Official setup guide for running PlayRooms as a standalone Docker container inside a VirtualBox VM.

> **Platform status:** ✅ Tested — this is the primary development environment.

---

## Overview

This guide takes you from a fresh VirtualBox installation to a running PlayRooms container with full hardware access. It is **Windows-focused** since that is the primary development host, with notes for Mac/Linux where steps diverge.

### Architecture

```
Windows / Mac / Linux Host
└─ VirtualBox 7.x
   └─ VM: Debian 12 (Bookworm) — amd64
      ├─ BlueZ + D-Bus ─── Bluetooth adapter access
      ├─ /dev/ttyUSB* ──── Serial device access
      ├─ /dev/hidraw* ──── USB HID device access
      ├─ Docker Engine
      │   └─ PlayRooms Container
      │      ├─ intiface-engine ── device protocols
      │      └─ Node.js server ─── web UI (port 8099)
      └─ Network: Bridged or NAT+port-forward
```

### What You Need

- **VirtualBox 7.x** with the **Extension Pack** installed (required for USB 2.0/3.0 passthrough)
- **Debian 12 netinst ISO** (~600 MB download)
- **~20 GB free disk space** for the VM
- **Optional hardware**: Bluetooth USB adapter, Lovense USB dongle, or other Buttplug.io-compatible device

### Time Estimate

About 45 minutes for an experienced user, longer if this is your first VM setup.

> **amd64 only.** The Intiface Engine binary is x86_64 Linux only. There is no ARM build. Your host CPU must support hardware virtualization (VT-x / AMD-V).

---

## 1. VirtualBox Extension Pack

The VirtualBox Extension Pack adds USB 2.0 (EHCI) and USB 3.0 (xHCI) controller support. Without it, the VM can only use USB 1.1 (OHCI) — too slow for Bluetooth adapters and most USB devices.

### Install the Extension Pack

1. Check your VirtualBox version: **Help → About VirtualBox** (note the exact version, e.g. 7.1.6)
2. Download the Extension Pack matching your exact version from the [VirtualBox downloads page](https://www.virtualbox.org/wiki/Downloads) — the version **must match exactly**
3. Install:
   - **GUI**: File → Tools → Extension Pack Manager → Install → select the downloaded `.vbox-extpack` file
   - **CLI** (Windows PowerShell):
     ```powershell
     & "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" extpack install Oracle_VirtualBox_Extension_Pack-7.x.x.vbox-extpack
     ```

### Verify

```powershell
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" list extpacks
```

Expected output includes `Oracle VM VirtualBox Extension Pack` with status `usable`.

> **Mac/Linux:** Replace the VBoxManage path with just `VBoxManage` (it's typically in your PATH).

---

## 2. Base Image Selection

**Recommended: [Debian 12 (Bookworm)](https://www.debian.org/download) — server/netinst, amd64.**

Why Debian 12:
- **Same base** as the HA Docker image (`ghcr.io/home-assistant/amd64-base-debian:bookworm`) — maximizes compatibility
- **Excellent BlueZ/D-Bus support** — the Bluetooth stack that intiface-engine relies on works out of the box
- **Stable kernel** (6.1 LTS) — good USB/hardware passthrough behavior
- **Minimal install option** — no desktop overhead, lower resource usage

Why **not** other distributions:
| Distribution | Issue |
|-------------|-------|
| Ubuntu Server | snap-based Docker adds unnecessary complexity; otherwise works fine |
| Alpine Linux | musl libc breaks native Node.js modules (`better-sqlite3`) |
| Fedora/CentOS | SELinux can interfere with device passthrough; workable but more setup |

Download the **Debian 12 netinst ISO** (~600 MB):
https://www.debian.org/download

---

## 3. Create the VM

### VM Wizard Settings

Open VirtualBox → **New** (or Machine → New):

| Setting | Value | Notes |
|---------|-------|-------|
| Name | `PlayRooms-Dev` | |
| Folder | (default or your preference) | |
| ISO Image | Select the Debian 12 netinst ISO | |
| Type | Linux | |
| Version | Debian (64-bit) | |
| Base Memory | **4096 MB** (minimum 2048) | Docker + container need headroom |
| Processors | **2** (minimum), 4 recommended | |
| Hard Disk | **20 GB**, dynamically allocated VDI | Can grow later if needed |

Click **Finish** (do **not** start the VM yet).

### Configure USB Controller

1. Select the VM → **Settings → USB**
2. Check **Enable USB Controller**
3. Select **USB 3.0 (xHCI) Controller**
   - If this option is grayed out, the Extension Pack is not installed — go back to step 1

> **Why USB 3.0?** Bluetooth Low Energy adapters and Lovense dongles work on USB 2.0+. The xHCI controller supports both USB 2.0 and 3.0 devices. The default OHCI (USB 1.1) controller cannot handle BLE traffic reliably.

### ⚠️ Take a Snapshot

Before installing the guest OS, take a snapshot:

**Machine → Take Snapshot** → Name: `Clean VM - pre-install`

This lets you revert to a clean state if the OS install goes wrong.

---

## 4. Network Configuration

You need to decide how the VM will connect to your network. This affects whether Share Links and WebRTC features work for other devices on your network.

### Option A: Bridged Adapter (Recommended)

The VM gets its own IP address on your local network, just like a physical machine. Share Links work immediately from any device on the same network.

**Settings → Network → Adapter 1:**
- Attached to: **Bridged Adapter**
- Name: Select your active network adapter (Wi-Fi or Ethernet)

```
┌─────────────────────────────────────────────┐
│              Local Network (LAN)            │
│                192.168.1.0/24               │
│                                             │
│  ┌──────────┐    ┌──────────┐              │
│  │ Host PC  │    │ VM       │              │
│  │ .100     │    │ .101     │              │
│  │          │    │ :8099    │◄── accessible │
│  └──────────┘    └──────────┘    from LAN  │
│                                             │
│  ┌──────────┐                               │
│  │ Phone    │──── http://192.168.1.101:8099 │
│  │ (guest)  │    Share Links just work      │
│  └──────────┘                               │
└─────────────────────────────────────────────┘
```

### Option B: NAT + Port Forwarding

The VM is behind VirtualBox's NAT. You must manually forward ports. Use this if bridged mode doesn't work (some corporate networks block it).

**Settings → Network → Adapter 1:**
- Attached to: **NAT**
- Click **Advanced → Port Forwarding** and add:

| Name | Protocol | Host IP | Host Port | Guest IP | Guest Port |
|------|----------|---------|-----------|----------|------------|
| SSH | TCP | 127.0.0.1 | 2222 | | 22 |
| PlayRooms | TCP | 0.0.0.0 | 8099 | | 8099 |

```
┌──────────────────────────────────────────────────┐
│                   Host PC                        │
│                                                  │
│  ┌─────────────────────────────────────┐         │
│  │         VirtualBox NAT              │         │
│  │                                     │         │
│  │  ┌──────────┐                       │         │
│  │  │ VM       │  10.0.2.15 (internal) │         │
│  │  │ :8099    │                       │         │
│  │  └──────────┘                       │         │
│  │       ▲                             │         │
│  │       │ port forward                │         │
│  └───────┼─────────────────────────────┘         │
│          │                                       │
│  Host:8099 ◄──── http://localhost:8099           │
│                                                  │
│  From other devices: http://<host-ip>:8099       │
│  (Share Links use host IP, not VM IP)            │
└──────────────────────────────────────────────────┘
```

> **WebRTC note:** With NAT, peer-to-peer video/voice connections will likely fail for devices outside the host. WebRTC needs direct connectivity between peers. If you need video/voice features, use **bridged mode** or set up a TURN server.

---

## 5. Install Debian 12

### Boot and Install

1. Start the VM — it boots from the Debian ISO
2. Select **Install** (not Graphical Install — saves memory)
3. Walk through the installer:

| Prompt | Recommended Choice |
|--------|-------------------|
| Language | English |
| Location | Your location |
| Keyboard | Your layout |
| Hostname | `playrooms-dev` |
| Domain name | (leave blank) |
| Root password | Set a strong password (or leave blank to use sudo) |
| Full name | Your name |
| Username | `dev` (or your preference) |
| Password | Your user password |
| Partitioning | **Guided - use entire disk** → All files in one partition |
| Package manager mirror | Pick a nearby mirror |
| Software selection | **Only** check: ☑ SSH server, ☑ standard system utilities |

> **Do NOT install a desktop environment.** It wastes RAM and is not needed — you'll access everything via SSH and the web browser on your host.

4. Install GRUB when prompted → select the virtual disk
5. **Remove the ISO**: After install completes, before rebooting:
   - VirtualBox menu → **Devices → Optical Drives → Remove disk from virtual drive**
6. Reboot

### First Boot

Log in with the username and password you set during install.

```bash
# Verify network connectivity
ip addr show
ping -c 3 8.8.8.8

# Install essentials
sudo apt update && sudo apt install -y curl wget git
```

If using **bridged mode**, note the VM's IP address from `ip addr show` (the `inet` line on `enp0s3` or similar).

If using **NAT mode**, SSH into the VM from your host:
```powershell
ssh -p 2222 dev@localhost
```

### QA Checkpoint 1: Guest OS

```
[ ] VM boots to login prompt
[ ] Network connectivity works (ping 8.8.8.8)
[ ] SSH accessible from host:
    - Bridged: ssh dev@<vm-ip>
    - NAT: ssh -p 2222 dev@localhost
[ ] apt update succeeds (package manager works)
```

### ⚠️ Take a Snapshot

**Machine → Take Snapshot** → Name: `Debian installed - pre-Docker`

---

## 6. USB Device Passthrough

This is the most critical section. The PlayRooms container runs `intiface-engine`, which talks directly to physical hardware — Bluetooth adapters, serial dongles, and USB HID devices. These devices must be passed through from your host OS into the VirtualBox VM.

### How Passthrough Works

```
Physical USB device
  ↓ plugged into host
Host OS (Windows) — releases device to VirtualBox
  ↓ USB passthrough
VirtualBox VM (Debian) — sees device as native USB
  ↓ Docker volume/device mount
Container — intiface-engine accesses hardware
```

### Bluetooth Adapter

Most Buttplug.io-compatible toys use Bluetooth Low Energy (BLE). You need a USB Bluetooth adapter passed through to the VM.

1. **Plug** your Bluetooth USB adapter into the host PC
2. **Identify it** — in VirtualBox with the VM running:
   - Menu → **Devices → USB** — look for your adapter (e.g., "Cambridge Silicon Radio" or "Realtek Bluetooth")
   - Click it to attach it to the VM
3. **Set up a persistent USB Device Filter** (so it auto-attaches on VM boot):
   - VM Settings → **USB** → click the **+** icon (Add Filter)
   - Select your Bluetooth adapter from the dropdown
   - This creates a filter with the Vendor ID and Product ID filled in

> **Windows note:** When VirtualBox captures a USB device, Windows releases it. The Bluetooth adapter will disappear from Windows Device Manager while the VM is using it. This is expected — VirtualBox has exclusive access.

4. **Verify inside the VM:**
   ```bash
   # Check USB device is visible
   lsusb
   # Look for your Bluetooth adapter in the list

   # Install BlueZ (Bluetooth stack)
   sudo apt install -y bluez

   # Verify Bluetooth adapter is functional
   bluetoothctl show
   # Should display adapter info (Address, Name, Powered, etc.)

   # Check the HCI interface exists
   hciconfig
   # Should show hci0 with status UP RUNNING
   ```

> **Troubleshooting:** If `bluetoothctl show` says "No default controller available":
> - Check `lsusb` — is the adapter listed?
> - Check `dmesg | tail -20` — any USB errors?
> - Try removing and re-adding the USB filter
> - Some adapters need a specific driver; check `dmesg` for firmware loading errors

### Serial Dongles (Lovense USB Dongle, FTDI Adapters)

Some devices use USB-to-serial adapters. These appear as `/dev/ttyUSB0` or `/dev/ttyACM0` in the VM.

1. Plug the dongle into your host PC
2. Pass it through using the same USB filter method as Bluetooth
3. Verify:
   ```bash
   ls /dev/ttyUSB* /dev/ttyACM*
   # Should show your device

   # Add your user to the dialout group for permissions
   sudo usermod -aG dialout $USER
   # Log out and back in for this to take effect
   ```

### USB HID Devices

Some Lovense devices use USB HID dongles. These appear as `/dev/hidraw*`.

1. Same USB passthrough process
2. Verify:
   ```bash
   ls /dev/hidraw*
   # Should show your device
   ```

### QA Checkpoint 2: USB Passthrough

```
[ ] Bluetooth adapter visible in VM (lsusb shows it)
[ ] BlueZ installed (apt install bluez)
[ ] Bluetooth interface up (bluetoothctl show returns adapter info)
[ ] hci0 interface exists and is UP (hciconfig)
[ ] Serial device visible if applicable (ls /dev/ttyUSB* /dev/ttyACM*)
[ ] User in dialout group if using serial (groups $USER)
[ ] HID device visible if applicable (ls /dev/hidraw*)
```

### ⚠️ Take a Snapshot

**Machine → Take Snapshot** → Name: `USB passthrough working`

---

## 7. Install Docker

Install Docker Engine using the official convenience script. Do **not** use the Debian packaged version (`docker.io`) — it's outdated.

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# IMPORTANT: Log out and back in for group membership to take effect
exit
# SSH back in
```

Verify:

```bash
docker --version
# Expected: Docker version 27.x.x or newer

docker compose version
# Expected: Docker Compose version v2.x.x

docker run hello-world
# Expected: "Hello from Docker!" message
```

### QA Checkpoint 3: Docker

```
[ ] docker --version returns 24.x or newer
[ ] docker compose version returns v2.x
[ ] docker run hello-world succeeds
[ ] No sudo needed for docker commands (user in docker group)
```

### ⚠️ Take a Snapshot

**Machine → Take Snapshot** → Name: `Docker installed`

---

## 8. Clone and Run PlayRooms

### Clone the Repository

```bash
git clone https://github.com/troon4891/PlayRooms.git
cd PlayRooms
```

### Review docker-compose.yml

Before starting, review the `docker-compose.yml` file and adjust for your hardware:

```yaml
services:
  playrooms:
    build:
      context: .
      dockerfile: Dockerfile.standalone
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
      - SERVER_PORT=8099
      - INTIFACE_PORT=12345
      - USE_BLUETOOTH=true
      - USE_SERIAL=false
      - USE_HID=false
      - SCAN_ON_START=false
    privileged: true                        # Needed for Bluetooth/USB
    restart: unless-stopped

volumes:
  playrooms-data:
```

**Key settings to check:**
- If you have a Bluetooth adapter: keep `USE_BLUETOOTH=true` and the D-Bus volume mount
- If you have a serial dongle: set `USE_SERIAL=true` and uncomment the device line
- If you have an HID dongle: set `USE_HID=true` and uncomment the device line
- `privileged: true` gives the container full device access — this is the simplest approach for development. For production, you can use more granular `cap_add` and `devices` instead.

### Build and Start

```bash
docker compose up -d --build
```

This will:
1. Build the Docker image (downloads dependencies, compiles server + client — takes several minutes on first run)
2. Start the container in the background

### Watch the Logs

```bash
docker compose logs -f
```

Expected startup output:

```
playrooms  | [Engine] Transport configuration:
playrooms  |   Bluetooth LE: ENABLED
playrooms  |   Serial Port:  disabled
playrooms  |   USB HID:      disabled
playrooms  |   Bluetooth hardware: Found adapter(s): hci0
playrooms  | [Engine] Starting Intiface Engine on port 12345
playrooms  | [Engine] Arguments: --websocket-port 12345 --use-bluetooth-le
playrooms  | [Server] PlayRooms server listening on port 8099
```

If you see `WARNING: Bluetooth LE is enabled but no Bluetooth adapter was detected`, the adapter is not accessible inside the container — check the D-Bus mount and `privileged` flag.

Press `Ctrl+C` to stop following logs (the container keeps running).

---

## 9. Verify Container Hardware Access

Run these commands to confirm the container can see your hardware:

### Bluetooth

```bash
docker compose exec playrooms ls /sys/class/bluetooth/
# Expected: hci0

docker compose exec playrooms bluetoothctl show
# Expected: Adapter info with address and name
```

### Serial (if applicable)

```bash
docker compose exec playrooms ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
# Expected: /dev/ttyUSB0 or /dev/ttyACM0
```

### USB HID (if applicable)

```bash
docker compose exec playrooms ls /dev/hidraw* 2>/dev/null
# Expected: /dev/hidraw0
```

---

## 10. Access the Web UI

Open a web browser **on your host machine** and navigate to:

- **Bridged mode:** `http://<vm-ip>:8099`
- **NAT mode:** `http://localhost:8099`

### First-Time Setup

The standalone Docker mode auto-detects that no Home Assistant ingress is present and switches to standalone authentication mode. On first visit:

1. You'll see the **Setup** page — create your admin account
2. After setup, you're redirected to the **Dashboard**
3. Create a test room to verify everything works
4. Go to **Settings** to scan for devices

---

## 11. Final QA Checklist

```
[ ] Web UI accessible from host browser at http://<vm-ip>:8099
[ ] Admin account creation succeeds (standalone auth mode)
[ ] Dashboard loads after login
[ ] Room creation succeeds
[ ] Settings page loads
[ ] Device scan initiated without errors (Settings → Scan)
[ ] Bluetooth devices discovered (if adapter is passed through and toys are in pairing mode)
[ ] Share Link can be generated for a room
[ ] Share Link opens in a separate browser/incognito window
[ ] Guest can join through the lobby flow
[ ] Container survives restart:
    docker compose down && docker compose up -d
[ ] Data persists after restart (rooms, settings, admin account still there)
[ ] Container logs are clean on startup (no errors, expected transport output)
```

---

## 12. Troubleshooting

### "No Bluetooth adapter detected"

| Check | Command | Expected |
|-------|---------|----------|
| USB filter active | VBox menu → Devices → USB | Adapter has checkmark |
| Adapter in VM | `lsusb` (in VM) | Adapter listed |
| BlueZ installed | `dpkg -l bluez` (in VM) | Shows `ii bluez` |
| HCI interface up | `hciconfig` (in VM) | `hci0` with `UP RUNNING` |
| D-Bus mounted | Check `docker-compose.yml` | `/var/run/dbus:/var/run/dbus` present |
| Container privileged | Check `docker-compose.yml` | `privileged: true` |
| Inside container | `docker compose exec playrooms ls /sys/class/bluetooth/` | `hci0` |

### "Permission denied" on serial/HID devices

- Ensure the device is in the `devices:` section of `docker-compose.yml`
- Or use `privileged: true` (already recommended for dev)
- In the VM: ensure your user is in the `dialout` group for serial devices

### "Connection refused" on port 8099

- Check the container is running: `docker compose ps`
- Check container logs: `docker compose logs`
- If using NAT: verify port forwarding rule exists (Host 8099 → Guest 8099)
- Check VM firewall: `sudo iptables -L` — there should be no DROP rules on 8099
  - If `ufw` is active: `sudo ufw allow 8099/tcp`

### WebRTC video/voice not working

- **NAT mode:** WebRTC requires direct peer-to-peer connectivity. Behind VBox NAT, this fails for external devices. Switch to **bridged mode** or set up a TURN server.
- **Bridged mode on LAN:** Should work. If not, check that both devices (host and guest) can reach each other's IP directly.
- **Across the internet:** You need a TURN server (not included). The project notes this as a known limitation.

### USB device not appearing in VBox device list

- **Windows:** Make sure the VirtualBox Extension Pack is installed
- **Windows:** Some USB devices may be claimed by a host driver. Check Device Manager — you may need to disable the host Bluetooth driver temporarily
- **Mac:** Grant VirtualBox USB access in System Preferences → Security & Privacy → Privacy → USB
- **Linux:** Ensure your host user is in the `vboxusers` group: `sudo usermod -aG vboxusers $USER`

### Docker build fails

- **Network error downloading intiface-engine:** Check VM internet connectivity (`ping 8.8.8.8`)
- **Out of disk space:** The default 20GB VDI should be sufficient, but check `df -h`
- **npm install fails:** Could be a transient npm registry issue — try again with `docker compose build --no-cache`

---

## Quick Reference

### Useful Commands

```bash
# Start the container
docker compose up -d

# Stop the container
docker compose down

# Rebuild after code changes
docker compose up -d --build

# View logs (follow mode)
docker compose logs -f

# Enter the container shell
docker compose exec playrooms /bin/bash

# Check container status
docker compose ps

# Check Bluetooth inside container
docker compose exec playrooms bluetoothctl show

# Restart just the container (no rebuild)
docker compose restart
```

### VirtualBox Snapshots Taken

| Snapshot | When | Purpose |
|----------|------|---------|
| Clean VM - pre-install | After VM creation | Revert if OS install fails |
| Debian installed - pre-Docker | After OS install | Revert if Docker setup goes wrong |
| USB passthrough working | After USB verification | Revert if Docker/container breaks USB |
| Docker installed | After Docker install | Revert if container setup fails |

> **Tip:** Take additional snapshots before any major changes. VirtualBox snapshots are cheap and fast.
