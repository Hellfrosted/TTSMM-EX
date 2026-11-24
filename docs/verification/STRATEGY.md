# Formal Verification Migration Strategy

Status: ready-for-agent

Last reviewed: 2026-11-20

> Promoted from `.scratch/formal-verification/PRD.md` during the scratch cleanup.
> This is a strategy/planning artifact, not an ADR. The repo is moving off ADRs;
> existing ADRs remain as historical record only, and new architectural direction
> is captured here and in the verification artifacts this plan creates.

## Thesis

**Stop authoring correctness evidence by hand.**

The target is not "replace unit tests with proofs." Tests are hand-authored
evidence. Proofs are hand-authored evidence. Both are expensive for the same
reason: a human writes them.

The only artifact a human should author is the **invariant catalog** — the
statement of what "correct" means. Everything else (models, proofs, property
suites, monitors, counterexamples, regression traces) is **generated and
mechanically checked**.

Formal verification is not a testing upgrade here. It is a **complexity
extermination program**: write the invariant honestly, discover that half the
states never needed to exist, and delete them. The success metric is **lines of
state removed**, not properties proved.

## Why this is possible now

Two things already exist that normally cost 70–80% of a formal-methods
engagement:

1. **An invariant taxonomy.** The retired `implicit-state-machines` analysis
   catalogued 37 implicit machines and 24 invariants. Its vocabulary is
   preserved below; it must be reconstructed into the canonical
   `docs/verification/INVARIANTS.md` as Phase 0 of this plan.
2. **The policy/adapter split.** The former collection-draft and
   inventory-expansion ADRs declared the two central workflows pure modules that
   own state and return effect requests. The reducer in
   [`src/renderer/collection-workspace-session.ts`](../../src/renderer/collection-workspace-session.ts)
   and the ledger machine in
   [`src/main/workshop-inventory-expansion-state.ts`](../../src/main/workshop-inventory-expansion-state.ts)
   are genuine transition systems, not piles of callbacks. The source files are
   the durable evidence; the ADR documents themselves have been retired.

A third factor is new: generating models and proofs is now cheap enough that the
checker, not the proof author, can be the trusted element. Humans write
invariants and review counterexamples; machines write proofs.

### Invariant vocabulary (I1–I10)

| ID | Class | Meaning |
|---|---|---|
| I1 | Referential integrity | Every named thing resolves to something that exists |
| I2 | Uniqueness | One logical entity, one identity |
| I3 | Liveness / progress | Every loop or wait terminates or reports |
| I4 | Exactly-once settlement | Every intent ends in exactly one terminal outcome |
| I5 | Freshness | A cached decision's key covers every input that can change it |
| I6 | Serialization / ordering | Concurrent writers cannot interleave destructively |
| I7 | Atomicity / recoverability | A crash leaves a state the app can recover from |
| I8 | Single writer | Exactly one owner per mutable fact |
| I9 | Boundedness | Every wait has a timeout, every loop a cap |
| I10 | Totality | No path silently discards an item, error, or request |

## Principles (non-negotiable)

1. **Universal evidence, not sampled evidence.** A test is an existential claim
   ("here is a case that works"). A proof is a universal claim ("there is no case
   in this model that fails"). A test suite samples an effectively infinite
   trajectory space; a model checker explores all of it.
2. **The unit of design is the invariant, not the function.** Organize work
   around what must always be true, not around files or call graphs.
3. **Verify the reaction, not the world.** Steam may return garbage; callbacks
   may fire late, twice, or never. You cannot prove the world is kind. You can
   prove that for every possible world the system settles exactly once, never
   spins, never double-launches, and never loses a draft.
4. **Make illegal states unrepresentable before proving anything.** The compiler
   is the cheapest prover available. Types shrink the state space that every
   higher layer must explore.
5. **Correctness evidence is generated, not authored.** A human writes the
   invariant catalog and reviews counterexamples. Everything else is derived.
6. **Deletion is the metric.** After honest specs, more code should disappear
   than gets annotated.
7. **No invariant, no merge.** Verification is a merge condition, not a phase.

## The six bold calls

### 1. Delete the unit-test suite in one commit

Not phased. Not "as each module achieves verified status."

A unit test encodes *current behavior as expected behavior*. When the inverted
ignore rule existed, its test asserted the inverted result and passed. The suite
is not a neutral safety net — it is a **ratchet that resists correction**.
Gradual migration maintains two sources of truth, one of which actively encodes
the old buggy contract. Every fix becomes a two-front war.

Delete `src/__tests__/` wholesale. Replace it with generated trace conformance.
Keep only UI smoke, native integration, and benchmarks — those verify the
*world*, not policy.

### 2. Make TypeScript a rendering DSL, not the source of truth

The invariant-bearing core should be written in a language with a real proof
kernel: **Dafny or F★**, both of which have JavaScript backends. The extracted JS
is generated and never hand-edited. TypeScript remains the shell language.

TypeScript's type system is erased, unsound by design, and full of escape
hatches. It cannot prove acyclicity or settlement. Stop asking it to.

### 3. Build a verified kernel surrounded by a stateless shell

```
src/kernel/                       source of truth, ~1000–1500 LOC
  machine.dfy / machine.fst       state, events, effects, invariants, proofs
  generated/machine.js            extracted; never hand-edited

src/shell/                        stateless adapters; no invariants to violate
  ipc.ts        Schema decode -> Event; Effect -> command
  steam.ts      callback -> Event (timeout -> Settled)
  react.ts      renders State, dispatches Event; holds NO domain state
```

The shell has no `useState` for domain facts, no module-level pending-key sets,
and no five writers for `launchingGame`. It cannot violate an invariant because
it **holds no state**. The five-writers problem disappears by deletion of the
writable surface, not by discipline.

### 4. Make the app event-sourced; let production be the oracle

The kernel is a pure function `State × Event → State × Effect[]`. Every external
interaction — Steam callback, IPC call, timer tick, click — becomes an Event in
a log. Consequences:

- Any production session is a replayable trace.
- Historical production traces become the CI test corpus, not hand-picked
  examples.
- A reality/spec mismatch yields a concrete counterexample from a real session
  instead of a three-step bug report.
- Emit abstract events in production builds. Runtime spec violations are
  telemetry. The deployed app continuously proves itself against its own model.

### 5. Replace hand-written proofs with machine-generated proofs

Formal methods historically lost on specification cost. That constraint is
gone. Generate TLA+/Dafny models, proof obligations, arbitraries, and trace
generators from the invariant catalog; let the checker be the trusted kernel
that discards bad proofs. Humans author invariants and review counterexamples.

Invest in the checker, the catalog, and the replay pipeline — not in teaching
TLA+ to the team.

### 6. Replace the quality gate

Remove `test` from `validate` in `package.json`. `pnpm verify` is the only
blocking gate, asking three mechanical questions per PR:

1. Does every new state have a named invariant and exactly one owner?
2. Does the model checker still find no counterexample when replaying all
   historical traces?
3. Did the PR delete at least as much state as it added?

Quality metrics become **invariant coverage**, **replay pass rate**, and **lines
deleted**. Test count and line coverage are retired.

## Target artifact layout

```
docs/verification/
  INVARIANTS.md               canonical catalog (I1..I10) — Phase 0
  STRATEGY.md                 this document
  models/
    launch-after-save.tla
    workspace-workflow.tla
    lifecycle-journal.tla
    paging-liveness.tla
    validation-purity.dfy
scripts/
  run-verify.ts               typecheck + tlc + prover + properties + replay
src/__properties__/           generated arbitraries / executable specs
src/__traces__/               generated counterexamples and model traces
native/block-lookup-extractor/src/kani/   Rust proof harnesses
```

## Tooling rationale

| Need | Tool | Why |
|---|---|---|
| Workflow safety + liveness | TLA+ / PlusCal + TLC | Exhaustive exploration; concrete counterexample traces; `<>` liveness |
| Structural / identity invariants | Alloy | Relational logic; ideal for "is there any state where X names no file?" |
| Pure-function proofs, JS extraction | Dafny or F★ | Real proof kernel with JavaScript backend |
| Executable spec on-ramp | `fast-check` + Effect Schema arbitraries | Cheap invariant discovery; bounded, not proof |
| Rust sidecar | Kani | Small, pure, bounded, existing toolchain — cleanest true-proof target |
| Boundary contracts | Effect Schema + `Effect.acquireRelease` + `Settled<T>` | Already in the stack |

The 872-line Rust extractor is the lowest-friction true machine-checked proof
target in the repo. Start proof work there in parallel with the kernel rewrite.

## Migration

The test suite is the only big-bang step. Everything else is ordered by
leverage.

| Phase | Work | Exit condition |
|---|---|---|
| 0 | Reconstruct `docs/verification/INVARIANTS.md` from the taxonomy above; add `pnpm verify` skeleton; emit abstract events | Catalog canonical; gate script exists |
| 1 | Rewrite the launch/save machine as a Dafny/F★ function with settlement invariants; extract to JS; wire as sole launch-state owner; delete `src/__tests__/` in one commit; add replay harness | One vertical slice proven; no hand-authored tests remain |
| 2 | Types-as-proofs sweep: `LaunchState`, `DraftState`, `Settled<T>`, `CollectionId`, `ConfigDocument{revision}` | Zero multi-writer booleans; identity by id, never name |
| 3 | Property and proof suites for pure derivations; Kani harnesses for the Rust sidecar; Alloy for identity invariants | Core derivations carry proofs; sidecar harnesses pass |
| 4 | Flip CI: `verify` blocking, smoke informational; retire the old gate | Quality metrics reported from the new gate |
| 5 | Merge rule: every new state needs a named invariant and owner | Durable culture change |

Phase 1 is the proof-of-concept of proof. Let the model checker rediscover the
launch lock before the fix lands. If it does, the method is validated and the
rest of the rollout has evidence behind it.

## Honest limits

- Empirical properties stay empirical: rendering, layout, Electron window
  behavior, Steamworks native behavior, filesystem, OS dialogs, performance.
  Verify reactions; smoke-test integrations.
- Specification risk is real: you can prove the wrong property. Specs need
  review, mutation testing, and counterexample review exactly like code.
- Models are bounded. Abstract data domains; keep control flow exact.
- There is no free universal claim. The cost is paid in invariant authoring and
  disciplined state deletion.

## First artifacts

1. Delete `src/__tests__/` in one commit.
2. Rewrite the launch/save machine proof-first; extract to JS; make it the sole
   owner of launch state.
3. Add production event emission and a replay harness.
4. Add `pnpm verify` as the only blocking CI gate; remove `test` from `validate`.
5. Publish invariant coverage and lines deleted; retire test-count metrics.
