# Pluggable knowledge stores: repository TypeScript and Obsidian

Suo owns Product semantics, not a mandatory knowledge-base application. Each project selects exactly one authoritative store. The default `repo-ts` store keeps the existing imported TypeScript knowledge base inside an engineering repository. The optional `obsidian` store lets users maintain enrolled Vault notes in place. Future stores implement the same contract; only Obsidian is in scope now.

For the Obsidian store, notes own authored definitions and TypeScript may be generated as disposable intermediate representation. For `repo-ts`, TypeScript remains authored source. The same file format can play different roles in different stores; these roles must never be confused.

## Stateless Skill, project-owned state

Suo is the needle; the project is the fabric. Every invocation selects a project explicitly (`--root`) or discovers its root from the working directory. The Skill contains instructions, the kernel computes from its input, and adapters read/write project-owned files. No global active project, account, daemon, cross-project registry, or conversational memory is required. Moving between compatible hosts requires access to the same project files, not transferring chat state. Local caches and pending submissions may be discarded; approved history must travel with the project.

## Store boundary before implementation

The shared kernel owns node/edge types, Product invariants, proposal application, approval requirements, lifecycle transitions and versioned handoff/closure semantics. Stores own discovery, reading, stable source bindings, diagnostics, compare-and-swap writes, revision persistence and recovery.

The initial core contract exposes per-project load/save operations. The Obsidian adapter additionally exposes draft source bindings, exact before/after values with a review token, and immutable approved revision reads. Writes compare the expected revision; Vault commits also compare source content. These capabilities remain explicit rather than being advertised for adapters that do not implement them. Backend writes must preserve unrelated user content. A store that cannot offer safe atomic or recoverable commits cannot claim writable support.

Obsidian consists of a portable Vault store plus a later UI plugin. The Vault store can work from the CLI without the Obsidian application running. The UI plugin supplies enrollment, review and navigation, not a separate model/database. Do not add a generic plugin marketplace or dynamically executed plugin loader in this slice.

Exactly one store is authoritative per project. Other integrations are explicitly read-only projections or inputs for proposals. Switching authority is an explicit migration, not automatic bidirectional synchronization between independent sources. Keep repo-ts behavior and CLI compatibility as the first regression gate.

## Ownership

- Vault Markdown owns authored product, module and decision fields. Ordinary notes and ordinary body links remain knowledge, not inferred Product edges.
- Stable `suo_id` identifies a node independently of path/title. Typed relationship properties contain quoted wikilinks. Duplicate IDs and ambiguous links fail closed.
- Lifecycle changes, approvals, versioned handoffs and closure acceptance are protocol actions, never writable status properties.
- `suo-history/` contains durable, append-only revision records, including approved content and lifecycle state. It must be synced and backed up. These records are history, not another editable definition. Hash chaining detects corruption and inconsistent sync; it is not a signature or protection against an actor rewriting the whole history.
- `.suo/compiled/` contains disposable generated TS. `.suo/` is ignored by Git. Generated views remain disposable.

## First implementation: portable CLI vertical slice

1. `suo vault init <directory> --idea ...` creates an opt-in project marker and a product note, without moving existing notes.
2. `suo vault adopt <note.md> --kind module|decision` enrolls an existing note with a stable ID, preserving its prose and unrelated metadata. A decision must reference a module.
3. `suo vault check` parses working notes, resolves typed links, validates a draft and generates TS; it does not approve edits.
4. `suo vault diff` shows exact authored before/after values and a digest. `suo vault approve --digest <digest> --yes` approves only that reviewed draft. Concurrent note changes invalidate the digest.
5. Existing next/submit/approve/reject/check commands operate on the approved revision. Unapproved authored changes block mutations until reviewed. Approved proposal operations write authored changes back to the same notes.
6. Read/write diagnostics preserve user context. Unknown `suo_` fields fail rather than silently losing data. Missing enrolled nodes fail rather than implying deletion. Explicit protocol deletions detach notes, preserving their personal content.

Structured contract arrays live in prefixed properties in this first slice. The product idea, module objective and decision question use an explicitly delimited Markdown region so unrelated prose is never reinterpreted or overwritten. This is a portable foundational format, not the final Obsidian editing UI.

## Correctness and recovery

- Read all enrolled inputs and compare them again before committing. Serialize Suo writers with a lock.
- Revision records form a hash chain. Unexpected gaps, malformed history and edits to prior records fail closed.
- Keep a durable write journal across multi-note updates. Interrupted writes block further operations with recovery guidance; never silently accept partial state.
- A definition edit keeps prior revision snapshots intact and invalidates affected active handoffs through existing kernel rules. Editing status metadata cannot approve anything.
- History preserves protocol state. Pending submissions remain local staged data, as in TS mode.

## Validation

Regression suite for TS mode; Markdown enrollment/read/write; ordinary prose preservation; stable identities on rename; typed-link ambiguity; duplicate IDs; dependency cycles; stale review digests; forged statuses; approved-decision edits; handoff invalidation; history integrity; interrupted transactions; cache deletion/rebuild; CLI end-to-end init → adopt → review → approve → proposal → freeze.

## Subsequent milestones

- Obsidian plugin: enroll current note, typed relation picker, draft diff/approval, next-action sidebar and error navigation. Plugin calls the same core and does not own a second database.
- Native heading/block bindings, reusable external evidence notes and full resource graph representation. No claim of lossless legacy TS migration until resource identities, versions and source bindings are retained end to end.
- Multi-project Vault membership, conflict recovery UI and explicit legacy migration.
- Rich handoff/closure browsing with links to immutable approved revisions.

Non-goals for this slice: automatic whole-Vault conversion, arbitrary YAML-to-TS conversion, rewriting normal wikilinks, trusting user-edited approval fields, or byte-for-byte TS round trips.

## Delivered in this branch

The CLI/store vertical slice above is implemented. `KnowledgeStore` is selected per invocation; repo-ts remains the default, and the Vault adapter is opt-in. The Skill documents project selection and restoration from project files rather than conversation memory. No service, registry or global active-project state was introduced.

Validation: `pnpm check` passes (43 tests, TypeScript checks and distribution build). CLI end-to-end exercises pass for both stores: initialize, submit/approve definition, freeze, submit closure, reject self-verification, independently approve closure, and reach completion. Existing-note enrollment/review/approval and switching between distinct project roots also pass. The Obsidian application UI is not part of this branch.
