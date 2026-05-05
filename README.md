<div align="center">
  <img src="docs/banner.png" alt="Vorn — Vault Of Redundant Nodes" width="100%" />
  <br/><br/>

  <h1>Vorn</h1>
  <p><strong>Vault Of Redundant Nodes</strong></p>
  <p>A fast, cross-platform desktop backup tool with content-addressable storage and automatic deduplication.</p>

  <p>
    <img src="https://img.shields.io/badge/version-0.7.3-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platforms" />
    <img src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
    <img src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3" />
  </p>
</div>

---

## Why Vorn?

Most backup tools copy files as-is — the same content stored a hundred times in a hundred places. Vorn takes a smarter approach.

Every file is identified by its **SHA-256 fingerprint**. Identical content is stored only once across every session and every backup run. This means:

- **Dramatically smaller backups** — duplicate files across your projects take zero extra space.
- **Truly incremental** — only files that actually changed get re-processed.
- **Resumable** — interrupted backups pick up exactly where they left off.
- **Portable** — a single file (or folder) holds your entire vault. Carry it on a USB drive, sync it to a NAS, or keep it on a second disk.

Everything runs locally. No accounts, no cloud services, no subscriptions.

---

## Features

| Feature | Description |
|---|---|
| **Content-addressable store** | Files are addressed by hash — identical content is written once, referenced everywhere |
| **Automatic deduplication** | Zero effort: Vorn handles it transparently at the chunk level |
| **Incremental backups** | Only changed files are processed on subsequent runs |
| **Resume interrupted runs** | Pick up where you left off after a crash or manual stop |
| **Multiple sessions** | Independently manage backups for different projects or drives |
| **Non-destructive restore** | Extract individual files or entire runs to any destination |
| **Store integrity check** | Verify every entry in the vault against its stored hash |
| **Store browser** | Inspect, navigate, and manage the contents of your vault |
| **Antivirus warning** | Warns before backing up executable files (optional, per-session) |
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

Vorn's SQLite dependency must be compiled from source. The fastest way is via npm:

```powershell
npm install --global windows-build-tools
```

> If the above fails (it requires administrator rights), install manually:
> download **Visual Studio Build Tools** from https://visualstudio.microsoft.com/visual-cpp-build-tools/,
> run the installer, select the **"Desktop development with C++"** workload, and click Install.

Verify the compiler is available:
```powershell
node -e "require('child_process').execSync('cl', {stdio:'inherit'})"
```
You should see the MSVC compiler banner (errors about missing input files are normal — that means the compiler itself is found).
</details>

<details>
<summary><strong>Step 4 — Clone, install and build</strong></summary>

```powershell
# Clone the repository
git clone https://github.com/LeonardoCiaccio/Vorn.git
cd Vorn

# Install all dependencies and rebuild native modules for Electron
npm install

# Run in development mode (live reload, DevTools open automatically)
npm run dev
```

To produce a distributable portable `.exe`:
```powershell
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
<summary><strong>Step 4 — Clone, install and build</strong></summary>

```bash
# Clone the repository
git clone https://github.com/LeonardoCiaccio/Vorn.git
cd Vorn

# Install all dependencies and rebuild native modules for Electron
npm install

# Run in development mode (live reload, DevTools open automatically)
npm run dev
```

To produce a distributable `.dmg`:
```bash
npm run package
```
The disk image will be in the `release/` folder.

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
<summary><strong>Step 3 — Clone, install and build</strong></summary>

```bash
# Clone the repository
git clone https://github.com/LeonardoCiaccio/Vorn.git
cd Vorn

# Install all dependencies and rebuild native modules for Electron
npm install

# Run in development mode (live reload, DevTools open automatically)
npm run dev
```

To produce a distributable `.AppImage`:
```bash
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

### Sessions
A session is a named configuration that points to one or more source folders or files. Each time you run a backup, Vorn creates a **run** inside that session — a snapshot of what changed since the last run.

### The Store
The store is a single directory on disk that acts as a content-addressable vault. Every unique file ever backed up lives here, addressed by its SHA-256 hash. Sessions reference files in the store — they never duplicate them.

### Deduplication in practice
If you back up three projects that all contain the same 200 MB video file, Vorn stores it once and records three references. Your vault stays lean regardless of how many sessions point to the same content.

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
| Hashing | [@noble/hashes](https://github.com/paulmillr/noble-hashes) — pure JS SHA-256 |
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
