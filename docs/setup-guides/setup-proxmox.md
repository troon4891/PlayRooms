# Proxmox Platform Setup Guide

> **Note:** This guide is being updated for PlayRooms v1.0. Some details may reference the previous version.

Official setup guide for running PlayRooms as a standalone Docker container on Proxmox VE.

> **Platform status:** ✅ Tested

---

## Overview

This guide takes you from a Proxmox VE host to a running PlayRooms container. Proxmox offers two paths — a full **QEMU/KVM virtual machine** or a **LXC container** — with different tradeoffs for hardware access and complexity.

### Architecture

```
Proxmox VE Host (Debian-based)
│
├─ Path A: Full VM (QEMU/KVM) ◄── Recommended
│  └─ Debian 12 guest OS
│     ├─ BlueZ + D-Bus ─── Bluetooth adapter (USB passthrough)
│     ├─ /dev/ttyUSB* ──── Serial device (USB passthrough)
│     ├─ /dev/hidraw* ──── USB HID device (USB passthrough)
│     ├─ Docker Engine
│     │   └─ PlayRooms Container
│     │      ├─ intiface-engine
│     │      └─ Node.js server (port 8099)
│     └─ Network: vmbr0 bridge
│
└─ Path B: LXC Container (Privileged)
   └─ Debian 12 template
      ├─ Device nodes ──── bind-mounted from host
      ├─ Docker Engine (nested)
      │   └─ PlayRooms Container
      │      ├─ intiface-engine
      │      └─ Node.js server (port 8099)
      └─ Network: vmbr0 bridge
```

### What You Need

- **Proxmox VE 8.x** installed and accessible via web UI
- **amd64 hardware** (Intiface Engine is x86_64 only)
- **Optional hardware**: Bluetooth USB adapter, Lovense USB dongle, or other Buttplug.io-compatible device physically connected to the Proxmox host

---

## 1. LXC vs VM — Decision Guide

This is the most important decision. Read this section before creating anything.

### Comparison

| Factor | Full VM | LXC (Privileged) | LXC (Unprivileged) |
|--------|---------|-------------------|---------------------|
| **Bluetooth access** | ✅ Clean USB passthrough | ⚠️ Requires D-Bus bind mount, can conflict with host BlueZ | ❌ Extremely difficult |
| **Serial device access** | ✅ USB passthrough | ✅ With cgroup device rules | ⚠️ Complex UID mapping |
| **USB HID access** | ✅ USB passthrough | ✅ With cgroup device rules | ⚠️ Complex UID mapping |
| **D-Bus / BlueZ** | ✅ Own isolated BlueZ stack | ⚠️ Shares host D-Bus, may conflict | ❌ Isolated, no access |
| **Resource overhead** | ~512 MB RAM for VM | Minimal (shared kernel) | Minimal (shared kernel) |
| **Isolation** | Full (own kernel) | Shared kernel, root access to host | Shared kernel, restricted |
| **Docker support** | Native | Requires `nesting=1` feature | Requires `nesting=1` feature |
| **Snapshots/backups** | Full disk image | Fast, small | Fast, small |
| **Setup complexity** | Low | Medium | High |

### Recommendation

| Your situation | Use |
|---------------|-----|
| **You need Bluetooth** | **Full VM** — only clean path for D-Bus/BlueZ isolation |
| **Serial and/or HID only** (no Bluetooth) | **Privileged LXC** — lighter, faster, device bind mounts work well |
| **Unsure or first time** | **Full VM** — everything just works, fewer footguns |
| **Resource constrained** | **Privileged LXC** — lower overhead, but more manual config |

> **Unprivileged LXC is not recommended** for this project. The device access requirements make it impractical without significant manual configuration that is fragile across Proxmox updates.

---

## 2. Path A: Full VM Setup (Recommended)

### 2A.1. Upload Debian ISO

1. Download the [Debian 12 netinst ISO](https://www.debian.org/download) (~600 MB)
2. In Proxmox web UI: **local (storage)** → **ISO Images** → **Upload** → select the ISO

### 2A.2. Create the VM

**Proxmox web UI → Create VM:**

| Tab | Setting | Value |
|-----|---------|-------|
| **General** | Name | `playrooms` |
| | VM ID | (auto or your choice) |
| **OS** | ISO image | Select the uploaded Debian 12 ISO |
| | Type | Linux |
| | Version | 6.x - 2.6 Kernel |
| **System** | Machine | q35 |
| | BIOS | SeaBIOS (or OVMF for EFI) |
| | SCSI Controller | VirtIO SCSI single |
| | Qemu Agent | ☑ Check this |
| **Disks** | Bus/Device | VirtIO Block |
| | Size | 20 GiB |
| **CPU** | Cores | 2 (minimum), 4 recommended |
| | Type | **host** |
| **Memory** | Memory | 4096 MiB (minimum 2048) |
| **Network** | Bridge | vmbr0 |
| | Model | VirtIO (paravirtualized) |

> **CPU Type = host** is important. It passes through the host CPU features directly, which gives better performance for USB passthrough and avoids compatibility issues.

### 2A.3. USB Passthrough

Pass your hardware devices from the Proxmox host to the VM.

**Via Web UI:**

1. Select your VM → **Hardware** → **Add** → **USB Device**
2. Choose **Use USB Vendor/Device ID** (recommended — persists across device reconnects)
3. Select your device from the dropdown (e.g., Bluetooth adapter, Lovense dongle)
4. Repeat for each device you want to pass through

**Via CLI** (SSH into Proxmox host):

```bash
# List USB devices on the Proxmox host
lsusb

# Pass through by Vendor:Product ID
qm set <vmid> -usb0 host=<vendorid>:<productid>

# Example: Pass through a Cambridge Silicon Radio Bluetooth adapter
qm set 100 -usb0 host=0a12:0001
```

> **Important:** The Proxmox host must **not** be actively using the device. If the host has BlueZ running and has claimed the Bluetooth adapter, the passthrough will fail or the adapter won't work in the VM. Stop BlueZ on the host if needed: `systemctl stop bluetooth`

### 2A.4. Install Debian 12

Start the VM and install Debian 12. The process is identical to the [VirtualBox guide](setup-virtualbox.md#5-install-debian-12):

1. Boot from ISO → Select **Install**
2. Hostname: `playrooms`
3. Software selection: **SSH server** + **standard system utilities** only
4. Guided partitioning → entire disk

After installation:

```bash
# Install QEMU guest agent (for Proxmox integration)
sudo apt update
sudo apt install -y qemu-guest-agent curl wget git

# The guest agent enables Proxmox to show the VM's IP and
# allows clean shutdown from the web UI
sudo systemctl enable --now qemu-guest-agent
```

### 2A.5. Verify Hardware Inside the VM

```bash
# Check USB devices are visible
lsusb

# Bluetooth (if passed through)
sudo apt install -y bluez
bluetoothctl show
hciconfig

# Serial (if passed through)
ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
sudo usermod -aG dialout $USER

# HID (if passed through)
ls /dev/hidraw* 2>/dev/null
```

### 2A.6. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in, then verify:
docker --version
docker compose version
docker run hello-world
```

### 2A.7. Clone and Run

```bash
git clone https://github.com/troon4891/PlayRooms.git
cd PlayRooms

# Review and customize docker-compose.yml for your hardware
# (see VirtualBox guide section 8 for details on settings)

docker compose up -d --build
docker compose logs -f
```

### QA Checkpoint: VM Path

```
[ ] VM boots and Proxmox shows running status
[ ] Proxmox summary tab shows VM IP (via QEMU guest agent)
[ ] USB devices visible inside VM (lsusb)
[ ] Bluetooth adapter functional (bluetoothctl show) — if applicable
[ ] Docker installed and running
[ ] Container starts successfully
[ ] Container logs show engine startup with correct transport config
[ ] Web UI accessible from LAN browser at http://<vm-ip>:8099
[ ] Admin account creation works
```

---

## 3. Path B: LXC Setup (Privileged)

Use this path if you **don't need Bluetooth** and want lower resource overhead. This guide uses a **privileged** LXC container for simpler device access.

### 3B.1. Download Container Template

In Proxmox web UI: **local (storage)** → **CT Templates** → **Templates** → search for `debian-12-standard` → **Download**

### 3B.2. Create the LXC Container

**Proxmox web UI → Create CT:**

| Tab | Setting | Value |
|-----|---------|-------|
| **General** | Hostname | `playrooms` |
| | Password | Set a root password |
| | **Unprivileged container** | **☐ UNCHECK** (must be privileged) |
| **Template** | Template | `debian-12-standard` |
| **Disks** | Root Disk Size | 10 GiB |
| **CPU** | Cores | 2 |
| **Memory** | Memory | 2048 MiB |
| | Swap | 512 MiB |
| **Network** | Bridge | vmbr0 |
| | IPv4 | DHCP (or static) |

> **Privileged is required.** An unprivileged container cannot easily access host device nodes and D-Bus. The tradeoff is weaker isolation — the container has root-level access equivalent to the host.

### 3B.3. Enable Nesting (Required for Docker)

Before starting the container:

**Proxmox web UI → CT → Options → Features → Edit:**
- ☑ Check **Nesting**

**Or via CLI:**
```bash
pct set <ctid> -features nesting=1
```

### 3B.4. Configure Device Access

SSH into the **Proxmox host** (not the container) and edit the LXC configuration:

```bash
nano /etc/pve/lxc/<ctid>.conf
```

Add the following lines at the end:

```ini
# --- PlayRooms device access ---

# Serial devices (/dev/ttyUSB*, major 188; /dev/ttyACM*, major 166)
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.cgroup2.devices.allow: c 166:* rwm
lxc.mount.entry: /dev/ttyUSB0 dev/ttyUSB0 none bind,optional,create=file
lxc.mount.entry: /dev/ttyACM0 dev/ttyACM0 none bind,optional,create=file

# HID devices (/dev/hidraw*, major 243)
lxc.cgroup2.devices.allow: c 243:* rwm
lxc.mount.entry: /dev/hidraw0 dev/hidraw0 none bind,optional,create=file

# D-Bus (required if attempting Bluetooth — see note below)
# lxc.mount.entry: /var/run/dbus var/run/dbus none bind,optional,create=dir
```

> **Adjust device paths** to match your actual devices. If you have `/dev/ttyUSB1` instead of `/dev/ttyUSB0`, change accordingly. The `optional` flag means the container will still start if the device isn't plugged in.

> **Bluetooth in LXC:** Mounting `/var/run/dbus` from the host allows the container to access the host's BlueZ D-Bus, but this can cause conflicts if the Proxmox host is also running BlueZ. If you need Bluetooth, **use a VM instead** (Path A).

**Restart the container** after editing the config:
```bash
pct stop <ctid>
pct start <ctid>
```

### 3B.5. Install Docker Inside LXC

Enter the container:
```bash
pct enter <ctid>
# Or SSH: ssh root@<container-ip>
```

Install Docker:
```bash
apt update && apt install -y curl wget git

curl -fsSL https://get.docker.com | sh

docker --version
docker compose version
docker run hello-world
```

> **If Docker fails to start:** Check that `nesting=1` is set in the container features. Docker requires cgroup access that nesting provides. Also verify the container is privileged.

### 3B.6. Clone and Run

```bash
git clone https://github.com/troon4891/PlayRooms.git
cd PlayRooms

# Edit docker-compose.yml:
# - Set USE_BLUETOOTH=false (unless you've configured D-Bus passthrough)
# - Set USE_SERIAL=true if using serial devices
# - Set USE_HID=true if using HID devices
# - Add device entries matching your hardware

docker compose up -d --build
docker compose logs -f
```

### QA Checkpoint: LXC Path

```
[ ] LXC container starts and has network (pct status <ctid>)
[ ] Device nodes visible inside LXC:
    - ls /dev/ttyUSB* /dev/ttyACM* (for serial)
    - ls /dev/hidraw* (for HID)
[ ] Docker installed and running inside LXC
[ ] docker run hello-world succeeds
[ ] PlayRooms container starts
[ ] Container logs show engine startup with correct transport config
[ ] Serial/HID devices detected by intiface-engine (check logs)
[ ] Web UI accessible from LAN browser at http://<lxc-ip>:8099
```

---

## 4. Network Considerations

Both VM and LXC paths use the same default Proxmox network bridge (`vmbr0`).

### Default Setup (Bridge, Recommended)

```
┌─────────────────────────────────────────────────┐
│              Local Network (LAN)                │
│                192.168.1.0/24                   │
│                                                 │
│  ┌──────────────┐    ┌─────────────────┐       │
│  │ Proxmox Host │    │ VM or LXC       │       │
│  │ .50          │    │ .51             │       │
│  │              │    │ :8099 ◄── web UI│       │
│  └──────────────┘    └─────────────────┘       │
│        vmbr0 bridge (default)                   │
│                                                 │
│  ┌──────────┐                                   │
│  │ Browser  │──── http://192.168.1.51:8099     │
│  └──────────┘    Share Links just work          │
└─────────────────────────────────────────────────┘
```

The VM/LXC gets its own IP via DHCP on your LAN. Share Links are accessible from any device on the network.

### Proxmox Firewall

Proxmox has a built-in firewall at the datacenter, host, and VM/CT level. If enabled, you need to allow port 8099:

**Proxmox web UI → Datacenter → Firewall → Add:**

| Setting | Value |
|---------|-------|
| Direction | IN |
| Action | ACCEPT |
| Protocol | TCP |
| Dest. port | 8099 |
| Comment | PlayRooms web UI |

Also add the same rule at the **VM/CT level** if per-VM firewall is enabled.

### External Access (Outside Your LAN)

If you want Share Links to work from the internet:

1. Forward port 8099 on your router to the VM/LXC IP
2. Consider using a reverse proxy (e.g., nginx) with HTTPS for security
3. **WebRTC note:** Video/voice chat across the internet requires a TURN server (not included)

### Static IP (Optional but Recommended)

To prevent the VM/LXC IP from changing after DHCP lease renewal:

**For VM:** Configure a static IP inside the Debian guest in `/etc/network/interfaces`

**For LXC:** Set a static IP in the Proxmox container network config:
```bash
pct set <ctid> -net0 name=eth0,bridge=vmbr0,ip=192.168.1.51/24,gw=192.168.1.1
```

---

## 5. Final QA Checklist

```
[ ] Web UI accessible from LAN browser at http://<ip>:8099
[ ] Admin account creation succeeds (standalone auth mode)
[ ] Dashboard loads after login
[ ] Room creation succeeds
[ ] Device scan works (Settings → Scan for devices)
[ ] Hardware devices detected (check container logs for transport output)
[ ] Share Link generation works
[ ] Share Link accessible from a different machine on the network
[ ] Container survives restart:
    docker compose down && docker compose up -d
[ ] Data persists after restart (rooms, settings, admin account)
[ ] Container logs are clean on startup (no errors)
[ ] VM/LXC survives Proxmox host reboot (autostart enabled)
```

### Enable Autostart

Ensure the VM/LXC starts automatically when Proxmox boots:

**Web UI → VM/CT → Options → Start at boot:** ☑ Yes

---

## 6. Troubleshooting

### VM: USB device not appearing

| Check | How | Fix |
|-------|-----|-----|
| Device listed on host | `lsusb` on Proxmox | Verify device is plugged in |
| Host not claiming device | `systemctl status bluetooth` on Proxmox | `systemctl stop bluetooth` if it's using the adapter |
| Passthrough configured | VM → Hardware tab → USB Device listed | Add USB Device if missing |
| Visible in VM | `lsusb` inside VM | Check IOMMU/passthrough; try different USB port |

### LXC: "Permission denied" on device node

| Check | How | Fix |
|-------|-----|-----|
| Container is privileged | `pct config <ctid>` | `unprivileged: 0` must be set |
| cgroup rules present | `cat /etc/pve/lxc/<ctid>.conf` | Add `lxc.cgroup2.devices.allow` lines |
| Mount entries correct | Same file | Check device paths match actual devices |
| Container restarted | `pct stop && pct start` | Config changes require restart |

### LXC: Docker won't start

- Verify `features: nesting=1` in the container config
- Check with `pct config <ctid> | grep features`
- If missing: `pct set <ctid> -features nesting=1` and restart the container

### Bluetooth not working in LXC

This is expected to be difficult. The D-Bus/BlueZ stack requires:
- Host D-Bus socket bind-mounted into the container
- No conflicting BlueZ instance on the Proxmox host
- Correct cgroup rules for HCI devices

**Recommendation:** If you need Bluetooth, switch to Path A (full VM). It's significantly more reliable.

### Port 8099 not reachable

1. Check the container is running: `docker compose ps`
2. Check container logs: `docker compose logs`
3. Verify the VM/LXC has a network IP: `ip addr show`
4. Check Proxmox firewall rules (datacenter, host, and VM/CT levels)
5. For LXC: verify the container's network interface is up
6. Try from the Proxmox host: `curl http://<vm-or-lxc-ip>:8099` — if this works but external browsers can't connect, it's a firewall issue

### Container logs show "no Bluetooth adapter"

In a VM:
- Check `lsusb` in the VM — is the adapter visible?
- Check `bluetoothctl show` — does BlueZ see the adapter?
- Check D-Bus volume mount in `docker-compose.yml`

In an LXC:
- Bluetooth in LXC is unreliable — use a VM instead

---

## Quick Reference

### VM Management

```bash
# Start/stop VM from Proxmox CLI
qm start <vmid>
qm stop <vmid>
qm reboot <vmid>

# Take a snapshot
qm snapshot <vmid> <snapshot-name>

# Restore a snapshot
qm rollback <vmid> <snapshot-name>

# List USB devices on host
lsusb

# Add USB passthrough
qm set <vmid> -usb0 host=<vid>:<pid>
```

### LXC Management

```bash
# Start/stop container
pct start <ctid>
pct stop <ctid>

# Enter container shell
pct enter <ctid>

# View/edit config
pct config <ctid>
nano /etc/pve/lxc/<ctid>.conf

# Take a snapshot
pct snapshot <ctid> <snapshot-name>
```

### Docker (Inside VM or LXC)

```bash
docker compose up -d --build     # Build and start
docker compose down               # Stop
docker compose logs -f            # Follow logs
docker compose exec playrooms /bin/bash   # Shell into container
docker compose restart            # Restart without rebuild
```
