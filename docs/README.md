# Project Docs

Last reviewed: 2026-05-13

This directory holds durable project documentation for source builds, packaging, maintenance, and accepted architecture decisions. The root README is intentionally end-user focused; keep contributor and maintainer details here unless they help someone install and run the app.

## Docs

- [README.md](../README.md): end-user install notes, product scope, platform notes, and app data location.
- [docs/development.md](development.md): source setup, Linux runtime packages, packaging details, script inventory, source-build behavior notes, and reference links.
- [docs/adr/](adr/): accepted architecture decisions, including renderer state/cache ownership, local diagnostics, and telemetry policy.

## Maintenance

- Update `Last reviewed` only after checking the doc against current code, scripts, package metadata, or accepted decisions.
- Prefer small, targeted docs changes next to the source of truth they describe.
- Keep historical or superseded plans out of active guidance unless they are clearly marked as archival.
- Keep the root README short and user-facing. Move build requirements, validation commands, internal architecture notes, and contributor workflow details into this directory.
