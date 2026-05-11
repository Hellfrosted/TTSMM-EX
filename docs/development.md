# Development Notes

Last reviewed: 2026-05-08

Use this page for details that are useful during source builds, validation, packaging, and maintenance but too bulky for the root README.

## Linux Runtime Packages

- Debian or Ubuntu: `libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0 libgbm1 libasound2t64`
- Arch: `gtk3 libnotify nss libxss libxtst xdg-utils at-spi2-core libsecret alsa-lib libappindicator`

Linux notes:

- Steam must be running and signed in before launching the app.
- TerraTech should be installed in that same Steam library if you want the app to find the game install and scan Workshop content.
- Linux launches TerraTech through Steam; the `TerraTech Executable` setting is unused there.
- Linux builds need a Linux dependency install; a Windows `node_modules` tree mounted into WSL is not enough.
- Source builds that rebuild Block Lookup extraction need `cargo` available on `PATH`.
- Older Debian/Ubuntu releases may provide `libasound2` instead of `libasound2t64`.

## WSL Commands

From WSL in the shared Windows checkout, run source setup with pnpm directly:

```bash
pnpm install
pnpm run setup:steamworks
```

## Packaging Details

Windows packaging:

```bash
pnpm run package
```

Expected Windows outputs:

- `TTSMM-EX Setup <version>.exe`
- `TTSMM-EX Setup <version>.exe.blockmap`
- `win-unpacked/`

Linux packaging:

```bash
pnpm run package
pnpm run package:linux -- deb
pnpm run package:linux -- pacman
```

Linux outputs:

- `pnpm run package` on Linux uses the default configured Linux target, `AppImage`.
- `pnpm run package:linux` produces both Linux package formats, `deb` and `pacman`.
- `pnpm run package:linux -- deb` produces `terratech-steam-mod-manager-ex_<version>_amd64.deb`.
- `pnpm run package:linux -- pacman` produces `terratech-steam-mod-manager-ex-<version>.pacman`.

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

## Scripts

- `pnpm run help`: list root and `release/app` package scripts
- `pnpm run dev`: development app
- `pnpm start`: build and launch the production desktop entrypoint
- `pnpm run build:block-lookup`: build and stage the Rust Block Lookup extractor
- `pnpm run lint`: Biome formatting and lint check
- `pnpm run lint:fix`: Biome formatting and lint autofix
- `pnpm run check:staged`: run staged-file checks for the pre-commit hook
- `pnpm run check:dead-code`: Fallow unused files, exports, dependencies, cycles, and boundaries check
- `pnpm run check:dupes`: Fallow duplication check
- `pnpm run check:health`: Fallow complexity and maintainability check
- `pnpm run check:audit`: Fallow changed-file audit for PR-sized review
- `pnpm run typecheck`: TypeScript build check
- `pnpm run test`: Vitest
- `pnpm run build`: build main, preload, and renderer
- `pnpm run validate`: lint, dead-code check, typecheck, tests, and build
- `pnpm audit --audit-level=moderate`: dependency security audit
- `pnpm outdated --long`: dependency freshness report; apply only patch/minor updates during routine maintenance
- `pnpm run setup:steamworks`: stage the SDK and rebuild native dependencies
- `pnpm run smoke:steamworks`: Electron-side Steamworks smoke test
- `pnpm run smoke:ui`: build, then run the GUI smoke test with isolated user data
- `pnpm run smoke:ui:built`: GUI smoke test against the existing `release/app/dist` build
- `pnpm run smoke:ui:packaged`: packaged-app GUI smoke test with isolated user data
- `pnpm run rebuild:electron`: rebuild native Electron dependencies in `release/app`
- `pnpm run package`: package for the current platform default target
- `pnpm run package:linux`: build both Linux package formats
- `pnpm run package:linux -- deb`: build the Debian package
- `pnpm run package:linux -- pacman`: build the pacman package
- `pnpm run publish`: package for tag or draft publishing
- `pnpm run version:bump -- patch`: patch version bump
- `pnpm run version:bump -- minor`: minor version bump
- `pnpm run version:bump -- major`: major version bump

## Local Push Gate

Pushing to `main` runs the Husky pre-push hook, which runs `pnpm run validate` with `CI=true`. This catches the same lint, dead-code, typecheck, test, and build failures locally before GitHub Actions spends a runner on them.

For emergency pushes only, set `TTSMM_SKIP_PRE_PUSH=1` or use Git's `--no-verify` flag. If either bypass is used, run `pnpm run validate` before relying on the pushed commit.

## Effect Boundaries

TypeScript internals use Effect v4 beta for async composition, expected failures, schema decoding, and renderer-local state/cache ownership. Keep `Effect.runPromise` and Promise-returning functions at framework boundaries only:

- Electron IPC, preload, contextBridge, and the shared renderer API contract.
- React event handlers, hooks, React Hook Form resolvers, and dynamic component imports. Renderer programs that touch Electron run through `runRenderer(...)`; React still receives Promises at its callback boundary.
- Electron app startup, window/devtools/updater/menu wiring, UI smoke scripts, and Vitest bridges.
- Main-process IPC handlers that run Effect programs use `runMain(...)` at the Electron Promise boundary.
- Native or callback adapters that must expose a Promise or callback to an external lifecycle, including Steam UGC callbacks, Steam persona event callbacks that resume Effect state with `Effect.runFork`, process/window lifecycle hooks, dynamic imports, and low-level test adapters.
- Renderer config, collection, mod metadata, game-running, Block Lookup cache, and local table/app state are owned by Effect Atom refs. Do not reintroduce React Query or Zustand as parallel owners.
- Internal concurrency owners should stay in Effect services or primitives. Current owners include validation fibers, the Steam persona cache service, Atom refs, and the hook-local collection write semaphore.
- `@effect/platform-node` belongs to Electron main-process and local script code only. Renderer code must not import it unless a future boundary proof explicitly expands that rule.
- `@effect/opentelemetry` is deferred by [ADR 0008](adr/0008-defer-effect-opentelemetry.md). Any future telemetry must be local-only by default, with no network exporter or off-device data flow unless a later decision designs an explicit user-controlled export path.

Remaining Promise/Effect ledger:

- Framework edges: `runRenderer(...)`, `runMain(...)`, React hooks/events, React Hook Form resolvers, and Vitest `Effect.runPromise(...)` bridges.
- Transport edges: `src/renderer/Api.ts`, `src/shared/electron-api.ts`, preload/contextBridge, and Electron IPC handler return values.
- Native/callback edges: Steamworks callback adapters, child process launch events, Electron window/updater/devtools lifecycle code, dynamic imports, and UI smoke delays.
- Runtime edges: `src/main/runtime.ts` and `src/renderer/runtime.ts`; do not create additional ad hoc runtime runners inside domain code.
- Follow-up candidates: remaining direct `Effect.runPromise(...)` calls inside renderer loading/settings hooks, collection save/validation/lifecycle/game-launch hooks, and other React callback boundaries are framework-edge calls today, but should move to `runRenderer(...)` when they start touching `RendererElectron` services.

Schema validation at IPC and form boundaries uses Effect Schema. Do not reintroduce Zod or duplicate old and new validation paths.

## Reference Links

Product and platform:

- [TerraTech Steam store page](https://store.steampowered.com/app/285920/TerraTech/)
- [Steam desktop client](https://store.steampowered.com/about/)
- [Steamworks documentation](https://partner.steamgames.com/doc/home)
- [Steam Workshop documentation](https://partner.steamgames.com/doc/features/workshop)

Core app stack:

- [Electron documentation](https://www.electronjs.org/docs/latest)
- [React documentation](https://react.dev/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [Node.js documentation](https://nodejs.org/docs/latest/api/)
- [pnpm documentation](https://pnpm.io/)
- [Vite documentation](https://vite.dev/)

Renderer libraries:

- [Tailwind CSS documentation](https://tailwindcss.com/docs)
- [TanStack Table documentation](https://tanstack.com/table/latest)
- [TanStack Virtual documentation](https://tanstack.com/virtual/latest)
- [React Hook Form documentation](https://react-hook-form.com/)
- [Effect documentation](https://effect.website/docs/)
- [Effect Schema documentation](https://effect.website/docs/schema/introduction/)
- [Lucide React documentation](https://lucide.dev/guide/packages/lucide-react)

Tooling and validation:

- [Vitest documentation](https://vitest.dev/)
- [Testing Library documentation](https://testing-library.com/docs/)
- [Biome documentation](https://biomejs.dev/)
- [Fallow documentation](https://docs.fallow.tools/)
- [electron-builder documentation](https://www.electron.build/)
