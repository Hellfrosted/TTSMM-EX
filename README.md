# TerraTech Steam Mod Manager EX

TerraTech Steam Mod Manager EX is an Electron desktop app for configuring TerraTech local mods, resolving Steam Workshop metadata and dependencies, validating collections, and launching the game with a predictable setup.

TTSMM-EX is a fork of [`FLSoz/terratech-steam-mod-loader`](https://github.com/FLSoz/terratech-steam-mod-loader). It has its own app identity and Electron user-data directory, so it can be installed alongside the upstream build.

Last reviewed: 2026-05-11

## Install

If you only want to run the app, download a release artifact for your platform and install it directly.

Windows:

- Run `TTSMM-EX Setup <version>.exe`
- Launch `TTSMM-EX` from the Start menu or the desktop shortcut

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

Steam must be installed, running, and signed in from the same Linux or Windows install before launching the app.

## Build from source requirements

- Node `>=24 <26`
- pnpm `>=11 <12`
- Rust toolchain with `cargo` for source builds that build or package Block Lookup bundle extraction
- Steam desktop client
- Steamworks SDK for source builds that need Steam integration

The root lockfile is `pnpm-lock.yaml`, and the repo is configured to run through pnpm end to end. The packaging-only `release/app` package keeps its own committed `release/app/pnpm-lock.yaml` for packaged runtime dependencies that Electron main/preload builds externalize.

## Source Setup

Set `STEAMWORKS_SDK_PATH`, or create a repo-local `.steamworks-sdk-path` file that points at the extracted Steamworks `sdk` directory. Then install dependencies and rebuild Steamworks:

```bash
pnpm install
pnpm run setup:steamworks
```

Run the production desktop entrypoint from source:

```bash
steam &
pnpm start
```

`pnpm start` builds the Rust Block Lookup extractor, builds the Electron app, and launches the production desktop entrypoint.

For frontend development with the Vite dev server:

```bash
pnpm run dev
```

This repository assumes Steamworks is available for source builds. Steam must be running and initialized for the desktop app to load.

## App Data

The EX fork stores its data under its own Electron `userData` directory, `TerraTech Steam Mod Manager EX`.

Files of interest:

- `config.json`
- `collections/*.json`
- `block-lookup-index.json`
- `block-lookup-settings.json`
- `block-lookup-rendered-previews/`

Development and smoke-test runs can override this directory with `TTSMM_EX_USER_DATA_DIR` or `--ttsmm-ex-user-data-dir=<path>`.

## Behavior Notes

- Workshop dependencies are resolved from Steamworks first.
- If Steamworks does not return dependency children for a Workshop item, the app records the dependency metadata as unknown rather than scraping the public Workshop page.
- `Treat NuterraSteam and NuterraSteam (Beta) as equivalent` affects both explicit mod-ID dependencies and unresolved Workshop dependency names.
- Collection create, duplicate, rename, delete, and switch are main-process lifecycle commands. Renderer code should apply the returned state instead of coordinating filesystem rollback.
- Startup Collection Resolution runs before the Collection workspace loads and must leave the app with a valid saved or newly created Active Collection.
- Block Lookup bundle extraction runs through the Rust sidecar staged at `release/app/bin`; TypeScript owns parsing, index persistence, SpawnBlock aliases, and search.
