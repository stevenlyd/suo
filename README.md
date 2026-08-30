# IntentLoop

**A graph underneath, one product decision at a time.**

IntentLoop starts with “I have an idea,” builds a durable Product definition graph, exposes exactly one bounded next Product action, compiles frozen modules into agent-ready handoffs, and accepts evidence-backed closure from external implementation agents.

It deliberately stops short of planning or executing software development.

## The loop

```text
idea
  → provisional product modules
  → one owner-decidable frontier action
  → approved Product authority
  → frozen module and versioned handoff
  → external implementation agent
  → closure submission and verification
  → current realization state
  → exactly one next Product action
```

## Design boundaries

- The full Product knowledge graph may contain cycles.
- Only `requires-definition-of` module dependencies form the validated DAG.
- Product definition and implementation realization are separate state axes.
- Agents propose; owners approve Product authority.
- External agents submit closure claims; verifiers accept closure.
- Approved history is superseded or retired, not silently deleted.
- Generated Markdown and Mermaid are projections of `intent-loop.json`.

## Current vertical slice

The repository contains a working local-first kernel and CLI for:

- idea/workspace initialization;
- module create/update/delete/retire;
- dependency connect/disconnect with cycle rejection;
- decision propose/approve/defer/reopen;
- deterministic next-action selection;
- module freeze and versioned handoff generation;
- realization start;
- closure submit/accept/reject/reopen;
- stale handoff and downstream invalidation;
- JSON Schema and domain invariant validation;
- generated `NEXT.md`, Product map, Mermaid DAG, handoffs, and closures.

The canonical state is a single revisioned file at `.intent-loop/intent-loop.json`. Git is optional history and distribution, not a domain lifecycle.

## Quick start

Requires Node.js 22.18+ and pnpm.

### Install the CLI

The package is not yet published to npm. Install the public GitHub repository directly:

```bash
npm install --global \
  https://github.com/stevenlyd/intent-loop/archive/refs/tags/v0.1.0.tar.gz
iloop --help
```

The release archive is used deliberately: npm 11 with `install-links=false` can leave Git-based global installs pointing at a deleted temporary clone.

### Install the skill

Hermes:

```bash
hermes skills install stevenlyd/intent-loop/skills/intent-loop --yes
```

Pi uses the repository as a native Pi package:

```bash
pi install git:github.com/stevenlyd/intent-loop
```

Codex and Pi can also share a user-global Agent Skills installation:

```bash
npx --yes skills add stevenlyd/intent-loop --global \
  --agent codex pi --skill intent-loop --yes
```

The CLI is host-independent and only needs to be installed once. Each agent host still needs to discover the skill through its own registry or a shared `~/.agents/skills` installation.

### Run locally from source

```bash
pnpm install
pnpm build
node dist/cli.js init \
  --title "Example" \
  --idea "I have an idea for a calmer way to define products"

node dist/cli.js module create module:intake --title "Idea intake"
node dist/cli.js module update module:intake --file examples/module-intake.json
node dist/cli.js decision propose --file examples/decision-single-action.json
node dist/cli.js decision approve decision:single-action \
  --choice "Exactly one bounded Product action" \
  --rationale "The interface is linear even when the internal graph is not"
node dist/cli.js module freeze module:intake
node dist/cli.js next
```

The freeze creates a handoff such as:

```text
.intent-loop/generated/HANDOFFS/handoff_module_intake_1.md
```

An external agent begins realization against that exact revision:

```bash
node dist/cli.js realization start handoff:module:intake:1 \
  --id realization:intake \
  --agent external-agent
```

It later submits closure evidence:

```bash
node dist/cli.js closure submit realization:intake \
  --id closure:intake \
  --file examples/closure-intake.json

node dist/cli.js closure accept closure:intake --verifier owner
```

`iloop next` then recomputes the decision frontier from the accepted reality.

## Command surface

```text
iloop init | next | status | validate | generate
iloop module create | update | connect | disconnect | freeze | delete | retire
iloop decision propose | approve | defer | reopen
iloop realization start
iloop closure submit | accept | reject | reopen
```

Run `iloop --help` for exact syntax.

## Files

```text
.intent-loop/
├── intent-loop.json                 canonical Product authority and realization state
└── generated/
    ├── NEXT.json
    ├── NEXT.md
    ├── PRODUCT_MAP.md
    ├── PRODUCT_DAG.mmd
    ├── HANDOFFS/
    └── CLOSURES/
```

## Third-party boundaries

- **Graphology / graphology-dag:** in-memory graph algorithms only.
- **JSON Schema 2020-12 / Ajv:** persisted and tool-facing contract validation.
- **Mermaid:** generated read-only projection.
- **UPG:** planned optional import/export adapter; not the authority runtime.
- **OpenSpec:** planned optional handoff export.
- **Taskmaster and coding agents:** downstream consumers only.

No graph database, vector store, workflow engine, event sourcing, hosted control plane, or model-provider dependency is required.

## Development

```bash
pnpm check
```

## License

MIT
