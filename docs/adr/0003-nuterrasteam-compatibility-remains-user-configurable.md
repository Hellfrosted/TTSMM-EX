# NuterraSteam Beta Matching Remains User Configurable

## Status

Accepted

Last reviewed: 2026-05-03

## Context

Steam Workshop metadata can refer to NuterraSteam under either the stable name or the beta name. A hidden canonicalization rule would make validation easier to implement, but it would also remove a user-visible distinction that can matter for some TerraTech setups.

## Decision

TTSMM-EX defaults to treating NuterraSteam and NuterraSteam Beta as the same dependency target because Workshop metadata appears under both names, but this is a fork feature rather than a hidden canonicalization rule. The compatibility policy remains a Settings toggle, default-on for old and new configs, so users can opt back into exact stable-versus-beta dependency validation when their TerraTech setup needs that distinction.

## Consequences

- The default experience is forgiving for Workshop metadata that alternates between stable and beta dependency names.
- Users can still require exact NuterraSteam dependency matching from Settings.
- Validation and dependency detail code should use the shared NuterraSteam Beta Matching policy instead of hard-coded aliases.
