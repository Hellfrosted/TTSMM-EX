# TerraTech Steam Mod Manager EX

Electron + React desktop app for managing TerraTech Steam Workshop mod collections.

The EX build uses its own app identity and app-data directory, so it can be installed alongside the upstream `FLSoz` build on the same machine.

## Features

- Manage TerraTech mod collections without packaging or installing the app during development
- Load Steam Workshop dependency data from Steamworks and fall back to the Workshop page when needed
- Validate collection conflicts, missing dependencies, subscription state, install state, and update state
- Optionally treat `NuterraSteam`, `NuterraSteam(beta)`, and `NuterraSteam (Beta)` as equivalent during validation

## Development

```powershell
npm install
npm run dev
npm run start:desktop
npm run validate
npm run package
```

`npm run start:desktop` builds the app and launches the desktop build with `NODE_ENV=production` without creating an installer.

## Steamworks Setup

Most work on this repository does not require the Steamworks SDK.

Maintained Steamworks matrix:

- Windows x64
- Electron `41.x`
- `greenworks` `github:FLSoz/greenworks`
- Steamworks SDK `1.64`

macOS is not supported.

Avoid SDK upgrades unless TerraTech, Valve, or this app actually requires one.

`npm run setup:steamworks` also applies the local compatibility patch this repo needs before rebuilding the `greenworks` native module on current Windows toolchains.

If you need local Steam integration:

1. Download and extract the Steamworks SDK from the Steamworks partner site.
2. Set `STEAMWORKS_SDK_PATH` to the SDK directory that contains `public` and `redistributable_bin`.
   On Windows that usually means the extracted `...\steamworks_sdk_<version>\sdk` directory, not its parent.
3. Run:

```powershell
npm run setup:steamworks
```

Example on Windows:

```powershell
$env:STEAMWORKS_SDK_PATH='C:\path\to\steamworks_sdk\sdk'
npm run setup:steamworks
```

Verify Steam integration locally with:

```powershell
npm run smoke:steamworks
```

In development, the app will attempt to install React DevTools automatically. Set `UPGRADE_EXTENSIONS=1` before launch if you want to force a refresh of the downloaded extension.

## Dependency Validation Notes

- Workshop dependencies are resolved from Steamworks child items when available.
- If Steamworks does not return dependency children for a Workshop item, the app can fall back to the public Workshop page's `Required items` section.
- The `Treat Nuterra Variants as Equivalent` setting affects both explicit mod-ID dependencies and unresolved Workshop dependency names for Nuterra variants.

## Scripts

- `npm run dev`: run the app in development
- `npm run start:desktop`: build and launch the desktop app without packaging an installer
- `npm run lint`: run ESLint
- `npm run lint:fix`: run ESLint with autofix
- `npm run typecheck`: run TypeScript without emitting files
- `npm test`: run the Vitest unit and component test suite
- `npm run build`: build the Vite-managed main, preload, and renderer outputs
- `npm run validate`: run lint, typecheck, tests, and build
- `npm run setup:steamworks`: install and rebuild native Steamworks dependencies
- `npm run smoke:steamworks`: run an Electron-side Steamworks smoke test
- `npm run rebuild`: rebuild native Electron dependencies in `release/app`
- `npm run package`: build the Windows installer
- `npm run publish`: build release artifacts for tag or draft publishing
