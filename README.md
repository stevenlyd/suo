# Suo 梭

**A shuttle for thought.**

Suo helps a person think in one line while a multidimensional Product model takes form underneath.

> Your idea is the work. Suo is only the shuttle.

## Start with a sentence

People do not operate Suo by writing JSON or memorizing graph commands. Use it through a compatible Agent Skill and say:

> I have an idea…

The agent reads the current frontier, asks one bounded question, recommends an answer, shows the exact proposed change, and waits for explicit approval. Suo's deterministic kernel validates and commits the result.

```text
Human
  → Hermes / Codex / Pi + Suo Skill
  → suo CLI
  → .suo/suo.json
```

## The weaving model

- **Warp** — frozen dependencies, constraints, and Product structure.
- **Shed** — the one opening currently allowed by the dependency frontier.
- **Weft** — one bounded Product decision.
- **Pick** — one proposal, approval, and authority commit.
- **Shuttle** — the agent carries a decision out as a handoff and returns with closure evidence.
- **Fabric** — the evolving Product authority.

The public domain model keeps plain names such as `Decision`, `Handoff`, and `Closure`; the weaving language explains the interaction without making the API cryptic.

## The loop

```text
“I have an idea”
→ exactly one NextProductAction
→ agent proposal
→ explicit owner approval
→ frozen handoff
→ external implementation
→ closure submission
→ verifier approval
→ exactly one next action
```

Product-definition status and implementation reality remain separate. An external agent may submit evidence but cannot accept its own closure.

## CLI: local protocol for agents and CI

Humans may use `next`, `inspect`, and `check` for visibility. Structured writes are intended for Agent Skills.

```text
suo init
suo next
suo submit
suo approve
suo reject
suo inspect
suo check
```

### Initialize

```bash
suo init "I have an idea for a calmer way to define products" --title "Example"
```

### Read exactly one next action

```bash
suo next
suo next --json
```

### Stage a proposal

```bash
suo submit examples/proposal-intake.json
```

Submitting never changes Product authority. It creates a pending proposal and makes review the next action.

After the owner sees the exact change and explicitly approves:

```bash
suo approve proposal:intake --yes
```

Reject instead:

```bash
suo reject proposal:intake --reason "The scope is still too broad"
```

### Submit implementation closure

```bash
suo submit examples/closure-intake.json
suo approve closure:intake --yes --verifier owner
```

The kernel refuses closure with stale handoffs, incomplete acceptance evidence, failed checks, unresolved Product deviations, or new Product questions.

### Inspect and check

```bash
suo inspect
suo inspect handoff:module:intake:1 --json
suo check
```

Every write automatically validates state, regenerates artifacts, propagates staleness, and recomputes the next action. There are no public `generate`, `module`, `decision`, or graph-edge command trees.

## Workspace

```text
.suo/
├── suo.json                       canonical Product and realization state
└── generated/
    ├── NEXT.json
    ├── NEXT.md
    ├── PRODUCT_MAP.md
    ├── PRODUCT_DAG.mmd
    ├── HANDOFFS/
    └── CLOSURES/
```

Generated files are projections. `.suo/suo.json` is the sole structured authority.

## Deterministic boundaries

The kernel owns:

- JSON Schema and domain validation;
- module definition DAG and cycle rejection;
- proposal staging and stale-base detection;
- explicit owner approval;
- deterministic frontier selection;
- versioned handoffs;
- closure evidence validation;
- downstream stale propagation;
- atomic filesystem persistence.

The host Agent owns natural-language understanding, research, recommendations, and dialogue. It cannot silently promote its own inference into Product authority.

## Development

Requires Node.js 22.18+ and pnpm.

```bash
pnpm install
pnpm check
node dist/cli.js --help
```

## Third-party boundaries

- Graphology / graphology-dag: in-memory graph algorithms only.
- JSON Schema 2020-12 / Ajv: persisted contract validation.
- Mermaid: generated projection.
- UPG and OpenSpec: future optional adapters, never authority.
- Coding agents: downstream handoff consumers and closure submitters.

## License

MIT
