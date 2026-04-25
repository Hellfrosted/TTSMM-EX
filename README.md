# TerraTech Steam Mod Manager EX

Fork of TTSMM for managing TerraTech local mods and Steam Workshop collections.

The EX fork uses its own app identity and user-data directory, so it can be installed alongside the upstream `FLSoz` build.

## Install

If you only want to run the app, download a release artifact for your distro and install it directly.

Windows:

- Run `TTSMM-EX Setup <version>.exe`
- Launch `TTSMM-EX` from the Start menu or the desktop shortcut after install

Debian or Ubuntu:

```bash
sudo apt install ./terratech-steam-mod-manager-ex_<version>_amd64.deb
terratech-steam-mod-manager-ex
```

Arch:

```bash
sudo pacman -U ./terratech-steam-mod-manager-ex-<version>.pacman
terratech-steam-mod-manager-ex
```

Steam must already be installed and running on that same Linux install before you launch the app.

## Setup

Requirements:

- Node `>=20 <26`
- npm `>=10 <12`
- Steam desktop client installed in the same Linux or Windows install you are running the app from
- Steamworks SDK

Linux runtime packages:

- Debian or Ubuntu: `libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0`
- Arch: `gtk3 libnotify nss libxss libxtst xdg-utils at-spi2-core libsecret alsa-lib libappindicator`

Set the Steamworks SDK path before installing dependencies. Use either:

- `STEAMWORKS_SDK_PATH`
- a repo-local `.steamworks-sdk-path` file that points at the extracted `sdk` directory

Install dependencies and rebuild Steamworks:

```bash
npm install
npm run setup:steamworks
```

Run from source:

```bash
steam &
npm run start:desktop
```

For frontend development with the Vite dev server:

```bash
npm run dev
```

Other useful commands:

```bash
npm run start:desktop
npm run validate
npm run smoke:steamworks
```

This repo assumes Steamworks is available. Source builds without it are not a supported setup.

Linux notes:

- Steam must be running and signed in before launching the app
- TerraTech should be installed in that same Steam library if you want the app to find the game install and scan workshop content
- Linux launches TerraTech through Steam; the `TerraTech Executable` setting is unused there
- Linux builds need a Linux dependency install; a Windows `node_modules` tree mounted into WSL is not enough

## Data

The EX fork stores its data under its own Electron `userData` directory, `TerraTech Steam Mod Manager EX`.

Files of interest:

- `config.json`
- `collections/*.json`

## Packaging

Artifacts are written to `release/build`.

### Windows

Build on Windows with:

```bash
npm run package
```

This produces:

- `TTSMM-EX Setup <version>.exe`
- `TTSMM-EX Setup <version>.exe.blockmap`
- `win-unpacked/`

The Windows target is `nsis`. Installer resources come from `assets/icon.ico`.

### Linux

Build Linux artifacts on Linux:

```bash
npm run package
npm run package:linux -- deb
npm run package:linux -- pacman
```

Linux outputs:

- `npm run package` on Linux uses the default configured Linux target, `AppImage`
- `npm run package:linux` produces both Linux package formats, `deb` and `pacman`
- `npm run package:linux -- deb` produces `terratech-steam-mod-manager-ex_<version>_amd64.deb`
- `npm run package:linux -- pacman` produces `terratech-steam-mod-manager-ex-<version>.pacman`

Install and run:

```bash
# Debian or Ubuntu
sudo apt install ./release/build/terratech-steam-mod-manager-ex_<version>_amd64.deb

# Arch
sudo pacman -U ./release/build/terratech-steam-mod-manager-ex-<version>.pacman

# Run the packaged app
terratech-steam-mod-manager-ex
```

If you use the default AppImage target:

```bash
chmod +x ./release/build/*.AppImage
./release/build/*.AppImage
```

The pacman target needs `bsdtar`.

## Notes

- Workshop dependencies are resolved from Steamworks first
- if Steamworks does not return dependency children for a Workshop item, the app falls back to the public Workshop page `Required items` section
- `Treat NuterraSteam and NuterraSteam (Beta) as equivalent` affects both explicit mod-ID dependencies and unresolved Workshop dependency names

## Renderer Styling

Tailwind is the default tool for new renderer UI layout, spacing, typography, state styling, and simple controls. Keep the app dense, desktop-first, and utilitarian: prefer compact tool surfaces, predictable alignment, and scan-friendly controls over marketing-style sections.

Use the existing app theme variables from `src/renderer/theme.ts` and `src/renderer/App.tailwind.css` for color, radius, and typography. Custom CSS remains appropriate for measured virtualized tables, resize handles, split-pane sizing, Electron shell surfaces, and durable design tokens that Tailwind utilities cannot express cleanly.

## Scripts

- `npm run help`: list root and `release/app` npm scripts
- `npm run dev`: development app
- `npm run start:desktop`: build and launch the production desktop entrypoint
- `npm run lint`: ESLint and Biome unused-code lint
- `npm run lint:eslint`: ESLint
- `npm run lint:eslint:fix`: ESLint with autofix
- `npm run lint:biome`: Biome unused-code lint
- `npm run lint:biome:fix`: Biome unused-code autofix
- `npm run lint:fix`: ESLint autofix and Biome unsafe autofix
- `npm run deadcode`: Knip unused files, exports, and dependencies check
- `npm run typecheck`: TypeScript build check
- `npm test`: Vitest
- `npm run build`: build main, preload, and renderer
- `npm run validate`: lint, Knip dead-code check, typecheck, tests, and build
- `npm run setup:steamworks`: stage the SDK and rebuild native dependencies
- `npm run smoke:steamworks`: Electron-side Steamworks smoke test
- `npm run rebuild`: rebuild native Electron dependencies in `release/app`
- `npm run package`: package for the current platform default target
- `npm run package:linux`: build both Linux package formats
- `npm run package:linux -- deb`: build the Debian package
- `npm run package:linux -- pacman`: build the pacman package
- `npm run publish`: package for tag or draft publishing
- `npm run bump -- patch`: patch version bump
- `npm run bump -- minor`: minor version bump
- `npm run bump -- major`: major version bump
- `npm --prefix release/app run electron-rebuild`: rebuild the packaged app native modules
- `npm --prefix release/app run link-modules`: relink packaged app modules
