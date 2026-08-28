# Evidence Semantics Pass — Design

Date: 2026-08-28
Status: approved for implementation

## Purpose

One coherent change to the question *what does a piece of evidence mean*. Four
semantic additions, three simplifications, and the seed and demo content that
proves them.

Everything here answers that one question, and everything here touches the seed,
so it lands as one migration pair rather than four migrations each rewriting
`objectives.ts`.

## Out of scope

Deferred deliberately. Do not let these in:

- Release and compiler integrity (duplicate revision per release, membership
  endpoint containment, capability-set cross-release leak, atomic role
  compilation, the full role publication validator). Next pass.
- Structural readiness scoring. `learner_role_state.readiness_score` stays a
  flat met/total ratio in this pass, wrong as it is.
- Versioned mastery policies, the formal qualification decision record, richer
  human verification, external framework crosswalk, frontier prerequisite
  expansion, proxy-as-projection refactor.
- Actual assistance capture (see §4).

The only exception is the assurance slice of role validation, which §5 requires.

## Baseline

Verified before any change, on this machine:

- `pnpm db:reset` runs clean: 29 domains, 343 competencies, 39 objectives,
  5 capability sets, SWE L3 compiled to 35 frozen requirements, release published.
- `pnpm --filter @lighthouse/db db:demo` runs the full §25 scenario: proxy
  propagation fires, lineage traces, direct-vs-proxy policy discrimination works.
- `pnpm lint` and `pnpm check-types` clean.
- Zero tests exist. `turbo.json` declares a `test` task no package implements.

The 55-line demo output is captured as a regression baseline.

## Migration strategy

Additive migrations, not a squash. `0001_governance_triggers.sql` is hand-written
SQL; squashing means regenerating `0000` and reconciling triggers by hand against
a changed baseline, which is where the risk lives. `db:reset` drops the volume,
so a clean local rebuild costs nothing.

Two migrations:

- `0003_evidence_semantics.sql` — drizzle-generated DDL.
- `0004_evidence_semantics_governance.sql` — hand-written: the canonicalization
  function, the effective-ceiling trigger, and immutability guards for the new
  objective-revision child tables.

---

## §1 Context dimensions

### Tables

```
catalog.context_dimension
    code               text PK
    name               text
    description        text
    active             boolean default true

catalog.context_value
    id                 uuid PK
    dimension_code     text -> context_dimension.code
    code               text
    name               text
    description        text
    parent_value_id    uuid -> context_value.id  (nullable, self)
    UNIQUE (dimension_code, code)
    CHECK parent_value_id <> id
```

`parent_value_id` carries a precise meaning, and it is not "sensible taxonomy
grouping":

> **Evidence gathered at the child value is valid evidence for the parent value.**

`aws_govcloud`'s parent is `aws` because demonstrating something in GovCloud
demonstrates it on AWS. A hierarchy built on any other principle will produce
wrong qualification decisions. Document this on the table.

A parent chain must stay within one dimension, and must be acyclic. Both enforced
in `0004`.

### Objective-side policy

```
catalog.objective_context_policy
    objective_revision_id  uuid -> learning_objective_revision.id
    dimension_code         text -> context_dimension.code
    policy                 enum (required | optional | not_applicable)
    minimum_distinct_values integer not null default 1
    PRIMARY KEY (objective_revision_id, dimension_code)
    CHECK (policy = 'required' OR minimum_distinct_values = 1)

catalog.objective_context_allowed_value
    objective_revision_id, dimension_code, context_value_id
    -- optional whitelist; absence means any value of the dimension
```

`minimum_distinct_values` is future-proofing bought cheaply now. It stays 1 for
essentially every objective, but it leaves room for an L4 objective like *adapt a
cloud architecture across providers* to declare `cloud_provider required,
minimum_distinct_values = 2` without a later model replacement.

It is **not** part of assertion identity. An assertion is always scoped to exactly
one value tuple. `minimum_distinct_values` is evaluated at requirement
satisfaction time, by counting distinct qualifying values across a learner's
assertions for that objective. Write this down where the evaluator lives.

Objective-level only in this pass; roles cannot tighten it (pinning a specific
value and demanding two distinct values are contradictory asks).

### Evidence and delivery side

```
evidence.observation_context
    observation_id     uuid -> observation.id
    dimension_code     text
    context_value_id   uuid -> context_value.id
    PRIMARY KEY (observation_id, dimension_code)

assessment.task_variant_context
    task_variant_id, dimension_code, context_value_id
    -- the context the variant actually delivers
```

The observation is authoritative. `task_variant_context` supplies the default
when recording, and is the authoring statement of what a variant exercises.

### Role side

```
qualification.objective_requirement_context
    objective_requirement_id  uuid -> objective_requirement.id
    dimension_code            text
    context_value_id          uuid -> context_value.id
    PRIMARY KEY (objective_requirement_id, dimension_code)
```

### The required-dimensions-only rule

Approved and load-bearing:

> Only dimensions an objective declares `required` participate in assertion
> scope, and a role requirement may only pin a dimension the objective declares
> `required`.

The invariant this buys:

- The objective defines which contexts materially change the capability claim.
- A role may narrow those contexts.
- A role may never silently introduce a new semantic dimension.

If BESPIN wants to require `aws_govcloud` for *deploy and operate a cloud-hosted
application*, then `cloud_provider` must be a required dimension of that
objective. `optional` dimensions are recorded on observations as descriptive
metadata and nothing more.

Enforced at role compile time: pinning a non-required dimension is a compile
error.

### Assertion representation

`learner.objective_assertion` gains a surrogate key and structured context:

```
learner.objective_assertion
    id                     uuid PK              (new)
    learner_id             uuid
    objective_revision_id  uuid
    context_key            text not null        (new; '' when no required dims)
    state, confidence, last_direct_evidence_at, last_any_evidence_at,
    inference_model_version, calculated_at
    UNIQUE (learner_id, objective_revision_id, context_key)

learner.objective_assertion_context                            (new)
    assertion_id       uuid -> objective_assertion.id
    dimension_code     text
    context_value_id   uuid -> context_value.id
    PRIMARY KEY (assertion_id, dimension_code)
```

`learner.assertion_evidence` repoints to `assertion_id` instead of the old
composite `(learner_id, objective_revision_id)` FK.

**`context_key` is a fingerprint, nothing more.** It exists so uniqueness is a
single index instead of a subquery. It is human-readable, which helps in logs.

> **Invariant: `context_key` defines assertion identity. It must never define
> qualification matching.**

Qualification evaluates the structured `objective_assertion_context` rows through
the value closure. It never compares key strings. The composite key makes the
string-comparison implementation tempting and wrong: an assertion keyed
`cloud_provider=aws_govcloud` satisfies a requirement for `cloud_provider=aws`,
and those strings differ.

### Canonicalization

Sorted by dimension code, `dimension_code=value_code` pairs joined by `;`, empty
string when the objective declares no required dimensions. Value **codes**, not
ids — readable and stable across reseeds, with referential integrity carried by
`objective_assertion_context`.

The database function is authoritative:
`governance.canonical_context_key(jsonb) returns text`, defined in `0004`. A TS
helper may mirror it for previews and for building query predicates, but the DB
function is the source of truth and the one used when writing assertions.

### Required-dimension completeness

If an objective requires `cloud_provider` and `programming_language`, and an
observation carries only `cloud_provider=aws`, the observation is recorded — it
happened — but it **must not create or update a `demonstrated` assertion** for
that objective. Recalculation groups observations by their full required-dimension
tuple and skips groups that are incomplete, recording the reason.

Without this rule the system manufactures improperly scoped assertions.

### Ancestor matching

Never normalize a value upward at write time. GovCloud evidence keys as
`cloud_provider=aws_govcloud`. Matching happens at evaluation:

```
assertion contexts -> context value closure -> requirement matcher
```

A requirement for value V is satisfied by an assertion whose value is V or any
descendant of V. Implemented as a recursive CTE over `parent_value_id`. A
`projection.context_value_closure` table is the escape hatch if it ever gets hot;
not needed at this scale.

---

## §2 First-class objective criteria

The missing middle layer. Context says *where* capability was demonstrated;
criteria say *what exactly* was demonstrated. Today an objective carries an
anonymous `success_criteria` jsonb array and a separate `critical_errors` jsonb
array, while proxy implication rules refer to *task-local* observable codes. That
is backwards: the stable thing is the objective's criterion, not the assessment's
observable name.

### The criterion table

```
catalog.objective_criterion
    id                     uuid PK
    objective_revision_id  uuid -> learning_objective_revision.id
    code                   text
    statement              text
    kind                   enum (success | quality | verification | process | critical_error)
    severity               enum (limiting | blocking)   nullable
    sort_order             integer
    UNIQUE (objective_revision_id, code)
    CHECK (kind = 'critical_error') = (severity IS NOT NULL)
```

`code` is **stable within the objective's lineage**, not just within the revision.
That is what later lets `objective_revision_transition` say "criteria unchanged →
`evidence_carries_forward`". The rows belong to the revision — the criterion set
is part of what a revision claims — but the codes persist across revisions of the
same objective.

Both `learning_objective_revision.success_criteria` and `.critical_errors` are
dropped. All 39 seeded objectives are rewritten.

### Critical errors are criteria, not a separate concept

Structuring positive criteria while leaving disqualifying conditions as an opaque
blob would create an asymmetric evidence model on day one:

```
what must go right                 structured
what absolutely must not happen    JSON blob
```

The negative conditions are frequently the more consequential half. For
`RUST-NET-L3-001`:

```
preserve-incomplete-data      kind = success
arbitrary-read-boundaries     kind = success
handles-eof                   kind = success
no-data-loss                  kind = critical_error   severity = blocking
```

A learner who satisfies all three success criteria but loses bytes under one
condition must not establish the capability. `severity = blocking` disqualifies;
`limiting` caps rather than disqualifies (reserved — no evaluator behavior beyond
disqualification in this pass, but the distinction is authorable).

### Observable ↔ criterion is many-to-many

```
assessment.observable_criterion_mapping
    evidence_spec_observable_id  uuid -> evidence_spec_observable.id
    objective_criterion_id       uuid -> objective_criterion.id
    PRIMARY KEY (evidence_spec_observable_id, objective_criterion_id)
```

Not a column on the observable. One hidden executable test can simultaneously
establish *preserves incomplete data*, *handles arbitrary boundaries*, and *does
not lose data*; and one criterion can be established by several independent
observables — an automated check, a second automated check, and a human rubric
item.

When an evidence spec's `evidence_strength` is `direct`, every non-`critical_error`
criterion of the objective that spec targets must be reachable through this
mapping. Validated at publication.

### Implication rules reference criteria

`catalog.objective_evidence_implication.required_observable_codes[]` is dropped
and replaced by:

```
catalog.objective_evidence_implication_criterion
    implication_id         uuid -> objective_evidence_implication.id
    objective_criterion_id uuid -> objective_criterion.id
    PRIMARY KEY (implication_id, objective_criterion_id)
```

Criteria referenced must belong to the implication's **source** objective
revision. Enforced in `0004`.

This is the point of the whole change: a proxy rule now says *"this task
established the criterion 'correctly handles partial reads'"*, which is true
regardless of which task produced the evidence and what that task happened to name
its observable.

### The proxy gate rewrite — highest-risk item in this pass

Today `evidence.ts` flat-matches `required_observable_codes` against
`observableResult.observable_code`. After the change the resolution is
criterion → mapped observables on *this attempt's* evidence spec → observable
results.

The failure mode is **vacuous success**: an attempt whose observables carry no
criterion mappings yields an empty set, and a check phrased as "no failures found"
passes for free. This must never be valid:

```
required criteria resolved = []
failed criteria = []
therefore success
```

The gate demands positive establishment:

```
propagate if and only if

  for every required source criterion:
      at least one mapped observable exists on this attempt's spec
      AND at least one such mapped observable result succeeded

  AND no blocking critical_error criterion of the source objective was triggered
```

The demo scenario already exercises this path with five gating observable codes,
so a mistake here is visible in the baseline diff. It is also covered by smoke
tests 4 and 5.

---

## §3 Transfer distance is not performance scope

The current `evidence.transfer_level` enum (`same | near | far | integrated`)
conflates two independent dimensions and treats them as one linear scale. Far
transfer of a single focused capability into an unfamiliar runtime is not the same
thing as an integrated mission in an entirely familiar environment, and neither
dominates the other.

Split into:

```
evidence.transfer_distance    same | near | far
evidence.performance_scope    focused | composite | integrated
```

`performance_scope`, not `integration_scope`, and deliberately not
`mission_integrated`: **a mission is an assessment format, not a property of
evidence.** Integrated evidence can come from something that is not formally a
mission, and a mission can contain a focused sub-assessment. The evidence
dimension stays independent of the delivery format.

```
focused      one principal capability
composite    several capabilities combined in a bounded task
integrated   capabilities must function together as authentic engineering work
```

Both of these are now expressible and meaningful:

```
transfer_distance: far    performance_scope: focused
transfer_distance: same   performance_scope: integrated
```

Columns touched:

- `evidence.observation.transfer_level` → `transfer_distance` + `performance_scope`
- `assessment.task_variant.novelty_default` → `transfer_distance_default` +
  `performance_scope_default`
- `assessment.task_objective_evidence_spec.minimum_transfer` →
  `minimum_transfer_distance` + `minimum_performance_scope`
- `qualification.objective_requirement.minimum_transfer` →
  `minimum_transfer_distance` + `minimum_performance_scope`
- `services/policy.ts` gains two orderings; `transferAtLeast` becomes two
  predicates. The confidence bonus currently keyed on `transfer_level !== 'same'`
  keys on `transfer_distance !== 'same'`.

The old `transfer_level` enum type is dropped.

---

## §4 Evidence ceiling moves to the administration

```
Task Revision           design_evidence_ceiling
        |                 what this task supports under ideal conditions
        v
Task Administration     effective_evidence_ceiling
        |                 what this administration can support
        v
Observation             must not establish an objective above the effective ceiling
```

- `assessment.task_revision.evidence_ceiling` → `design_evidence_ceiling`
  (renamed for clarity; unchanged meaning).
- `assessment.task_administration.effective_evidence_ceiling` smallint NOT NULL.
- `effective_evidence_ceiling <= design_evidence_ceiling` enforced by trigger in
  `0004` (cross-table, so not a check constraint).
- `recordObservation()` enforces the ceiling itself, not only the caller: an
  observation may not establish an objective whose `mastery_level` exceeds the
  administration's effective ceiling. This check does not exist anywhere today.

The seed currently carries an unstructured `evidenceCeilingReduced` value in
administration JSON; that becomes a real column.

### Definition, stated so the deferral is honest

> `effective_evidence_ceiling` is the ceiling given the assistance **permitted by
> this administration**, not the assistance actually consumed.

A practice administration with AI and hints available carries an effective ceiling
of L2 even if the learner never opens a hint. Conservative and valid. Actual
assistance capture — permitted ceiling L3, actual usage reducing a specific
attempt to L2 — is deferred. `assistance_policy` jsonb is untouched, and no
independence cap is added, because that would re-open the deferred assistance
model through a side door.

---

## §5 Assurance belongs to the requirement; claim validity belongs to the objective

Two different concerns currently collapsed into `objective_revision.assurance_class`:

| Concern | Question | Owner |
|---|---|---|
| Claim validity | What kind of evidence could *validly* establish this claim? | Objective |
| Assurance | How much proof do we require before *relying* on the claim? | Role requirement |

*Explain TCP byte-stream semantics* means the same thing everywhere. A Software
Engineer L3 may need one constructed explanation; a Network Engineer L3 may need
explanation plus prediction across unfamiliar cases plus direct use during
diagnosis. The capability did not change. The consequence of relying on it did.

### Objective keeps claim validity, typed

```
catalog.objective_claim_evidence_constraint
    objective_revision_id  uuid PK -> learning_objective_revision.id
    practical_performance_required     boolean not null
    constructed_response_supported     boolean not null
    multiple_choice_alone_sufficient   boolean not null
    direct_observation_possible        boolean not null
```

Typed columns, not jsonb. These drive publication validation, which makes them
core governing semantics rather than flexible metadata — and it would be absurd to
fix `success_criteria`-buried-in-JSON while introducing evidence-validity-buried-in-JSON
in the same migration.

These properties follow from the claim. An `implement` objective inherently
requires practical performance regardless of who is hiring.

### Objective's assurance class becomes advisory

`learning_objective_revision.assurance_class` → **`default_assurance_class`**.
Advisory only; it serves as the initial value when authoring a role requirement.

Class semantics documented (naming only in this pass — the classes do not encode
rules yet; they will eventually resolve to a mastery/evidence policy):

```
A  Lightweight      supporting or foundational knowledge
B  Performance      authentic direct performance required
C  High Assurance   consequential or qualification-critical capability
```

### Role requirement carries governing assurance

```
qualification.objective_requirement.required_assurance_class  char(1) NOT NULL
```

The role compiler materializes an explicit value at compile time, seeded from
`default_assurance_class` when the composition does not specify one. **Never
inherited dynamically after publication** — the frozen role revision must state
what it required.

Because requirements now carry assurance and context, both feed the compiled hash.
Identical inputs must still produce an identical hash; the hash input shape
changes in this pass and that is expected.

### Validation splits in two

**Objective publication** (in `validateRelease`) checks intrinsic claim correctness:

- the verb is allowed at the objective's mastery level —
  `verb_definition.allowed_mastery_levels` exists today and governs nothing;
  this makes the verb dictionary governing rather than documentary
- at least one non-`critical_error` criterion exists
- every `critical_error` criterion has a severity
- claim constraints are coherent (e.g. `practical_performance_required` and
  `multiple_choice_alone_sufficient` cannot both hold)
- context policy is coherent (allowed values belong to their dimension;
  `minimum_distinct_values > 1` implies `policy = 'required'`)
- a direct evidence spec covers every non-`critical_error` criterion (§2)

**Role compile** checks assurance and context coherence:

- `required_assurance_class` is explicit on every requirement
- pinned context dimensions are `required` on the target objective (§1)
- pinned context values belong to their dimension and are permitted by any
  objective allowed-value whitelist

The full role publication validator — satisfiability, available assessments,
achievable independence — stays in the deferred integrity pass.

---

## §6 Simplifications

- **Drop `assessment.task_objective_evidence_spec.direct_evidence_required`.**
  The role requirement already says this and is the right layer for it. If a task
  provides direct evidence, `evidence_strength = 'direct'` says so.
- **Drop `catalog.objective_evidence_implication.transitive` entirely** — not
  pinned false. A column whose only legal value is `false` is documentation
  masquerading as data. The recursion path in `evidence.ts` is removed. The model
  becomes explicit one-hop implications only: an L4 task establishing L3 by proxy
  does not thereby establish L2; if it genuinely can, author the L4 → L2 rule.
  Reinstating transitivity later is one trivial migration.
- **`performance_modes` stays descriptive.** Tags for search and analytics. The
  verb dictionary is the formal semantic system; a second governing ontology
  competing with it recreates the original problem. Documented as such in the
  schema; no behavior attached.

---

## §7 Seed and demo

Context is unproven without content.

- `cloud_provider` dimension with values `aws`, `azure`, `gcp`, and
  `aws_govcloud` whose parent is `aws`.
- `programming_language` dimension with `rust` and at least one other, so the
  existing Rust objectives can declare language scope.
- A `cloud-computing` domain (renamed from the current cloud/infrastructure
  framing) with provider-neutral objectives that declare `cloud_provider` as a
  required dimension, plus a task and administration delivering AWS context.
- Criteria for all 39 existing objectives, including the critical errors that are
  currently prose in `critical_errors`.

The demo scenario gains a context section proving all four directions:

| Evidence | Requirement | Expected |
|---|---|---|
| `cloud_provider=aws` | `cloud_provider=aws` | PASS |
| `cloud_provider=aws` | `cloud_provider=azure` | FAIL |
| `cloud_provider=aws` | `cloud_provider=aws_govcloud` | FAIL |
| `cloud_provider=aws_govcloud` | `cloud_provider=aws` | PASS |

The fourth row is the one that proves the hierarchy is directional rather than
merely symmetric grouping.

---

## §8 Regression coverage

A 55-line demo diff cannot prove the semantics this pass introduces. No test
framework beyond `vitest` and a `test` script on `@lighthouse/db` (the root
`turbo.json` already declares the task). Migrate and seed into the docker-compose
Postgres in `beforeAll`; the `db:reset` script supplies most of the harness.

Six cases, each one an invariant this pass creates:

1. GovCloud evidence satisfies an AWS requirement.
2. AWS evidence does **not** satisfy a GovCloud requirement.
3. An observation missing a required context dimension cannot produce a
   `demonstrated` scoped assertion.
4. Proxy implication fails when a required criterion has no mapped successful
   observable — the vacuous-success guard.
5. Proxy implication fails when a blocking `critical_error` criterion fired.
6. An observation cannot establish an L3 objective through an administration
   whose effective ceiling is L2.

Plus the `db:demo` output diffed against the captured baseline at every step.

---

## Implementation order

1. `0003` DDL and `0004` governance, including immutability guards for the new
   objective-revision child tables (`objective_criterion`,
   `objective_context_policy`, `objective_claim_evidence_constraint`,
   `objective_context_allowed_value`) — the existing
   `enforce_objective_revision_immutability` trigger protects the parent row
   only, and these are separate rows a published revision must equally freeze.
2. Schema modules and enums.
3. `policy.ts` orderings, then `evidence.ts` (recording, ceiling enforcement,
   criterion-based proxy gate), then `assertions.ts` (context grouping,
   completeness, canonicalization), then `role-state.ts` (closure matching,
   `minimum_distinct_values`), then `role-compiler.ts` (assurance and context
   compilation, validation), then `publication.ts` (split validation).
4. Seed rewrite and new cloud branch.
5. Demo scenario context section.
6. Smoke suite.
7. README and ARCHITECTURE deferred to a separate pass; noted here so it is not
   forgotten.
