<div align="center">
  <img src="build/icon.png" alt="Vorn — Vault Of Redundant Nodes" width="220px" />
  <br/><br/>

  <h1>Vorn</h1>
  <p><strong>Vault Of Redundant Nodes</strong></p>
  <p><em>The fast, private, crash-proof desktop backup tool you actually own.</em></p>

  <p>
    <img src="https://img.shields.io/github/v/release/LeonardoCiaccio/Vorn?style=flat-square&label=version&color=blue" alt="Version" />
    <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platforms" />
    <img src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3" />
  </p>

  <h3>Get Vorn — free, open-source, no account required</h3>

  <p>
    <a href="https://github.com/LeonardoCiaccio/Vorn/releases/latest/download/Vorn-Windows.exe">
      <img src="https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
    </a>
    &nbsp;
    <a href="https://github.com/LeonardoCiaccio/Vorn/releases/latest/download/Vorn-macOS.dmg">
      <img src="https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
    </a>
    &nbsp;
    <a href="https://github.com/LeonardoCiaccio/Vorn/releases/latest/download/Vorn-Linux.AppImage">
      <img src="https://img.shields.io/badge/Download-Linux-E95420?style=for-the-badge&logo=linux&logoColor=white" alt="Download for Linux" />
    </a>
  </p>

  <p>
    <sub>
      <a href="#quick-start">Quick start</a> ·
      <a href="#how-vorn-works">How it works</a> ·
      <a href="#features">Features</a> ·
      <a href="#building-from-source">Build from source</a>
    </sub>
  </p>
</div>

---

## The problem with backups today

Backing up your files should be simple. In practice, it rarely is.

- **Cloud services** want your account, your subscription, and your trust. They can change pricing, lose your data, or shut down — and your archive goes with them.
- **Naive copy-based tools** duplicate the same content again and again. A photo you keep in three project folders eats triple the disk space, every single backup run.
- **Proprietary archive formats** trap your data inside an opaque database. Lose the index file and the whole archive becomes unreadable garbage.
- **A power outage or a yanked USB cable** mid-write can corrupt the entire backup, leaving you worse off than before.
- **Large files and deep folder paths** routinely break tools on Windows (the legacy 260-character path limit) or on removable media.
- **Resuming an interrupted run** usually means starting from scratch.

You shouldn't have to choose between privacy, reliability, and disk space.

---

## How Vorn solves it

Vorn is a **local-first, content-addressable backup engine** wrapped in a clean desktop app. No accounts, no cloud, no telemetry — your data never leaves your machine.

The core idea is simple: **every unique piece of content is stored exactly once**, identified by its cryptographic fingerprint. Reference it from a hundred sessions across a thousand backup runs — it still lives in the store as a single file.

### Five guarantees we take seriously

| Guarantee | What it means in practice |
|---|---|
| **Your data stays yours** | Everything runs locally. No accounts, no network calls, no telemetry. |
| **Identical content, stored once** | BLAKE3 fingerprinting deduplicates across every session and run automatically. |
| **The store is the source of truth** | Each `.vorn` file is self-describing. Lose the index? Vorn rebuilds it by scanning the store. Your data is never trapped. |
| **Crashes never corrupt the vault** | Write-ahead logging + atomic rename means a yanked USB cable or a power cut leaves the store in a consistent state. |
| **Interrupted runs resume exactly where they stopped** | Stop a backup mid-flight, close the lid, unplug the drive — pick up later from the same file. |

### Built for real-world storage

Vorn doesn't assume your store lives on a fast internal SSD. It's engineered for the messy reality:

- **USB drives** that can be unplugged at any moment — detected, gracefully halted, never corrupted.
- **Deep Windows paths** beyond the legacy 260-char limit — handled transparently with extended-length path support.
- **Network shares and NAS** with multi-machine access — protected by a hostname-aware lock file so two computers never write the same store.
- **Massive files** (10 MB+) — automatically split into deduplicated chunks, so a single byte change doesn't force re-storing gigabytes.

---

## Features

| Feature | Description |
|---|---|
| **Content-addressable storage** | Files identified by BLAKE3 hash; identical content stored once, referenced everywhere |
| **Automatic deduplication** | Zero configuration: works transparently across sessions and runs |
| **Chunked storage for large files** | Files ≥ 10 MB are split into 4 MB chunks for fine-grained deduplication |
| **Optional per-session gzip** | Compress text-heavy content without breaking deduplication across compression variants |
| **Resumable backups** | Interrupted runs continue from the exact file they stopped on |
| **Atomic writes + WAL** | Crash-safe by design — no partial writes, no corrupted entries |
| **Self-describing format** | Each `.vorn` carries its own metadata; the store can be rebuilt by scanning |
| **Long-path support** | Works correctly on Windows paths > 260 characters (UNC, OneDrive, deep nesting) |
| **Removable-media aware** | Detects USB unplug mid-backup; refuses concurrent access from different machines |
| **Integrity verification** | Re-hash every entry in the vault and surface any drift against its original fingerprint |
| **Smart pruning** | Reclaim space by removing content no longer referenced by any session |
| **Non-destructive restore** | Extract individual files or entire snapshots to any location without touching originals |
| **Fast cancellation** | Stop a running backup, scan, prune, or restore in well under a second |
| **Multi-language UI** | English, Italian, French, German, Spanish, Portuguese |
| **Dark / Light theme** | Follows system preference or manual override |
| **Portable executables** | No installation required on Windows and Linux |
| **Fully offline** | Zero network access. No accounts. No telemetry. Ever. |

---

## Quick start

> [!IMPORTANT]
> **FAT32 is not supported.** Vorn requires a filesystem that guarantees atomic writes and supports files larger than 4 GB. Use **NTFS**, **exFAT**, **APFS**, or **ext4** for your store. Vorn will refuse to open a store on a FAT32 volume.

> [!WARNING]
> **Avoid compression with Google Drive sync.** If your store folder lives inside a synced Google Drive directory, disable compression for sessions pointing to that store. Google Drive can silently re-encode files, corrupting the compressed payload inside each `.vorn` container.

1. **Create a Store** — pick a destination folder (external drive, NAS, second internal drive).
2. **Create a Session** — name it, pick the source folders to protect, choose compression and chunking strategy.
3. **Run Backup** — Vorn scans, deduplicates, packs into the store.
4. **Restore Anytime** — browse any past run, extract individual files or whole snapshots to any location.

---

## Screenshots

[![Vorn screenshots](/Vorn-Console.png)](/Vorn-Console.png)

---

## How Vorn works

Vorn revolves around two concepts: **sessions** (what to back up and how) and the **store** (where deduplicated content lives).

### The `.vorn` format — self-describing data

Each unique piece of content is packed into a `.vorn` container. The container is the single source of truth: if Vorn's internal database is lost or damaged, the entire index can be reconstructed by scanning the store.

Every container holds:

1. **Header** — magic bytes + content length (binary, fixed-size).
2. **Payload** — the original bytes (or their gzip-compressed equivalent for compressed sessions). For very large files, the payload is empty and the metadata points to sibling `.vornc` chunk files instead.
3. **JSON metadata tail** — BLAKE3 hash of the original content, BLAKE3 hash of the compressed bytes (for fast integrity checks), compression type, size, and a record of every session + relative path referencing this content.

The filename of each `.vorn` is the BLAKE3 hash itself (optionally with a compression suffix like `_gzip`). That's the storeKey — your file's permanent address in the vault.

### Chunked storage for large files

Files that meet two conditions get split into chunks instead of being stored as a single blob:

- The session is configured with the **`chunks` strategy**, AND
- The file is **≥ 10 MB**.

When chunking is active, the file is divided into 4 MB fixed-size pieces. Each chunk is hashed independently and stored as a `.vornc` file. The parent `.vorn` becomes a lightweight manifest listing the chunks in order.

**Why this matters:**

- A single-byte change in a 5 GB video file only rewrites the chunks that actually changed — not the whole file.
- Two large files that share regions (common in databases, archives, virtual disks) deduplicate at the chunk level.
- Chunks are shared across sessions via cross-strategy lookup: if the same data was already stored uncompressed in another session, Vorn reuses it instead of writing a duplicate.

### Deduplication across the entire vault

When you back up three projects that all contain the same 200 MB asset, Vorn stores it **once**. The metadata records all three different paths. Your vault stays lean regardless of how many sessions point to the same content.

Deduplication is **cross-strategy**: existing content is reused regardless of the new session's compression or chunking preferences. Session settings apply only to new content.

### Compression — opt-in, per session

Each session can enable **gzip compression**. New files are compressed before being packed, reducing the store's footprint for source code, logs, JSON, and other compressible content. The compression type lives in the metadata, not in the filename — Vorn always reads the metadata, never guesses.

Compression is applied at write time only. Files already present in the store from a previous run are reused as-is, never recompressed.

### Crash safety — every write is atomic

Vorn never modifies a `.vorn` file in place. Every write follows the same pattern:

1. Write to a temporary file (`.tmp`) next to the destination.
2. `fsync` to flush kernel buffers to disk.
3. Rename atomically to the final path.

For metadata updates, a write-ahead log (`.mtmp`) records the intended change with a content-length fingerprint before the original file is touched. If the app crashes or power is lost mid-update, the next read transparently applies the WAL and removes the stale entries. The original `.vorn` cannot be left in a half-updated state.

### Removable media and network stores

Vorn assumes the store can disappear at any moment:

- **USB unplug detection** — long-running tasks (backup, prune, integrity) detect when the store becomes unreachable and halt cleanly. The UI surfaces a "store disconnected" state instead of corrupting partial writes.
- **Lock file with hostname check** — when the store sits on a NAS or network share, the lock file records both the holder's PID and machine name. A second computer cannot steal the lock just because the PID doesn't exist locally.
- **Single-writer access** — all writes to the store go through a single serialized request channel in the main process. Worker threads never open store files for write directly.

### Long-path support on Windows

Windows historically limits file paths to 260 characters — a real problem on modern systems with OneDrive Enterprise redirection, long usernames, and deep project structures. Vorn detects paths approaching this limit and transparently switches to the Windows extended-length path API (`\\?\` prefix), so storeDirs nested ten levels deep with 75-character hash filenames simply work.

### Cancellation that actually cancels

When you press **Stop**, Vorn doesn't just set a flag and hope. Cancellation is checked on every chunk of every operation — during file scanning, hashing, compression, store writes, and database queries. Even a backup blocked on a slow USB write or a multi-thousand-record database upsert cancels within a second.

### Restore — surgical and safe

From any past run, you can:

- **Restore to original locations** — system directories (`C:\Windows`, `/etc`, etc.) are blocked, UNC paths refused, Win32 namespace prefixes rejected.
- **Restore to a custom folder** — path-traversal attempts in the stored metadata (`../`, drive letters) are sanitized.
- **Pick specific files** from a run instead of restoring everything.
- **Extract by hash** — recover a single file directly by its BLAKE3 fingerprint, useful for forensic recovery.

Restore never touches the originals on disk. It writes to the destination only.

---

## Project structure

```
Vorn/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.js           # App entry point
│   │   ├── ipc.js             # Global IPC plumbing
│   │   ├── workerManager.js   # Worker lifecycle + cancel propagation
│   │   ├── handlers/          # IPC request handlers (store/session/task/system)
│   │   └── vorn/              # Core backup engine
│   │       ├── backup.js      # Backup orchestration
│   │       ├── restore.js     # Restore + extraction
│   │       ├── store.js       # Content-addressable store I/O
│   │       ├── format.js      # .vorn binary format + WAL
│   │       ├── compress.js    # gzip pipeline
│   │       ├── hash.js        # BLAKE3 hashing
│   │       ├── scanner.js     # Filesystem walk + exclusion rules
│   │       ├── safeFs.js      # Long-path-safe fs wrappers
│   │       ├── db.js          # SQLite mtime/size/hash cache
│   │       ├── *Worker.js     # Worker thread entry points
│   │       └── ...
│   ├── preload/               # Electron context bridge (sandboxed)
│   └── renderer/              # Vue 3 frontend
│       ├── views/             # Main application views
│       ├── components/        # Reusable UI components
│       └── locales/           # i18n translation files
├── build/                     # Build assets (icons)
├── electron.vite.config.mjs
└── package.json
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | [Electron](https://www.electronjs.org/) 41 |
| Frontend | [Vue 3](https://vuejs.org/) + [Tailwind CSS](https://tailwindcss.com/) 4 |
| Build | [electron-vite](https://electron-vite.org/) + [electron-builder](https://www.electron.build/) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL mode) |
| Hashing | [@noble/hashes](https://github.com/paulmillr/noble-hashes) — **BLAKE3** |
| i18n | [vue-i18n](https://vue-i18n.intlify.dev/) |

---

## Building from source

Pre-built binaries are available on the [Releases](https://github.com/LeonardoCiaccio/Vorn/releases) page for Windows, macOS, and Linux. Building from source is only needed to modify the code or build for a specific configuration.

> **Why does building require extra tools?** Vorn uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), a native Node.js addon that must be compiled specifically for the Electron version on your machine. The build process handles this automatically — you just need a working C++ toolchain.

### Windows

<details>
<summary><strong>Step 1 — Install Git</strong></summary>

Check if Git is already installed:
```powershell
git --version
```
If you get `git version X.Y.Z`, skip to Step 2.

Otherwise, download and install Git from **https://git-scm.com/download/win**.
During installation, leave all options at their defaults.

Verify after installation (open a new terminal):
```powershell
git --version
```
</details>

<details>
<summary><strong>Step 2 — Install Node.js (v20 or later)</strong></summary>

Check if Node.js is already installed:
```powershell
node --version
npm --version
```
If both commands return a version number and `node` is **v20 or higher**, skip to Step 3.

Otherwise, download the **LTS** installer from **https://nodejs.org** and run it.
Leave all options at their defaults — npm is included automatically.

Verify after installation (open a new terminal):
```powershell
node --version   # must be v20.x.x or higher
npm --version    # must be v10.x.x or higher
```
</details>

<details>
<summary><strong>Step 3 — Install C++ build tools (required for native modules)</strong></summary>

Vorn's SQLite dependency must be compiled from source.

**Recommended: Manual Installation**
1. Download **Visual Studio Build Tools** from [https://visualstudio.microsoft.com/visual-cpp-build-tools/](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. Run the installer.
3. Select the **"Desktop development with C++"** workload.
4. Ensure "MSVC v14x - VS 20xx C++ x64/x86 build tools" is checked in the optional components.
5. Click **Install**.

> **Alternative (faster but sometimes unreliable):**
> Open PowerShell as Administrator and run:
> ```powershell
> npm install --global windows-build-tools
> ```

Verify the compiler is available:
```powershell
node -e "require('child_process').execSync('cl', {stdio:'inherit'})"
```
You should see the MSVC compiler banner (errors about missing input files are normal — that means the compiler itself is found).
</details>

<details>
<summary><strong>Step 4 — Download, install and build</strong></summary>

**Option A — Download ZIP (recommended)**
1. Go to the **[Releases](https://github.com/LeonardoCiaccio/Vorn/releases)** page and download the **Source code (zip)** of the latest stable version.
2. Right-click the downloaded file and select **Extract All...**.
3. Open the folder, then **Shift + Right-click** on an empty space and select **"Open PowerShell window here"**.

**Option B — Git Clone**
```powershell
git clone https://github.com/LeonardoCiaccio/Vorn.git
cd Vorn
```

**Then, run the build commands:**
```powershell
# 1. Install dependencies and rebuild native modules
npm install

# 2. Run in development mode (optional, to test)
npm run dev

# 3. Produce a distributable portable .exe
npm run package
```
The executable will be in the `release/` folder.
</details>

### macOS

<details>
<summary><strong>Step 1 — Install Xcode Command Line Tools</strong></summary>

Check if the tools are already installed:
```bash
xcode-select -p
```
If you see a path like `/Library/Developer/CommandLineTools`, skip to Step 2.

Otherwise, install them:
```bash
xcode-select --install
```
A dialog will appear — click **Install** and wait for the download to finish (about 1–2 GB).

Verify after installation:
```bash
xcode-select -p        # prints the tools path
gcc --version          # prints GCC/clang version
make --version         # prints make version
```
</details>

<details>
<summary><strong>Step 2 — Install Node.js (v20 or later)</strong></summary>

Check if Node.js is already installed:
```bash
node --version
npm --version
```
If both return a version and `node` is **v20 or higher**, skip to Step 3.

**Option A — official installer (recommended for most users):**
Download the **LTS** package from **https://nodejs.org** and run the `.pkg` installer.

**Option B — Homebrew:**
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node
```

Verify after installation (open a new terminal):
```bash
node --version   # must be v20.x.x or higher
npm --version    # must be v10.x.x or higher
```
</details>

<details>
<summary><strong>Step 3 — Install Git</strong></summary>

Git is usually included with Xcode CLT. Check:
```bash
git --version
```
If you see a version number, skip to Step 4.

Otherwise, install via Homebrew:
```bash
brew install git
```
</details>

<details>
<summary><strong>Step 4 — Download, install and build</strong></summary>

1. Go to the **[Releases](https://github.com/LeonardoCiaccio/Vorn/releases)** page and download the **Source code (zip)** of the latest stable version.
2. Extract the ZIP file and enter the folder.
3. Open **Terminal** and navigate to that folder:
   - Type `cd ` (with a space) and drag the folder from Finder into the Terminal window.
   - Press **Enter**.

**Then, run the build commands:**

```bash
# 1. Install dependencies and rebuild native modules
npm install

# 2. Run in development mode (optional, to test)
npm run dev

# 3. Produce a distributable .dmg
npm run package
```
The `.dmg` file will be in the `release/` folder.

> **Apple Silicon (M1/M2/M3):** Builds natively for `arm64`. No Rosetta needed.
</details>

### Linux

<details>
<summary><strong>Step 1 — Install system dependencies</strong></summary>

Vorn needs Git, Node.js, a C++ compiler and Python to build native modules. Check what is already present:

```bash
git --version    # any version
node --version   # v20 or higher
npm --version    # v10 or higher
gcc --version    # any version (part of build-essential / base-devel)
python3 --version
```

Install any missing tools for your distribution:

**Debian / Ubuntu / Linux Mint:**
```bash
sudo apt update
sudo apt install -y git build-essential python3 curl
```

**Fedora / RHEL / Rocky Linux:**
```bash
sudo dnf install -y git gcc-c++ make python3 curl
```

**Arch Linux / Manjaro:**
```bash
sudo pacman -S --needed git base-devel python curl
```

**openSUSE:**
```bash
sudo zypper install -y git gcc-c++ make python3 curl
```
</details>

<details>
<summary><strong>Step 2 — Install Node.js v20 or later</strong></summary>

Check if already installed:
```bash
node --version
```
If the output is `v20.x.x` or higher, skip to Step 3.

**Option A — NodeSource (official, one command):**
```bash
# Installs Node.js 20 LTS via NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs          # Debian/Ubuntu

# For RPM-based distros:
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

**Option B — nvm (Node Version Manager, no root needed):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc          # or restart your terminal
nvm install 20
nvm use 20
```

Verify:
```bash
node --version   # must be v20.x.x or higher
npm --version    # must be v10.x.x or higher
```
</details>

<details>
<summary><strong>Step 3 — Download, install and build</strong></summary>

1. Go to the **[Releases](https://github.com/LeonardoCiaccio/Vorn/releases)** page and download the **Source code (tar.gz or zip)** of the latest stable version.
2. Extract the archive and enter the `Vorn-x.y.z` folder.
3. Open a **Terminal** inside that folder and run:

```bash
# 1. Install dependencies and rebuild native modules
npm install

# 2. Run in development mode (optional, to test)
npm run dev

# 3. Produce a distributable .AppImage
npm run package
```
The AppImage will be in the `release/` folder. Run it with:
```bash
chmod +x release/Vorn-*.AppImage
./release/Vorn-*.AppImage
```
</details>

### Available npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run build` | Compile the renderer and main process (no packaging) |
| `npm run preview` | Preview the compiled build without packaging |
| `npm run package` | Full build + create a distributable for the current platform |

---

## License

Vorn is open source under the **[GNU Affero General Public License v3.0](LICENSE)** (AGPL-3.0-only).

You are free to use, study, modify, and distribute Vorn — including running it on a server — as long as you make the source code of any modifications available under the same license.

**Commercial use:** if AGPL-3.0 does not fit your use case, a commercial license is available. See [COMMERCIAL.md](COMMERCIAL.md) for details.

---

## Contributing

Contributions are welcome. For major changes, please open an issue first so we can discuss the approach before you invest time in a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guidelines. Note that all contributions require signing the [Contributor License Agreement](CLA.md) — it's a one-time step handled automatically on your first pull request, and it guarantees your contribution will always remain available under the AGPL.

---

<div align="center">
  <sub>Built with care · AGPL-3.0 · <a href="COMMERCIAL.md">Commercial license available</a></sub>
</div>
