# Population Pool Uses TAC RawTech Files

## Status

Accepted

Last reviewed: 2026-05-06

## Context

The Population Pool workspace will help users manage TerraTech Techs that TACtical_AI can spawn as local population candidates. TACtical_AI reads stable local population entries from its `Raw Techs/Enemies/eLocal` folder, while saved TerraTech snapshots and Steam Workshop contents live in separate locations and are not automatically TAC-compatible RawTech files.

## Decision

TTSMM-EX treats TACtical_AI's `Raw Techs/Enemies/eLocal` folder as the canonical source for stable Population Pool membership. Stable adds write only TAC-compatible RawTech entries, removals move files out of the active folder as disabled entries, and writes require confirmation when TerraTech is already running. Experimental Workshop Population Adds are stored as Workshop Population Requests in TTSMM-EX user data instead of writing guessed TAC RawTech files.

## Consequences

- The active Population Pool mirrors what TACtical_AI can actually load.
- Saved Tech snapshots and Workshop items can appear as candidates without being presented as guaranteed spawnable entries.
- Experimental Workshop requests survive in TTSMM-EX without polluting TACtical_AI's active population folder.
- Population Pool path discovery must treat the TAC local population folder, saved Tech snapshot folder, and Steam Workshop content folder as separate locations.
