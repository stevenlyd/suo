# Suo 梭

**A shuttle for thought.**

Suo lets a person think in one conversational thread while a multidimensional Product model takes form underneath.

> Your idea is the work. Suo is only the shuttle.

## Start with a sentence

People use Suo through a compatible Agent Skill:

> I have an idea…

The agent reads the current frontier, asks one bounded question, recommends an answer, shows the exact proposed change, and waits for explicit owner approval.

```text
Human
  → Hermes / Codex / Pi + Suo Skill
  → suo CLI
  → imported TypeScript ontology + Markdown resources
```

## The loop

```text
“I have an idea”
→ exactly one NextProductAction
→ agent proposal
→ explicit owner approval
→ TypeScript authority commit
→ frozen handoff
→ external implementation
→ evidence-backed closure
→ verifier approval
→ exactly one next action
```

Product definition and implementation reality are separate. An external agent can submit evidence but cannot accept its own closure.

## Project layout

```text
<project>/
├── suo/                          Product authority
│   ├── product.suo.ts            imported authority root
│   ├── ontology.d.ts             generated compiler contract
│   ├── assets.d.ts               generated Markdown module contract
│   ├── modules/*.suo.ts
│   ├── decisions/*.suo.ts
│   ├── handoffs/*.suo.ts
│   ├── realizations/*.suo.ts
│   ├── closures/*.suo.ts
│   ├── proposals/*.suo.ts
│   ├── resources/*.suo.ts
│   └── content/*.md
├── docs/suo/                     generated human-readable projections
└── .suo/                         local cache and staged proposals
```

There is no authoritative JSON snapshot. `suo/**/*.suo.ts` and imported Markdown are the authority. `.suo/` contains transient machine state and should normally be ignored by Git. `docs/suo/` can always be regenerated.

## Import graph is the ontology graph

Every persisted resource reference is a TypeScript import. String IDs and string paths are not accepted as graph edges.

```ts
import objective from "../content/client-gallery.md"
import clientPortal from "./client-portal.suo.js"
import type { ModuleNode } from "../ontology.js"

const value = {
  kind: "module",
  id: "module:client-gallery",
  title: "Private client gallery",
  dependencies: [clientPortal],
  contract: {
    objective,
    frozenBehavior: ["Only authorized clients can open the gallery."],
    scope: ["Private gallery viewing"],
    nonGoals: ["Public portfolio publishing"],
    acceptance: [
      { id: "authorized-access", text: "An authorized client can open the gallery." },
    ],
  },
  phase: "mvp",
  definitionStatus: "shaping",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies ModuleNode

export default value
```

Markdown imports are compiled into typed documents containing their repository-relative path, content, and SHA-256 digest. They may live under `suo/content/` or elsewhere inside the same project; Suo preserves the imported path across authority writes. Missing, moved, changed-during-commit, or out-of-project Markdown fails `suo check`.

External URLs, commits, files, releases, deployments, and evidence are declared once as typed resource nodes. Other nodes import those resources rather than repeating string references.

Suo source files are declarative. Executable code, dynamic imports, assertions, computed properties, and spread are rejected.

## Initialize

From zero, create the future repository root immediately:

```bash
suo init ./my-project --idea "I have an idea for a calmer way to define products"
```

Inside an existing Git repository:

```bash
suo init --idea "Add a private client gallery"
```

Suo finds the Git root. After initialization, every command walks upward to find `suo/product.suo.ts`, so commands work from nested source directories without creating another workspace.

## CLI: protocol for agents and CI

Humans normally interact through the Skill. The flat CLI remains available for agents, automation, inspection, and CI:

```text
suo init
suo next
suo submit
suo approve
suo reject
suo inspect
suo check
```

### One next action

```bash
suo next
suo next --json
```

### Stage and approve a proposal

```bash
suo submit examples/proposal-intake.json
suo approve proposal:intake --yes
```

Submission JSON is only a protocol envelope staged under `.suo/`; it is not Product authority. Approval checks the proposal base digest, applies the change to imported TypeScript/Markdown sources, checks the complete ontology, and regenerates `docs/suo/`.

Reject instead:

```bash
suo reject proposal:intake --reason "The scope is still too broad"
```

### Submit implementation closure

```bash
suo submit examples/closure-intake.json
suo approve closure:intake --yes --verifier owner
```

Every closure must name a non-empty implementation-agent identity. Suo normalizes surrounding whitespace and prevents that identity from approving or rejecting its own closure.

The kernel rejects stale handoffs, incomplete acceptance evidence, failed checks, unresolved Product deviations, and new Product questions.

### Inspect and check

```bash
suo inspect
suo inspect handoff:module:intake:1 --json
suo check
```

`suo check` performs TypeScript compilation, import reachability, Markdown resolution and hashing, ID uniqueness, definition-DAG validation, lifecycle validation, closure validation, and generated-document reconciliation.

## Deterministic boundaries

The kernel owns:

- declarative TypeScript ontology compilation;
- mandatory imported resource references;
- Markdown module loading and content digests;
- module definition DAG and cycle rejection;
- proposal staging and stale-base detection;
- explicit owner approval;
- deterministic frontier selection;
- versioned handoffs;
- closure evidence validation;
- downstream stale propagation;
- checked filesystem commits.

The host Agent owns natural-language understanding, research, recommendations, and dialogue. It cannot silently promote its inference into Product authority.

## Development

Requires Node.js 22.18+ and pnpm.

```bash
pnpm install
pnpm check
node dist/cli.js --help
```

## Third-party boundaries

- TypeScript: node contracts and static checking.
- esbuild: isolated compilation of the declarative import graph and Markdown modules.
- Graphology / graphology-dag: in-memory graph algorithms.
- JSON Schema / Ajv: runtime protocol and compiled-snapshot validation, never authority.
- Mermaid: generated projection.
- UPG and OpenSpec: future optional adapters, never authority.
- Coding agents: downstream handoff consumers and closure submitters.

## License

MIT
