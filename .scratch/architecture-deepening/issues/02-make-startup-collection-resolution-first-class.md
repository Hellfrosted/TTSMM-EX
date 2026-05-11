Status: resolved

Triage: enhancement, resolved in this workspace.

Resolution: `src/main/startup-collection-resolution.ts` exposes first-class startup collection resolution and delegates repair policy through the main-process active collection transition module. Existing tests cover valid startup, missing active collection repair, default creation, collection read failure, and config repair failure.

# Make Startup Collection Resolution First Class

## What to build

Make Startup Collection Resolution a first-class Module with a clear Interface: given the loaded config and saved collections, return repaired startup collection authority.

The implementation should preserve ADR 0001 by keeping startup repair decisions in the main process while making the startup policy testable without reading unrelated lifecycle command branches.

## Acceptance criteria

- [x] Startup keeps a valid configured Active Collection when it exists.
- [x] Startup repairs a missing or invalid Active Collection by selecting a saved collection when possible.
- [x] Startup creates and activates the default collection when no saved collections exist.
- [x] Tests cover collection read failure and config repair failure.
- [x] Renderer startup code remains responsible for applying returned state, not deciding repair policy.

## Blocked by

- 01-deepen-collection-lifecycle-transaction-handling.md
