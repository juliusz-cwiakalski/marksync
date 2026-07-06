# Windows Authenticode signing — dry-run reference (TC-BCS-007 / H5)

> **Probe type:** documentation-only. `osslsigncode` is **NOT installed** in this
> environment (spec DEC-4); H5 is satisfied by documenting the exact command that
> *would* sign the Windows binary, with the cert/Authenticode plug-in point
> identified. No real certificate is used; no command is executed. The Phase 7
> findings document embeds this block verbatim.
>
> **Scope:** Windows Authenticode only. **macOS notarization is out of scope**
> for this spike (deferred to MS-0003 per spec NFR-COMP-1 / NG-1).

## Tool: `osslsigncode`

`osslsigncode` is an open-source tool that applies Windows Authenticode
code-signing to a PE/EXE/MSI using a code-signing certificate (PVK/PFX/PEM or a
PEM cert+key pair). It is the non-Windows path to the same signature a Windows
`signtool.exe` would produce, which makes it suitable for a Linux-based release
pipeline (MS2-E5-S4).

## The sign command (dry-run — placeholder cert; DO NOT execute)

Two equivalent input forms are supported; pick whichever matches the cert
material the release pipeline obtains in E5-S4.

### Form A — PKCS#12 / PFX bundle (most common for Authenticode)

```bash
# Authenticode sign (DRY-RUN REFERENCE — osslsigncode NOT installed here, DEC-4;
# placeholder cert path; CERT_PASSWORD is an env-var NAME, never a literal value).
osslsigncode sign \
  -pkcs12 /path/to/authenticode.p12 \
  -pass  "$CERT_PASSWORD" \
  -t     http://timestamp.digicert.com \
  -h     sha256 \
  -in    marksync-win-x64.exe \
  -out   marksync-win-x64-signed.exe
```

### Form B — PEM cert + PEM key (alternative)

```bash
osslsigncode sign \
  -certs /path/to/authenticode-cert.pem \
  -key   /path/to/authenticode-key.pem \
  -pass  "$CERT_PASSWORD" \
  -t     http://timestamp.digicert.com \
  -h     sha256 \
  -in    marksync-win-x64.exe \
  -out   marksync-win-x64-signed.exe
```

## Verify the signature

```bash
# Verify against the Authenticode trust chain (no network) or with -turl for a
# timestamp-authority-assisted verification.
osslsigncode verify \
  -in marksync-win-x64-signed.exe

# (optional) verify using a timestamp URL:
osslsigncode verify \
  -turl http://timestamp.digicert.com \
  -in   marksync-win-x64-signed.exe
```

## Extract the signature (forensics / inspection)

```bash
# Pull the detached PKCS#7 signature block out of the signed binary.
osslsigncode extract-signature \
  -in  marksync-win-x64-signed.exe \
  -out marksync-win-x64.pkcs7
```

## Cert / Authenticode plug-in point

The **production cert material** plugs in at exactly these inputs:

| Input | Where the real material goes | Notes |
|---|---|---|
| `-pkcs12 /path/to/authenticode.p12` (Form A) **or** `-certs …` + `-key …` (Form B) | The code-signing certificate (X.509, EKU = Code Signing) obtained from a trusted CA (DigiCert / Sectigo / etc.) | This is the **enterprise-trust-bar** input referenced by ADR-0001's open signing Unresolved Question. |
| `-pass "$CERT_PASSWORD"` | The private-key / PFX password | Supplied via a CI secret / env var — **never** committed. The literal above is the env-var *name* (`$CERT_PASSWORD`), not a value. |
| `-t http://timestamp.digicert.com` | RFC 3161 timestamp authority URL | Lets the signature remain valid after the cert expires. Use the CA's recommended timestamp URL. |
| `-h sha256` | Hash algorithm | `sha256` is the current Authenticode standard; `sha1` is deprecated. |

**The actual production signing occurs in MS2-E5-S4** with a real cert wired
through the release pipeline (CI secret, not committed). This spike only
documents the feasible command (H5 — closing the ADR-0001 signing Unresolved
Question for the Windows/Linux slice with a concrete, copy-pasteable recipe).

## Out of scope

- **macOS notarization** — deferred to MS-0003 (spec NFR-COMP-1 / NG-1). The
  macOS path would use `codesign` + `xcrun notarytool` and requires an Apple
  Developer ID; it is not exercised here.
- **Real execution** — `osslsigncode` is not installed in this environment
  (DEC-4); the blocks above are reference strings, not run commands.
