# Binary Release Signing Guide

This guide documents the Windows Authenticode signing plug-in point for MarkSync binary releases. Real production signing is **out of scope for MS-0002** (DEC-7) and is deferred to MS-0003+ when a production certificate is provisioned.

## Purpose

This document provides the reference for Windows Authenticode code signing of the `marksync-win-x64.exe` artifact. It identifies the exact inputs at which a production certificate plugs in and references the validated `osslsigncode` recipe from the GH-13 spike.

## Signing Plug-in Point

The signing operation is performed using `osslsigncode` with the following inputs:

| Input | Description | Example |
|-------|-------------|---------|
| `-pkcs12` | PKCS#12 certificate file path | `/path/to/authenticode.p12` |
| `-certs` + `-key` | Alternative: PEM certificate + private key | `-certs /path/to/cert.pem -key /path/to/key.pem` |
| `-pass` | Certificate password (env-var **name** only) | `$CERT_PASSWORD` |
| `-t` | Timestamp server URL | `http://timestamp.digicert.com` |
| `-h` | Hash algorithm | `sha256` |
| `-in` | Input binary path | `marksync-win-x64.exe` |
| `-out` | Signed output binary path | `marksync-win-x64-signed.exe` |

### Example Command

```bash
osslsigncode sign \
  -pkcs12 /path/to/authenticode.p12 \
  -pass "$CERT_PASSWORD" \
  -t http://timestamp.digicert.com \
  -h sha256 \
  -in marksync-win-x64.exe \
  -out marksync-win-x64-signed.exe
```

**Important:** The `$CERT_PASSWORD` environment variable contains the **password** as a value, but this document references only the **variable name**. Never commit literal password values or certificate material to the repository.

## Validated Recipe

The complete `osslsigncode` workflow (sign, verify, extract-signature) is documented in the GH-13 spike findings:

- **Reference:** `spikes/bun-compile-smoke/probes/signing-dry-run.md`
- **Status:** Validated dry-run — no real certificate was used
- **Reuse:** This guide references that recipe; see the spike document for the full `verify` and `extract-signature` commands

## Integration with Build Script

The `scripts/build-binaries.sh` script carries a `TODO(MS-0003)` marker that points to this guide and the spike recipe. When production signing is implemented (MS-0003+), the signing step should be wired into the build/release workflow after the Windows binary is compiled and before it is attached to the GitHub Release.

## Out of Scope

The following are explicitly **out of scope** for MS-0002:

- **Real production code signing** with a provisioned certificate — dry-run/documented command only (DEC-7)
- **macOS notarization** — deferred to MS-0003 (DEC-8)
- **CI secret management** for `$CERT_PASSWORD` — to be implemented in MS-0003+ when real signing is added

## Secret Hygiene

- Never commit literal password values, certificate files, or private keys
- Use the `$CERT_PASSWORD` environment variable **name** only in documentation and scripts
- The actual password value is injected as a CI secret at release time (MS-0003+)
- All committed artifacts are scanned for secrets (TC-SEC-001 / AC-SEC-1)

## References

- GH-13 spike signing recipe: `spikes/bun-compile-smoke/probes/signing-dry-run.md`
- GH-13 spike findings: `findings/bun-compile-smoke-findings.md`
- Build script: `scripts/build-binaries.sh`
- AC-SIGN-1: Signing story documented
- DEC-7: Real production signing is OUT of MS-0002
- DEC-8: macOS notarization is OUT of scope (MS-0003)
