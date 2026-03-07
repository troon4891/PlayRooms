# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please use [GitHub's private security advisory feature](https://github.com/troon4891/PlayRooms/security/advisories/new) to report vulnerabilities. This ensures the report stays private until a fix is available.

If you're unable to use GitHub's security advisory feature, contact the maintainer directly through the methods listed on their GitHub profile.

### What to Include

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Affected version(s) or branch(es)
- Any suggested fix or mitigation, if you have one

## What Qualifies as a Security Issue

**Report as a security vulnerability:**

- Authentication or authorization bypass (admin access, guest role escalation)
- Unauthorized device control (accessing devices outside assigned permissions)
- Token leakage, session hijacking, or credential exposure
- Injection vulnerabilities (command injection, XSS, SQL injection)
- Relay protocol vulnerabilities that could allow unauthorized room access
- WebSocket or Socket.IO exploits that bypass the guest role system
- Path traversal or file access outside intended boundaries
- Any issue that could allow an attacker to control devices without the host's knowledge or consent

**Report as a regular bug (via GitHub Issues):**

- UI rendering issues or cosmetic problems
- Performance problems that don't expose data or control
- Feature requests or usability improvements
- Configuration errors that require local access to exploit
- Crashes or errors that don't expose sensitive information

**When in doubt, report it as a security issue.** We'd rather triage a false positive than miss a real vulnerability.

## Physical Safety Implications

PlayRooms controls physical devices that interact with the human body, including electrical stimulation hardware. Security vulnerabilities in this project may have **physical safety implications** beyond typical software risks:

- Unauthorized device control could cause physical harm
- Bypassing the settings cascade or emergency stop could remove safety limits
- Compromised relay connections could allow remote attackers to control local devices
- Guest role escalation could grant device control to users who should only have view access

We treat security issues with potential physical safety impact as the highest priority.

## Response Timeline

- **Acknowledgment**: Within 72 hours of receiving the report
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity and complexity — critical issues affecting physical safety will be prioritized

We will keep you informed of progress and coordinate disclosure timing with you.

## Supported Versions

Security fixes are applied to the current release on `main` and the development branch (`beta`). Older versions are not maintained with security patches.

## Scope

This security policy covers the PlayRooms Host repository. Each repository in the PlayRooms project maintains its own security policy:

- [PlayRooms](https://github.com/troon4891/PlayRooms) (this repo) — Host platform
- [PlayRooms-Portal](https://github.com/troon4891/PlayRooms-Portal) — Relay server
- [PlayRooms-DP-Buttplug](https://github.com/troon4891/PlayRooms-DP-Buttplug) — Buttplug.io provider
- [PlayRooms-DP-DGLabs-WS](https://github.com/troon4891/PlayRooms-DP-DGLabs-WS) — DG-LAB WebSocket provider
- [PlayRooms-DP-DGLabs-BLE](https://github.com/troon4891/PlayRooms-DP-DGLabs-BLE) — DG-LAB BLE provider

If you're unsure which repo a vulnerability belongs to, report it here and we'll route it appropriately.
