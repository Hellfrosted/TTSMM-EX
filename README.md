# TerraTech Steam Mod Manager EX

TerraTech Steam Mod Manager EX is an Electron desktop app for configuring TerraTech local mods, resolving Steam Workshop metadata and dependencies, validating collections, and launching the game with a predictable setup.

TTSMM-EX is a product fork of [`FLSoz/terratech-steam-mod-loader`](https://github.com/FLSoz/terratech-steam-mod-loader). It has its own app identity and Electron user-data directory, so it can be installed alongside the upstream build.

Last reviewed: 2026-05-03

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

## Requirements

- Node `>=20.19 <26`
- pnpm `10.x` with lockfile v9 support
- Rust toolchain with `cargo` for source builds that build or package Block Lookup bundle extraction
- Steam desktop client
- Steamworks SDK for source builds that need Steam integration

The root lockfile is `pnpm-lock.yaml`, and the repo is configured to run through pnpm end to end. The packaging-only `release/app` package shares that root lockfile instead of maintaining its own committed lockfile.

When working from WSL while repo is checked out on Windows, use `./scripts/wsl-pnpm ...` for project commands. The Windows dependency tree owns `node_modules`, and the repo blocks Linux installs under `/mnt/c`.

## Source Setup

Set `STEAMWORKS_SDK_PATH`, or create a repo-local `.steamworks-sdk-path` file that points at the extracted Steamworks `sdk` directory. Then install dependencies and rebuild Steamworks:

```bash
pnpm install
pnpm run setup:steamworks
```

Run the production desktop entrypoint from source:

```bash
steam &
pnpm run start:desktop
```

`start:desktop` builds the Rust Block Lookup extractor, builds the Electron app, and launches the production desktop entrypoint.

For local UI work without Steamworks access, bypass the startup check. Workshop metadata and Steam actions are disabled in this mode.

```bash
TTSMM_BYPASS_STEAMWORKS=1 pnpm run start:desktop
```

For frontend development with the Vite dev server:

```bash
pnpm run dev
```

This repository assumes Steamworks is available for complete source builds. Source builds without it are only useful for local UI work with the bypass enabled.

## App Data

The EX fork stores its data under its own Electron `userData` directory, `TerraTech Steam Mod Manager EX`.

Files of interest:

- `config.json`
- `collections/*.json`

Development and smoke-test runs can override this directory with `TTSMM_EX_USER_DATA_DIR` or `--ttsmm-ex-user-data-dir=<path>`.

## Project Shape

- `src/main/`: Electron main process, IPC handlers, Steamworks integration, persistence, Block Lookup, updater, and window setup
- `src/renderer/`: React renderer, routes, views, state, hooks, table/workspace modules, and UI components
- `src/shared/` and `src/model/`: shared contracts, validation helpers, lifecycle types, and persisted/runtime models
- `src/__tests__/`: Vitest coverage for main, renderer, shared, model, and script behavior
- `native/block-lookup-extractor/`: Rust sidecar that reads Unity bundles and returns TextAsset payloads for Block Lookup indexing
- `scripts/` and `release/app/`: build/package scripts, Steamworks setup, smoke tests, packaged manifest, and native production dependencies
- `docs/adr/`: accepted architecture decisions

See [docs/development.md](docs/development.md) for Linux runtime packages, detailed packaging notes, script inventory, and reference links.

## Verification

Run the smallest command that proves the change.

Common checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run deadcode
```

From WSL in the shared Windows checkout, run the same checks through `./scripts/wsl-pnpm`, for example:

```bash
./scripts/wsl-pnpm run typecheck
./scripts/wsl-pnpm run lint
./scripts/wsl-pnpm test
```

Full validation includes a build:

```bash
pnpm run validate
```

Smoke checks:

```bash
pnpm run smoke:steamworks
pnpm run smoke:ui
pnpm run smoke:ui:built
pnpm run smoke:ui:packaged
```

`smoke:ui` builds the app, launches Electron with isolated user data and Steamworks bypass, then verifies startup, Collection, Block Lookup, and Settings screenshots. Use `smoke:ui:built` when `pnpm run build` has already produced `release/app/dist`.

## Packaging

```bash
pnpm run package
pnpm run package:linux -- deb
pnpm run package:linux -- pacman
```

Artifacts are written to `release/build`. `pnpm run package` builds the current platform default target. `package:linux` must run from Linux and can build `deb` and `pacman` targets.

## Behavior Notes

- Workshop dependencies are resolved from Steamworks first.
- If Steamworks does not return dependency children for a Workshop item, the app falls back to the public Workshop page `Required items` section.
- `Treat NuterraSteam and NuterraSteam (Beta) as equivalent` affects both explicit mod-ID dependencies and unresolved Workshop dependency names.
- Collection create, duplicate, rename, delete, and switch are main-process lifecycle commands. Renderer code should apply the returned state instead of coordinating filesystem rollback.
- Startup Collection Resolution runs before the Collection workspace loads and must leave the app with a valid saved or newly created Active Collection.
- Block Lookup bundle extraction runs through the Rust sidecar staged at `release/app/bin`; TypeScript owns parsing, index persistence, SpawnBlock aliases, and search.
