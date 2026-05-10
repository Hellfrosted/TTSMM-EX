# Development Notes

Last reviewed: 2026-05-03

Use this page for details that are useful during source builds, validation, packaging, and maintenance but too bulky for the root README.

## Linux Runtime Packages

- Debian or Ubuntu: `libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0`
- Arch: `gtk3 libnotify nss libxss libxtst xdg-utils at-spi2-core libsecret alsa-lib libappindicator`

Linux notes:

- Steam must be running and signed in before launching the app.
- TerraTech should be installed in that same Steam library if you want the app to find the game install and scan Workshop content.
- Linux launches TerraTech through Steam; the `TerraTech Executable` setting is unused there.
- Linux builds need a Linux dependency install; a Windows `node_modules` tree mounted into WSL is not enough.
- Source builds that rebuild Block Lookup extraction need `cargo` available on `PATH`.

## WSL Commands

From WSL in the shared Windows checkout, run source setup through the helper:

```bash
./scripts/wsl-pnpm install
./scripts/wsl-pnpm run setup:steamworks
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
- `pnpm run start:desktop`: build and launch the production desktop entrypoint
- `pnpm run build:native:block-lookup`: build and stage the Rust Block Lookup extractor
- `pnpm run lint`: Biome formatting and lint check
- `pnpm run lint:fix`: Biome formatting and lint autofix
- `pnpm run deadcode`: Knip unused files, exports, and dependencies check
- `pnpm run typecheck`: TypeScript build check
- `pnpm test`: Vitest
- `pnpm run build`: build main, preload, and renderer
- `pnpm run validate`: lint, Knip dead-code check, typecheck, tests, and build
- `pnpm audit --audit-level=moderate`: dependency security audit
- `pnpm outdated --long`: dependency freshness report; apply only patch/minor updates during routine maintenance
- `pnpm run setup:steamworks`: stage the SDK and rebuild native dependencies
- `pnpm run smoke:steamworks`: Electron-side Steamworks smoke test
- `pnpm run smoke:ui`: build, then run the GUI smoke test with isolated user data
- `pnpm run smoke:ui:built`: GUI smoke test against the existing `release/app/dist` build
- `pnpm run smoke:ui:packaged`: packaged-app GUI smoke test with isolated user data
- `pnpm run rebuild`: rebuild native Electron dependencies in `release/app`
- `pnpm run package`: package for the current platform default target
- `pnpm run package:linux`: build both Linux package formats
- `pnpm run package:linux -- deb`: build the Debian package
- `pnpm run package:linux -- pacman`: build the pacman package
- `pnpm run publish`: package for tag or draft publishing
- `pnpm run bump -- patch`: patch version bump
- `pnpm run bump -- minor`: minor version bump
- `pnpm run bump -- major`: major version bump

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
- [TanStack Query documentation](https://tanstack.com/query/latest)
- [TanStack Table documentation](https://tanstack.com/table/latest)
- [TanStack Virtual documentation](https://tanstack.com/virtual/latest)
- [React Hook Form documentation](https://react-hook-form.com/)
- [Zod documentation](https://zod.dev/)
- [Zustand documentation](https://zustand.docs.pmnd.rs/)
- [Lucide React documentation](https://lucide.dev/guide/packages/lucide-react)

Tooling and validation:

- [Vitest documentation](https://vitest.dev/)
- [Testing Library documentation](https://testing-library.com/docs/)
- [Biome documentation](https://biomejs.dev/)
- [Knip documentation](https://knip.dev/)
- [electron-builder documentation](https://www.electron.build/)
