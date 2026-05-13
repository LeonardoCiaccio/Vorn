<div align="center">
  <img src="build/icon.png" alt="Vorn — Vault Of Redundant Nodes" width="256px" />
  <br/><br/>

  <h1>Vorn</h1>
  <p><strong>Vault Of Redundant Nodes</strong></p>
  <p>A fast, ultra-secure, cross-platform desktop backup tool with content-addressable storage and automatic deduplication.</p>

  <p>
    <img src="https://img.shields.io/badge/version-0.8.11-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platforms" />
    <img src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3" />
  </p>
</div>

---

## Why Vorn?

Most backup tools copy files as-is — the same content stored a hundred times in a hundred places. Vorn takes a smarter, modern approach.

Every file is identified by its **BLAKE3 fingerprint** — a state-of-the-art hashing algorithm that is significantly faster and more secure than traditional SHA-256. Identical content is stored only once across every session and every backup run.

- **Dramatically smaller backups** — duplicate files across your projects take zero extra space.
- **Lightning fast** — uses a local SQLite database to skip re-hashing files that haven't changed.
- **Crash-resilient** — uses atomic writes and WAL (Write-Ahead Logging) to ensure your backup is never corrupted.
- **Disaster Proof** — session files lost? No problem. The .vorn format is self-describing, meaning your data remains independently recoverable directly from the store.
- **Truly incremental** — only new or modified content is processed.
- **Resumable** — interrupted backups pick up exactly where they left off.
- **Portable** — a single folder (the Store) holds your entire vault. Move it anywhere.
- **Optional compression** — enable gzip per session to shrink compressible content further, with zero impact on deduplication.

Everything runs locally. No accounts, no cloud services, no telemetry. Your data stays yours.

---

## Quick Start

> [!IMPORTANT]
> **FAT32 is not supported.** Vorn requires a filesystem that guarantees atomic writes and supports files larger than 4 GB. FAT32 cannot provide the reliability guarantees that the `.vorn` format depends on. Use **NTFS**, **exFAT**, **APFS**, or **ext4** for your store destination. Vorn will refuse to open a store on a FAT32 volume.

1. **Create a Store**: Choose a destination folder (e.g., an external drive or NAS) where Vorn will safely pack your files.
2. **Setup a Session**: Give it a name and select the folders you want to protect.
3. **Run Backup**: Hit the backup button. Vorn will scan, deduplicate, and secure your files into the store.
4. **Restore**: Need a file back? Browse any past run and extract exactly what you need to any location.

---

## Features

| Feature | Description |
|---|---|
| **Content-addressable store** | Files are addressed by hash — identical content is written once, referenced everywhere |
| **Atomic Writes** | Files are written to a temporary location and renamed only when complete to prevent corruption |
| **Automatic deduplication** | Zero effort: Vorn handles it transparently at the file level |
| **Incremental backups** | Uses file metadata (mtime/size) to skip processing unchanged files |
| **Resume interrupted runs** | Pick up where you left off after a crash or manual stop |
| **Optional gzip compression** | Enable per-session gzip to reduce store footprint for compressible content — deduplication is preserved across compression variants |
| **Store integrity check** | Re-verify every entry in the vault against its original BLAKE3 hash |
| **Store pruning** | Automatically remove data that is no longer referenced by any session |
| **Non-destructive restore** | Extract individual files or entire runs to any destination without touching originals |
| **Multi-language UI** | Available in English, Italian, French, German, Spanish, and Portuguese |
| **Dark / Light theme** | Follows your system preference or can be set manually |
| **Portable executables** | No installation required on Windows and Linux |
| **Fully offline** | No network access, no telemetry, no accounts |

---

## Screenshots


[![Vorn screenshots](/Vorn-Console.png)](/Vorn-Console.png)

---

## Building from source

Vorn is distributed as source code only. You build it yourself for your platform — this takes about 5 minutes and requires only free, open-source tools.

> **Why?** Vorn uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), a native Node.js addon that must be compiled specifically for the Electron version on your machine. The build process handles this automatically.

---

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

> **Alternative (Faster but sometimes unreliable):**
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

**Option A — Download ZIP (Recommended)**
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

---

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
</details>
> **Apple Silicon (M1/M2/M3):** Builds natively for `arm64`. No Rosetta needed.
</details>

---

### Linux

<details>
<summary><strong>Step 1 — Install system dependencies</strong></summary>

Vorn needs Git, Node.js, a C++ compiler and Python to build native modules. Check what is already present:

```bash
git --version    # need any version
node --version   # need v20 or higher
npm --version    # need v10 or higher
gcc --version    # need any version (part of build-essential / base-devel)
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

---

### Available npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the app in development mode with hot reload |
| `npm run build` | Compile the renderer and main process (no packaging) |
| `npm run preview` | Preview the compiled build without packaging |
| `npm run package` | Full build + create a distributable for the current platform |

---

## How it works

Vorn organizes your backups around two concepts: **sessions** and the **store**.

### The .vorn Format: Self-Describing Data
Vorn doesn't just copy files. Each unique file is packed into a `.vorn` container. This is a crucial safety feature: **the Store is the single source of truth.**

Each container includes:
1. **Header**: Magic bytes and content length.
2. **Payload**: The original file content — or its gzip-compressed equivalent if compression is enabled for that session.
3. **Metadata**: A JSON tail containing the BLAKE3 hash, file size, compression type, and — most importantly — **a record of every session and relative path** that references this content.

**Why this matters:** If you accidentally delete Vorn's internal configuration files or the index database, your backups are still safe. Because every `.vorn` file knows its original identity, the entire index can be reconstructed by simply scanning the store. Your data is never "trapped" in a proprietary, opaque database.

### Deduplication in practice
If you back up three projects that all contain the same 200 MB video file, Vorn stores it **once** as a single `.vorn` file. The metadata inside that file will record all three different paths. Your vault stays lean regardless of how many sessions point to the same content.

### Compression
Each session can optionally enable **gzip compression**. When active, newly written files are compressed before being packed into the store — reducing footprint for text-heavy content such as source code, logs, or documents. Compression is applied at write time only: files already present in the store via a previous run are deduplicated as-is and never recompressed.

The compression type is stored in the metadata, not inferred from the filename. Deduplication works correctly across compression variants: two sessions that back up the same file with different compression settings produce separate, independent store entries.

### Data Integrity
Vorn is built for safety. When writing to the store, it uses a **Write-Ahead** strategy. If the app crashes or the power goes out, Vorn can detect the interrupted operation and recover or clean up automatically, ensuring your store remains in a consistent state.

### Restoring files
From any session's run, you can restore individual files or entire snapshots to a destination folder of your choice. Vorn extracts the correct version from the store without touching the originals.

---

## Project structure

```
Vorn/
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.js        # App entry point
│   │   ├── handlers/       # IPC request handlers
│   │   └── vorn/           # Core backup engine
│   │       ├── backup.js   # Backup orchestration
│   │       ├── restore.js  # Restore & extraction
│   │       ├── store.js    # Content-addressable store I/O
│   │       ├── db.js       # SQLite file-change cache
│   │       └── ...
│   ├── preload/            # Electron context bridge
│   └── renderer/           # Vue 3 frontend
│       ├── views/          # Main application views
│       ├── components/     # Reusable UI components
│       └── locales/        # i18n translation files
├── build/
│   └── icon.png            # Application icon
├── docs/
│   └── banner.png          # README header image
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
| Hashing | [@noble/hashes](https://github.com/paulmillr/noble-hashes) — High-performance **BLAKE3** |
| i18n | [vue-i18n](https://vue-i18n.intlify.dev/) |

---

## License

Vorn is open source under the **[GNU Affero General Public License v3.0](LICENSE)** (AGPL-3.0-only).

This means you are free to use, study, modify, and distribute Vorn — including running it on a server — as long as you make the source code of any modifications available under the same license.

**Commercial use:** If AGPL-3.0 does not fit your use case, a commercial license is available. See [COMMERCIAL.md](COMMERCIAL.md) for details.

---

## Contributing

Contributions are welcome! Please open an issue before submitting a pull request for major changes, so we can discuss the approach first.

---

<div align="center">
  <sub>Built with care · AGPL-3.0 · <a href="COMMERCIAL.md">Commercial license available</a></sub>
</div>
