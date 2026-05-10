Status: ready-for-agent

# Prove Effect Bundles In Electron Main

## What to build

Prove that Effect can be adopted in TTSMM-EX's Electron main-process build without changing app behavior. The slice should establish that a minimal main-process Effect import typechecks, builds, and is bundled correctly into the packaged CommonJS main output rather than left as an unresolved runtime dependency.

This is a packaging gate for later migration work. It should use the stable top-level Effect APIs only and avoid `effect/unstable/*`.

## Acceptance criteria

- [ ] The root app can import and typecheck a minimal top-level Effect API from the main-process build path.
- [ ] The production build succeeds with the Effect import included.
- [ ] The built Electron main output does not rely on an external `require("effect")` that would be missing from the release app dependencies.
- [ ] No user-visible behavior changes are introduced.
- [ ] The smallest relevant validation command is recorded in the issue comments before handoff or merge.

## Blocked by

None - can start immediately
