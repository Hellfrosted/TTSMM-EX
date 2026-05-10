# ADR 0002: TTSMM-EX Is A Product Fork

## Status

Accepted

Last reviewed: 2026-05-01

## Context

TTSMM-EX began from `FLSoz/terratech-steam-mod-loader`, but the EX codebase now has its own app identity, architecture, workflow, validation policy, release shape, and user-data directory. The fork has diverged enough that routine merges or rebases from upstream are no longer a useful maintenance model.

Treating upstream branch status as mandatory synchronization pressure would create noisy conflict resolution and risk reintroducing implementation shapes that no longer match the EX product.

## Decision

TTSMM-EX is maintained as its own product fork. `upstream/main` is not a synchronization target for routine merge or rebase work.

The EX app identity, package names, release artifact names, and Electron user-data directory are part of the product fork boundary. Do not change them as part of dependency maintenance, upstream comparison, or packaging cleanup unless the task explicitly changes release identity.

GitHub repository naming, issue URLs, homepage metadata, and publish target metadata are hosting infrastructure, not the user-facing product identity boundary. Change them only as part of an explicit repository move or release-publishing decision.

Upstream attribution, license provenance, and inherited dependency origins should remain visible unless a specific legal, licensing, or dependency-maintenance task changes them. Product-fork identity does not mean removing the record of where the project came from.

Upstream remains useful as a source of specific patches, bug reports, behavior references, and release context. Upstream changes should be evaluated case by case and brought into EX only when they serve the EX product direction.

When an upstream change is useful, prefer a selective port reviewed against the current EX architecture. Cherry-pick only when the upstream commit is already narrow and does not drag in upstream identity, workflow, or architecture assumptions. Do not merge upstream solely to clear "behind upstream" branch status.

Upstream should be checked only for a concrete trigger, such as a user-reported bug that may already be fixed there, a TerraTech compatibility issue, a security or dependency concern, or a behavior comparison needed for an EX feature decision. Do not run scheduled upstream sync reviews.

When a triggered upstream adoption is worth pursuing, record the reason in a small issue or work note, inspect the specific upstream commit or behavior, then port the idea manually or cherry-pick a narrow commit onto an EX branch. Validate the result against EX tests and architecture before merging.

## Consequences

- Fork health is measured by EX behavior, tests, release quality, and user needs, not by ahead/behind counts against upstream.
- Upstream fixes may still be adopted, but each adoption needs an explicit reason.
- Conflict resolution happens around a chosen patch, not around broad branch synchronization.
- Repository automation should not propose upstream merge/rebase as the default maintenance action.
- The GitHub fork ahead/behind indicator is not a maintenance queue.
- Upstream adoption work follows the same review and validation expectations as importing a patch from any third-party project.
