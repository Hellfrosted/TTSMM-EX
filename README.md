# TerraTech Steam Mod Manager EX

TerraTech Steam Mod Manager EX is a desktop app for managing TerraTech mods from Steam Workshop and local mod folders.

TTSMM-EX is a fork of [`FLSoz/terratech-steam-mod-loader`](https://github.com/FLSoz/terratech-steam-mod-loader). It uses its own app identity and data folder, so it can be installed alongside the upstream app.

## Install

Download the release artifact for your platform from [Releases](https://github.com/Hellfrosted/TTSMM-EX/releases) and install it directly.

Windows:

- Run `TTSMM-EX Setup <version>.exe`.
- Launch `TTSMM-EX` from the Start menu or desktop shortcut.

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

AppImage:

```bash
chmod +x ./terratech-steam-mod-manager-ex-<version>.AppImage
./terratech-steam-mod-manager-ex-<version>.AppImage
```

Steam must be installed, running, and signed in from the same Windows or Linux install before launching the app. TerraTech should also be installed in that Steam library if you want TTSMM-EX to find the game and Workshop content automatically.

## Platform Notes

Windows uses the configured TerraTech executable when launching the game.

Linux launches TerraTech through Steam. The `TerraTech Executable` setting is not used on Linux, but Steam still needs to be running and signed in.

## App Data

TTSMM-EX stores its settings, collections, and Block Lookup cache in its own Electron app data folder named `TerraTech Steam Mod Manager EX`.

Useful files inside that folder include:

- `config.json`
- `collections/*.json`
- `block-lookup-index.json`
- `block-lookup-settings.json`
- `block-lookup-rendered-previews/`