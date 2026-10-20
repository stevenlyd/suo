# Suo 梭

**A shuttle for thought.**

Suo is a portable, stateless Skill backed by deterministic local tools. It helps a person turn ideas into a validated Product model stored in their own knowledge base. The Skill is the needle; each project is the fabric.

> Your idea is the work. Suo is only the shuttle.

## Start with a sentence

People use Suo through a compatible Agent Skill:

> I have an idea…

The agent reads the current frontier, asks one bounded question, recommends an answer, shows the exact proposed change, and waits for explicit owner approval.

```text
Human
  → Hermes / Codex / Pi + Suo Skill
  → suo CLI
  → project knowledge-store adapter
  → repo TypeScript (default) or Obsidian Vault (optional)
```

## Install the skill and runtime

Use the [native distribution guide](docs/distribution.md) for Codex, Claude Code, Cursor, Copilot CLI/VS Code, Gemini CLI, Hermes and Pi. One canonical skill is distributed through native manifests/catalogs. Host-managed skill updates and the Node CLI runtime are separate; verify `suo --version` matches the loaded skill before Product work. Repository channels are prepared without publishing to a public marketplace or registry.

## The loop

```text
“I have an idea”
→ exactly one NextProductAction
→ agent proposal
→ explicit owner approval
→ knowledge-store commit
→ frozen handoff
→ external implementation
→ evidence-backed closure
→ verifier approval
→ exactly one next action
```

Product definition and implementation reality are separate. An external agent can submit evidence but cannot accept its own closure.

## Default: repository TypeScript store

Existing TS projects keep their current layout and behavior. Obsidian is optional.

### Project layout

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

In the default TS store, there is no authoritative JSON snapshot. `suo/**/*.suo.ts` and imported Markdown are the authority. `.suo/` contains transient machine state and should normally be ignored by Git. `docs/suo/` can always be regenerated.

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

Submission JSON is only a protocol envelope staged under `.suo/`; it is not Product authority. Approval checks the proposal base digest, applies the change through the project’s adapter, validates the model, and regenerates `docs/suo/`. The TS adapter updates imported source files; the Obsidian adapter updates enrolled notes and appends a durable revision record.

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

## Optional: Obsidian knowledge store

Use your existing Markdown notes in place. No Obsidian application, UI plugin, account or server is required by this first adapter. Each project chooses one authority: TS or Vault notes. Suo never silently synchronizes two editable sources of truth.

```bash
suo vault init ./my-vault --idea "A private client gallery"
suo vault adopt Projects/Gallery.md --kind module --root ./my-vault
suo vault diff --root ./my-vault
# After reviewing the exact before/after values and obtaining owner approval:
suo vault approve --digest <digest-from-diff> --yes --root ./my-vault
suo next --json --root ./my-vault
```

`adopt` requires an existing note. It preserves the existing body and unrelated frontmatter, adds a stable ID, and appends an explicit content region. The owner/agent fills that region with the module objective. A decision can be enrolled with `--kind decision --module "[[Projects/Gallery]]"`; its region contains the question.

Example module note (IDs are normally generated automatically):

```markdown
---
tags: [product]
suo_id: module:gallery
suo_kind: module
suo_title: Client gallery
suo_phase: mvp
suo_dependencies:
  - "[[Projects/Client portal]]"
suo_frozen_behavior: [Only authorized clients can view photos.]
suo_scope: [Private viewing]
suo_non_goals: [Public publishing]
suo_acceptance:
  - id: authorized
    text: An authorized client can view their photos.
---
# Client gallery

Personal research and ordinary [[links]] remain yours.

<!-- suo:content -->
Help clients view their delivered photos privately.
<!-- /suo:content -->
```

Only `suo_dependencies`, `suo_module` and `suo_prerequisites` encode typed node relationships; ordinary prose links do not. Relationships use quoted whole-note wikilinks to enrolled notes, preferably Vault-relative paths. Labels and explicit relative paths (`./` or `../`) are supported; ambiguous basenames, block/heading relationship targets, duplicate IDs, missing nodes and wrong node types are rejected. Stable IDs survive file renames, but relationship links must still resolve (Obsidian can update those links when renaming).

Product properties: `suo_title`, `suo_slice`, `suo_profile`; content region: idea. Module properties are shown above; content region: objective. Decision properties: `suo_module`, `suo_alternatives` (objects with `id`, `label`, optional `tradeoffs`), optional `suo_recommendation`, `suo_prerequisites`, `suo_evidence` (URI strings); content region: question. Lifecycle and approval statuses are controlled by protocol operations, not handwritten properties. Unknown `suo_` properties are rejected.

Real application validation: [Obsidian 1.14.4 on Linux](docs/testing/obsidian-1.14.4/README.md), including screenshots and reproducible desktop scripts. Native Properties displays nested acceptance data as JSON; save editor changes before asking Suo to review them.

### Working notes and approved versions

- `suo vault check` validates the working notes and generates disposable TS at `.suo/compiled/suo/`. It does not approve anything.
- `suo vault diff` returns authored before/after values and a review digest bound to the current revision and exact enrolled note contents.
- `suo vault approve --digest ... --yes` accepts that reviewed draft. Editing even unrelated content after review invalidates the digest.
- Existing `submit`, `approve`, `reject`, `next`, `inspect` and `check` work with either adapter. In Vault mode, unapproved definition edits block these commands until reviewed. Personal prose outside the managed region does not require approval.
- Agent proposal approval writes back to the same notes. Approved/deferred decisions must be reopened through a proposal before their definitions are edited. Freeze and closure acceptance still require the usual protocol actions.
- Generated handoffs in Vault mode use the original approved contract, even after current notes change. Affected active handoffs become stale when the new definition is approved.

### What travels with the project

```text
my-vault/
├── suo.vault.json          adapter selection, not user-global configuration
├── Projects/*.md          enrolled notes alongside ordinary knowledge
├── Suo Product.md         initial product note; may be renamed
├── Suo/*.md               new nodes created by approved Agent proposals
├── suo-history/*.json     durable approved revisions and lifecycle records
├── docs/suo/              generated reading views
└── .suo/                  disposable TS/cache and local pending submissions
```

Back up and sync **notes, the marker, and `suo-history/` together**. History is machine-managed and must not be edited or discarded. It records approvals and exact historical versions; it is not another definition for the user to maintain. Hash chaining catches inconsistent history, not malicious rewriting of the whole archive. `.suo/` may be removed, losing only cache and unapproved staged proposals.

A durable transaction journal blocks normal operations after an interrupted write. `suo vault recover --root <directory>` rolls back uncommitted note writes or finishes cleanup of an already committed revision. It refuses to overwrite external edits. After a process crash, first verify no Suo writer is running before removing a leftover `.suo/write.lock`, then run recovery. Do not delete history to clear an error. Initialization recovery may leave an empty `suo-history/` directory; inspect and remove that empty directory before retrying initialization.

The first adapter supports one product per project root, local files, and explicit content regions. Native heading/block bindings (including imported `MarkdownDocument` objectives in proposals), rich evidence nodes, legacy TS migration, multi-product membership within one Vault, and the Obsidian sidebar/UI plugin are future work. Symlink enrollment is unsupported. There is no lossless legacy TS-to-Vault migration claim.

## Use the same Skill on another project

```bash
suo next --root ./repo-a --json
suo next --root ./vault-b --json
```

All commands accept `--root`; without it they discover the nearest initialized project above the current directory. There is no persistent active project. Another compatible Agent can continue from the same files without the previous conversation. The adapter objects are created for each invocation; Product rules remain in the shared kernel.

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
pnpm install --frozen-lockfile
pnpm build
pnpm distribution:generate
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


### Frozen handoff compatibility (0.3.1)

New freezes retain a `frozenDefinition` value in the existing handoff record: the module definition (including imported Markdown text and digest) and governing decisions at the instant of freezing. Repo-ts serializes this into the tracked handoff `.suo.ts` file; Vault retains it in its normal approved revision history. Keep these files with the project. Regenerating documents, changing current Markdown or definitions, and copying the tracked source to a clean checkout do not change the frozen body. Lifecycle status is still read from the current handoff record.

The outer module/decision relationships remain typed imports. IDs inside the frozen value are historical data, not a second editable graph or references to current definitions. Do not edit frozen records to update Product definitions; approve a change and freeze a new handoff instead. The existing contract digest is checked against the saved value; it is not an authenticity signature and does not cover every display field.

This is an optional additive field in compiled schema 2 / source schema 3, with no data migration or rewrite of past approvals. Older records remain readable. For a legacy Vault handoff, Suo checks its first appearance in verified history against the recorded digest. Because legacy digests did not cover titles or decision questions, those fields are displayed as stable IDs with a provenance notice. If no matching original snapshot exists (including legacy repo-ts records), the generated page preserves identity, revision, status and digest but explicitly marks historical content unavailable. It never substitutes the current contract, even if its digest matches.

A digest cannot recover missing text. Trusted backups or Git-pinned original source/views may supply historical evidence for manual review; this update does not automatically import or invent that evidence. Earlier executables do not understand the new optional field: use 0.3.1 or newer once new handoffs have been frozen. Bundled `dist/` is rebuilt with this fix; no package publication or installation change is required by this source change.
