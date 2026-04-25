# Stack Refactor Plan

Last updated: 2026-04-25

## Problem Statement

The current stack is mostly well matched to TTSMM-EX: Electron, React, TypeScript, Vite, Vitest, Zod, Zustand, TanStack Table, TanStack Virtual, and electron-builder are all justified by the product's desktop mod-management requirements.

The friction is in the supporting tool choices and the way several modules have grown:

- Tailwind is installed but is not yet the dominant UI styling system.
- React Query is installed but is only lightly used, so async renderer state lacks one canonical interface.
- Formatting and linting are split across several overlapping tools.
- Electron security posture is good in important places, but production CSP and IPC sender validation need to be tightened.
- Several renderer modules are large enough that related behavior has weak locality, even though behavior tests already exist.
- Patch and minor dependency updates are available and should be folded in after the stack direction is settled.

The goal is to resolve these findings without changing product behavior, data formats, Steamworks contracts, packaging identity, or the View stage fill contract.

## Solution

Use one umbrella refactor broken into tiny, working commits.

The stack direction is:

- Standardize more UI on Tailwind while preserving the app's utilitarian desktop design.
- Promote React Query as the canonical renderer async/cache layer.
- Expand Biome so it owns formatting and primary linting.
- Harden Electron security by splitting development and production CSP behavior and adding a shared IPC sender validation interface.
- Deepen the largest renderer modules by extracting focused modules around table interaction, details rendering, collection workflow state, and async operations.
- Include patch and minor dependency updates once the toolchain changes are stable.

Each commit should leave `npm run validate` passing unless the commit is explicitly a red test commit immediately followed by the implementation commit.

## Commits

1. Record the current baseline.
   Run the canonical validation command and capture the current passing state in the work notes. Do not change source code.

2. Add dependency freshness notes.
   Capture the current patch and minor upgrade candidates and classify major upgrades as deferred. Keep this as planning context only.

3. Enable Biome formatting in dry-run mode.
   Update Biome configuration so formatting is configured but do not reformat files yet. Keep ESLint and Prettier scripts unchanged in this commit.

4. Add a Biome check script.
   Add a script that runs Biome's formatter and linter checks together without modifying files. Keep the existing validation command passing.

5. Reformat only low-risk configuration files with Biome.
   Apply Biome formatting to JSON and JSONC config files first. Verify the diff is mechanical.

6. Reformat TypeScript and TSX files with Biome.
   Apply Biome formatting to source and test files in one mechanical commit. Do not mix behavior changes into this commit.

7. Switch validation to Biome check for formatter and primary lint coverage.
   Make Biome the default formatting and primary lint check in the validation chain.

8. Remove Prettier ownership.
   Remove Prettier scripts/configuration where Biome fully replaces them. Keep any package metadata changes mechanical.

9. Reassess ESLint coverage after Biome ownership.
   Decide whether any remaining ESLint rules still provide coverage Biome does not provide. If retained, narrow ESLint to those supplemental checks and document why. If not retained, remove ESLint and its plugins.

10. Add a production CSP test.
    Add behavior coverage that proves production renderer HTML does not allow inline scripts and still permits required app resources.

11. Split CSP construction into a named module.
    Move CSP construction behind a small interface that can produce development and production policy strings.

12. Wire the renderer HTML to the CSP module.
    Ensure development keeps the minimum permissions needed for Vite and local assets while production uses the stricter policy.

13. Add IPC sender validation tests.
    Add tests for accepted app-origin IPC calls and rejected unexpected origins or missing frame metadata.

14. Add a shared IPC sender guard.
    Create one interface used by IPC handlers to validate sender origin before payload parsing or side effects.

15. Apply the IPC sender guard to read-only handlers.
    Start with handlers that only read state or return status. Keep behavior unchanged for legitimate renderer calls.

16. Apply the IPC sender guard to filesystem and config write handlers.
    Guard collection, config, path, and block lookup write operations through the same interface.

17. Apply the IPC sender guard to Steamworks and game action handlers.
    Guard subscribe, unsubscribe, download, launch, and external-open actions.

18. Verify IPC error behavior.
    Ensure rejected IPC calls return clear errors and do not perform partial side effects.

19. Introduce renderer query key conventions.
    Add a small renderer async/cache module that owns query keys and naming conventions.

20. Wrap existing Block Lookup query usage in the new query interface.
    Preserve behavior while moving raw query keys and cache writes behind the canonical interface.

21. Promote config loading to React Query.
    Move renderer config reads and writes behind query and mutation interfaces while preserving current startup behavior.

22. Promote collection list and collection reads to React Query.
    Cache collection list and collection reads through the canonical query layer.

23. Promote collection mutations to React Query.
    Convert create, rename, duplicate, delete, and save flows to mutations that invalidate the relevant collection queries.

24. Promote mod metadata loading to React Query.
    Move metadata refresh and reload behavior behind the query layer while preserving progress events.

25. Promote game running status to React Query.
    Replace ad hoc polling or local async status handling with a named query interface.

26. Normalize notification behavior around query mutations.
    Ensure query/mutation errors still produce the same user-visible notifications as before.

27. Add React Query behavior tests around config and collections.
    Test external behavior: loading state, success state, mutation invalidation, and error notification.

28. Add React Query behavior tests around mod refresh.
    Test that refresh requests invalidate or refetch the right data without changing the user's active collection.

29. Add a Tailwind usage convention note.
    Record how Tailwind should be used in this app: utility-first for layout, spacing, typography, state styling, and simple controls; custom CSS only for complex measured table behavior, Electron-specific surfaces, and reusable design tokens.

30. Map app design tokens into Tailwind theme values.
    Ensure Tailwind utilities consume the existing app color, radius, and typography variables.

31. Convert small shared UI primitives to Tailwind.
    Start with buttons, icon buttons, labels, empty states, and loading primitives. Preserve class names only where tests or complex CSS depend on them.

32. Convert startup/loading screens to Tailwind.
    Migrate the startup cards, progress states, and callouts while preserving copy and layout behavior.

33. Convert notification UI to Tailwind.
    Keep the notification API unchanged while replacing most bespoke CSS with Tailwind utilities.

34. Convert settings form layout to Tailwind.
    Preserve form behavior, validation, keyboard navigation, and desktop density.

35. Convert collection management modal UI to Tailwind.
    Preserve React Hook Form behavior, modal accessibility, and table-layout settings behavior.

36. Convert Block Lookup shell UI to Tailwind.
    Migrate the header, toolbar, path bar, status area, and details pane first. Do not change table virtualization internals in this commit.

37. Convert Collection view shell UI to Tailwind.
    Migrate the header, footer, split-pane shell, and high-level workspace layout while preserving the View stage fill contract.

38. Leave virtualized table internals on custom CSS until extracted.
    Keep measured column widths, virtual rows, resize handles, and table-specific layout CSS in custom CSS for now.

39. Remove obsolete CSS after each Tailwind migration group.
    Delete dead CSS selectors only after tests and manual inspection show no remaining usage.

40. Add visual regression checkpoints for migrated UI.
    For each migrated view group, capture or manually verify the rendered desktop minimum window and default window size.

41. Extract main collection table sizing logic.
    Move sizing and measurement behavior behind a focused interface. Preserve the existing table API and tests.

42. Extract main collection row presentation.
    Move row cell rendering and per-row status presentation into a focused module. Keep the parent table responsible for data flow and virtualization.

43. Extract main collection header interactions.
    Move sorting, column resize, column menu, and drag/drop concerns into a focused table header module.

44. Extract Block Lookup table sizing and column behavior.
    Mirror the main collection table structure where useful. Keep query behavior and rendering behavior unchanged.

45. Extract Block Lookup search workflow.
    Move search, build-index, bootstrap, and settings persistence workflow behind a focused interface that uses React Query.

46. Extract mod details dependency panels.
    Move dependency table and dependency actions into a focused details module.

47. Extract mod details preview and identity presentation.
    Move preview image, identity labels, update/download states, and copy/open actions into focused presentation modules.

48. Extract collection lifecycle command handlers.
    Reduce the collection hook by moving create, duplicate, rename, delete, save, and selection commands into named workflow modules that call React Query mutations.

49. Re-run focused renderer tests after each extraction.
    Keep existing behavior tests passing after every extraction commit.

50. Update test helpers for React Query and Tailwind conventions.
    Add shared render helpers for query provider setup and any stable class-independent UI assertions.

51. Perform patch and minor dependency updates.
    Update patch and minor versions for the current stack after the refactors have settled. Do not include major upgrades.

52. Rebuild lockfile and verify dependency tree.
    Refresh the lockfile, run dependency listing, and confirm no unexpected duplicate core packages were introduced.

53. Run security and validation checks.
    Run audit, lint/check, dead code check, typecheck, tests, and build.

54. Run packaged-app smoke checks where practical.
    Verify the app starts, the renderer loads, Steamworks startup behavior is unchanged, and key desktop workflows remain reachable.

55. Update README script documentation.
    Update the documented scripts to match the new Biome, validation, and stack conventions.

56. Update product/developer notes only where behavior changed.
    Do not add broad architecture prose unless it documents a decision future work needs to preserve.

## Decision Document

- Tailwind will become a primary UI styling tool rather than a mostly-installed dependency.
- Existing design language remains: dense, utilitarian, desktop-first, and management-oriented.
- Custom CSS remains acceptable for complex virtualized table measurement, Electron shell constraints, and durable design tokens.
- React Query becomes the canonical renderer interface for async reads, async writes, cache invalidation, loading state, and error state.
- Zustand remains appropriate for local client state that is not server-like or IPC-backed.
- Biome becomes the owner for formatting and primary linting.
- Prettier should be removed once Biome formatting is active.
- ESLint should either be removed or reduced to a clearly supplemental role only if it covers rules Biome cannot cover.
- IPC payload validation remains Zod-based.
- IPC sender validation becomes a shared interface that all handlers use before parsing payloads or performing side effects.
- Production CSP should be stricter than development CSP.
- The app remains Electron-based; no Tauri migration is part of this plan.
- Patch and minor dependency updates are included.
- Major upgrades are deferred to a separate maintenance effort.
- No schema, collection file format, app identity, Steamworks contract, or packaging identity changes are intended.
- The View stage fill contract remains load-bearing and must be preserved.

## Testing Decisions

Good tests for this refactor assert external behavior rather than implementation details. Tests should not assert that a particular hook, cache key, CSS utility, or internal component exists unless that interface is intentionally public inside the codebase.

Test coverage should include:

- CSP generation behavior for development and production.
- IPC sender validation for accepted and rejected senders.
- Existing IPC payload validation behavior.
- Existing external URL allowlist behavior.
- Query-backed config loading, collection loading, collection mutation, metadata refresh, and game status behavior.
- User-visible loading, success, and error states after React Query migration.
- Main collection table sorting, selection, resizing, accessibility labels, and virtualization behavior.
- Block Lookup search, build-index, result selection, settings persistence, column behavior, and copy actions.
- Settings form validation and save behavior.
- Mod details dependency and preview behavior.
- View stage fill contract behavior.

Prior test examples already exist for:

- Block Lookup renderer behavior.
- Main collection table behavior.
- Mod details footer behavior.
- Collection lifecycle hook behavior.
- Collection IPC validation.
- Config IPC validation.
- External URL allowlisting.
- Window helper behavior.

Validation checkpoints:

- Run focused tests after each extraction or migration group.
- Run the full canonical validation after each phase.
- Run audit after dependency updates.
- Use rendered UI inspection for Tailwind migration groups where practical.

## Out of Scope

- Replacing Electron with Tauri or another desktop runtime.
- Replacing React with another renderer framework.
- Replacing TanStack Table or TanStack Virtual.
- Replacing Zustand for local UI state.
- Replacing Zod for IPC payload validation.
- Redesigning the product visually beyond standardizing implementation on Tailwind.
- Changing collection JSON schema or migration behavior.
- Changing Steamworks native integration contracts.
- Changing app identity, user data directory, package targets, or release publishing provider.
- Major dependency upgrades.
- New product features.
- Broad mobile-responsive redesign.

## Further Notes

This plan is intentionally broader than a normal refactor because it resolves stack-level findings together. The implementation should still proceed in small commits. If a phase starts producing behavior changes or large review diffs, split that phase into a separate local plan before continuing.

## Current Progress

- Completed through commit 25: renderer config, collection reads, collection mutations, mod metadata scans, and game-running status now use the canonical React Query cache layer.
- Completed React Query follow-up coverage through commit 28: user-visible collection mutation errors, config and collection cache behavior, and forced mod metadata refresh behavior are covered.
- Active Tailwind phase: commits 29-36 have established Tailwind conventions, mapped app tokens, converted shared loading primitives, migrated startup/loading screens, converted notification UI, migrated settings form layout, converted collection management modal UI, and converted the Block Lookup shell UI. Next up is commit 37: Collection view shell UI.

## Work Notes

- 2026-04-25 baseline: `npm run validate` passed. ESLint passed, Biome lint checked 189 files, Knip passed, TypeScript build passed, Vitest passed 48 files / 249 tests, and `electron-vite build` completed for main, preload, and renderer.
- 2026-04-25 dependency freshness: `npm outdated --long` reported patch/minor candidates for `@electron/rebuild`, `@tanstack/react-query`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `axios`, `electron`, `eslint-plugin-react-hooks`, `knip`, `lucide-react`, `prettier`, `react`, `react-dom`, `react-router-dom`, `typescript`, and `vitest`; deferred majors include `@eslint/js`, `@types/node`, `@vitejs/plugin-react`, `electron-vite`, `eslint`, `globals`, and `vite`.
- 2026-04-25 ESLint reassessment: retained ESLint as supplemental coverage for React Hooks, JSX accessibility, Promise rules, the local restricted-import guard, and `@typescript-eslint/no-explicit-any`. Biome owns formatting and primary lint/check coverage.
- 2026-04-25 CSP split: renderer CSP construction moved behind `createRendererContentSecurityPolicy`; Vite injects development policy during `serve` and production policy during `build`. `npm run validate` passed with 49 test files / 252 tests.
- 2026-04-25 IPC sender validation: added shared IPC sender validation, covered accepted app-origin senders plus rejected unexpected origins/missing frame metadata, and applied the guard to every registered IPC handler before payload parsing or side effects. `npm run validate` passed with 50 test files / 259 tests.
- 2026-04-25 renderer query conventions: added `renderer/async-cache.ts` for canonical query keys and Block Lookup cache helpers; Block Lookup no longer owns raw query keys or direct search invalidation keys.
- 2026-04-25 renderer async cache expansion: config reads/writes, startup collection reads, collection mutations, mod metadata scans, and game-running polling now go through `renderer/async-cache.ts` query options or mutation hooks. `npm run validate` passed after each committed phase with 50 test files / 259 tests.
- 2026-04-25 React Query follow-up coverage: added behavior coverage for collection mutation error notifications, config and collection query cache effects, and forced mod metadata refresh. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind loading fallback: `ViewStageLoadingFallback` now uses Tailwind utilities backed by the app theme tokens, and its obsolete custom CSS selectors were removed. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind startup primitives: `StartupProgressBar`, `StartupStatusIcon`, and `StartupButton` now use Tailwind utilities while preserving existing progress semantics, disabled/loading states, and spinner timing. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind callout primitives: added a shared `StatusCallout` utility component and startup-only action/error wrappers, then removed the old callout and startup action CSS selectors. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind startup shell: config loading, mod loading, and Steamworks verification now share Tailwind-backed startup shell, card, hero, intro, and status primitives; obsolete startup shell CSS and responsive overrides were removed. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind notification UI: `NotificationViewport` now owns placement, tone, body, action, and close-button styling through Tailwind utilities while preserving the notification event API and custom `className` passthrough. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings controls: settings buttons and text inputs now use Tailwind utilities while preserving grouped path-control class hooks and the `.SettingsView` fill-contract CSS. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings dialog: `SettingsDialog` overlay, panel, header, body, footer, and title styling now use Tailwind utilities while preserving Escape and backdrop-close behavior. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings fields: `SettingsField` now owns label, required-marker, body, helper, error, spacing, and responsive single-column layout through Tailwind utilities; obsolete field CSS selectors were removed. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings selects: added a typed `SettingsSelect` wrapper for app and logger log-level selectors, moving select sizing, focus, and logger-level flex behavior to Tailwind utilities. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings switches: close-on-launch and pure-vanilla checkboxes now use a typed `SettingsSwitch` wrapper with Tailwind pseudo-element utilities for track, thumb, focus, checked, and transition states. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings disclosure: the logging overrides disclosure summary, body, and add-action row now use Tailwind utilities while preserving the controlled open state. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings shell: the settings page shell, header, intro, form margins, pane grid/cards, responsive pane stacking, and save/reset action row now use Tailwind utilities while preserving the `.SettingsView` fill-contract CSS. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind settings grouped controls: path pickers, workshop ID controls, and logger override rows now use Tailwind utilities through `SettingsInlineControls`; obsolete grouped-control CSS hooks were removed. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind collection manager modal: `CollectionManagerModal` now owns its modal shell, validation list, table settings controls, override form, and native modal button/input/switch primitives through Tailwind utilities; unused CollectionManager-only CSS hooks were removed while shared Block Lookup modal CSS stayed in place. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind collection naming modal: the collection create/duplicate/rename modal overlay, panel, form field, validation copy, actions, focus states, and loading spinner now use Tailwind utilities; obsolete `CollectionNamingModal*` CSS selectors were removed. `npm run validate` passed with 51 test files / 268 tests.
- 2026-04-25 Tailwind Block Lookup shell: the Block Lookup header, search/path bars, actions, status line, details pane, and local button/input/switch primitives now use Tailwind utilities while preserving virtual table internals and `.BlockLookupViewLayout` fill-contract CSS. `npm run validate` passed with 51 test files / 268 tests.
