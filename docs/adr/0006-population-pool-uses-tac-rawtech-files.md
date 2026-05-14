# Population Pool Uses TAC RawTech Files

## Status

Accepted

Last reviewed: 2026-05-06

## Context

The Population Pool workspace will help users manage TerraTech Techs that TACtical_AI can spawn as local population candidates. TACtical_AI reads stable local population entries from its `Raw Techs/Enemies/eLocal` folder, while saved TerraTech snapshots and Steam Workshop contents live in separate locations and are not automatically TAC-compatible RawTech files.

## Decision

TTSMM-EX treats TACtical_AI's `Raw Techs/Enemies/eLocal` folder as the canonical source for stable Population Pool membership. Stable adds write only TAC-compatible RawTech entries, removals move files out of the active folder as disabled entries, and writes require confirmation when TerraTech is already running. Experimental Workshop Population Adds are stored as Workshop Population Requests in TTSMM-EX user data instead of writing guessed TAC RawTech files.

Disabled Population Entries live in a TTSMM-EX-managed sibling folder named `.ttsmm-ex-disabled` next to TACtical_AI's active `eLocal` folder. For a TAC local population folder at `Raw Techs/Enemies/eLocal`, disabled files are stored at `Raw Techs/Enemies/.ttsmm-ex-disabled`. This keeps recoverable user RawTech files close to TAC's population folder while ensuring TACtical_AI does not load them as active local population entries.

When disabling an entry, TTSMM-EX preserves the original filename if possible. If that filename already exists in disabled storage, the app appends a timestamp suffix before the extension so both files remain recoverable. If disabled storage is missing, TTSMM-EX creates it during the disable operation. The app does not delete user-created Tech data as the primary removal path.

A TAC-Compatible Population Entry is a readable `.rawtech` file with non-empty TAC RawTech content. JSON RawTech files must parse to an object or array; non-JSON RawTech files must contain non-whitespace text. Saved Tech Candidates and Workshop Tech Candidates are not TAC-compatible until TTSMM-EX has actual RawTech file data from the source or a conversion result. Compatibility failures are reported as row-level or source-level status and never promote the source to an Active Population Entry.

## Consequences

- The active Population Pool mirrors what TACtical_AI can actually load.
- Saved Tech snapshots and Workshop items can appear as candidates without being presented as guaranteed spawnable entries.
- Experimental Workshop requests survive in TTSMM-EX without polluting TACtical_AI's active population folder.
- Population Pool path discovery must treat the TAC local population folder, saved Tech snapshot folder, and Steam Workshop content folder as separate locations.
