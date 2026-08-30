# Product Frontier

**A graph underneath, one product decision at a time.**

Product Frontier starts with “I have an idea,” builds a durable Product definition graph, exposes exactly one bounded next Product action, compiles frozen modules into agent-ready handoffs, and accepts evidence-backed closure from external implementation agents.

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
- Generated Markdown and Mermaid are projections of `product.pf.json`.

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

The canonical state is a single revisioned file at `.product-frontier/product.pf.json`. Git is optional history and distribution, not a domain lifecycle.

## Quick start

Requires Node.js 22.18+ and pnpm.

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
.product-frontier/generated/HANDOFFS/handoff_module_intake_1.md
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

`pf next` then recomputes the Product frontier from the accepted reality.

## Command surface

```text
pf init | next | status | validate | generate
pf module create | update | connect | disconnect | freeze | delete | retire
pf decision propose | approve | defer | reopen
pf realization start
pf closure submit | accept | reject | reopen
```

Run `pf --help` for exact syntax.

## Files

```text
.product-frontier/
├── product.pf.json                 canonical Product authority and realization state
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
