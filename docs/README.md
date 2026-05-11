# Project Docs

Last reviewed: 2026-05-03

This directory holds durable project documentation for source builds, maintenance, and accepted architecture decisions. Start with the root README for setup context, then use the narrower docs here when a task touches a specific workflow or decision record.

## Docs

- [README.md](../README.md): install, source setup, runtime requirements, verification, packaging, app data, and behavior notes.
- [docs/development.md](development.md): Linux runtime packages, packaging details, script inventory, and reference links.
- [docs/adr/](adr/): accepted architecture decisions, including local diagnostics and telemetry policy.

## Maintenance

- Update `Last reviewed` only after checking the doc against current code, scripts, package metadata, or accepted decisions.
- Prefer small, targeted docs changes next to the source of truth they describe.
- Keep historical or superseded plans out of active guidance unless they are clearly marked as archival.
