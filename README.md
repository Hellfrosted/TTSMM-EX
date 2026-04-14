# TerraTech Steam Mod Manager EX

Fork of TTSMM for managing TerraTech local mods and Steam Workshop collections.

The EX fork uses its own app identity and user-data directory, so it can be installed alongside the upstream `FLSoz` build.

## Setup

Requirements:

- Node `>=20 <26`
- npm `>=10 <12`
- Steam desktop client
- Steamworks SDK

Set the Steamworks SDK path before installing dependencies. Use either:

- `STEAMWORKS_SDK_PATH`
- a repo-local `.steamworks-sdk-path` file that points at the extracted `sdk` directory

Then:

```bash
npm install
npm run setup:steamworks
npm run dev
```

Other useful commands:

```bash
npm run start:desktop
npm run validate
npm run smoke:steamworks
```

This repo assumes Steamworks is available. Source builds without it are not a supported setup.

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

- `TerraTech Steam Mod Manager EX Setup <version>.exe`
- `TerraTech Steam Mod Manager EX Setup <version>.exe.blockmap`
- `win-unpacked/`

The Windows target is `nsis`. Installer resources come from `assets/icon.ico`.

### Linux

Build on Linux, or in WSL with a Linux dependency install:

```bash
npm run package
npm run package:linux:deb
npm run package:linux:pacman
npm run package:linux
```

Linux outputs:

- `npm run package` on Linux uses the default configured Linux target, `AppImage`
- `npm run package:linux:deb` produces `terratech-steam-mod-manager-ex_<version>_amd64.deb`
- `npm run package:linux:pacman` produces `terratech-steam-mod-manager-ex-<version>.pacman`

Notes:

- rerun `npm run setup:steamworks` after reinstalling dependencies or switching operating systems
- Linux rebuilds need a Linux dependency install; a Windows `node_modules` tree mounted into WSL is not enough
- Linux launches TerraTech through Steam; the `TerraTech Executable` setting is unused there
- the pacman target needs `bsdtar`

## Notes

- Workshop dependencies are resolved from Steamworks first
- if Steamworks does not return dependency children for a Workshop item, the app falls back to the public Workshop page `Required items` section
- `Treat NuterraSteam and NuterraSteam (Beta) as equivalent` affects both explicit mod-ID dependencies and unresolved Workshop dependency names

## Scripts

- `npm run dev`: development app
- `npm run start`: alias for `npm run dev`
- `npm run start:desktop`: build and launch the production desktop entrypoint
- `npm run lint`: ESLint
- `npm run lint:fix`: ESLint with autofix
- `npm run typecheck`: TypeScript build check
- `npm test`: Vitest
- `npm run build`: build main, preload, and renderer
- `npm run validate`: lint, typecheck, tests, and build
- `npm run setup:steamworks`: stage the SDK and rebuild native dependencies
- `npm run smoke:steamworks`: Electron-side Steamworks smoke test
- `npm run rebuild`: rebuild native Electron dependencies in `release/app`
- `npm run package`: package for the current platform default target
- `npm run package:linux:deb`: build the Debian package
- `npm run package:linux:pacman`: build the pacman package
- `npm run package:linux`: build both Linux package formats
- `npm run publish`: package for tag or draft publishing
- `npm run only-publish`: run Electron Builder publish directly
- `npm run patch`: patch version bump
- `npm run minor`: minor version bump
- `npm run major`: major version bump
