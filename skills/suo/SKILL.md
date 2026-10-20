---
name: suo
description: "Use when an idea needs one bounded Product decision."
version: 0.4.1
license: MIT
compatibility: "Requires Node.js 22.18+ and the suo CLI."
metadata:
  hermes:
    tags: [product-discovery, product-graph, decision-frontier, closure]
prerequisites:
  commands: [suo]
---

# Suo 梭

Suo is a portable, stateless Skill: the needle can work on a different project tomorrow. Product state lives in the selected knowledge base, never in the Skill, an account, a global active-project setting, or conversation memory. Re-read the project on every invocation.

## Runtime readiness

Before touching Product state, run `suo --version` using the user's selected CLI installation. Its version must match this skill's `version` frontmatter. If the command is missing, dependencies fail, or the versions differ, stop Product mutations and explain the setup needed. Do not silently install, upgrade, fall back to another executable, or assume a plugin manager installed Node dependencies.

This skill is instructions; the separately installed `@stevenlyd/suo` runtime supplies the `suo` command. It requires Node.js 22.18+. A host-native plugin update can update instructions without updating that runtime. Use the reviewed runtime's absolute executable path if it is not on PATH; substitute that path wherever this skill says `suo`. Never refer to an assumed `src/cli.ts` inside a skill-only installation. Installation, verification, upgrade and rollback instructions are in [distribution documentation](https://github.com/stevenlyd/suo/blob/main/docs/distribution.md); select the documentation at the same reviewed Git revision as the installed skill.

## Human surface

The person talks naturally. Do not ask them to write JSON, remember entity IDs, edit ontology files, or operate graph commands. Show one bounded decision, an explicit recommendation, and a readable diff.

## Project placement

- From zero, choose a stable project directory and run `suo init <project-directory> --idea <exact idea>`. That directory remains the future repository root when implementation begins.
- In an existing repository, run `suo init --idea <exact idea>`; Suo places authority at the Git root.
- Select the project explicitly with `--root <directory>` when context could be ambiguous. Never reuse another project merely because it was used in the previous conversation.
- After initialization, commands may run from any descendant directory. Suo walks upward to `suo/product.suo.ts` or `suo.vault.json`.
- If the user chooses their Obsidian knowledge base, initialize with `suo vault init <directory> --idea <exact idea>`; do not also initialize TS authority. Obsidian is optional, and its application need not be running.
- Never create a user-global Suo authority.

## Authority rules

- Each project selects exactly one knowledge-store adapter.
- With the default repo-ts adapter, `suo/**/*.suo.ts` and imported Markdown resources are authority; persisted graph references use TypeScript imports.
- With the Obsidian adapter, enrolled notes own authored definitions and `suo-history/` holds durable approved revisions and lifecycle records. TS under `.suo/compiled/` is disposable output. Preserve the marker, notes and history together when moving hosts.
- Enroll only explicitly selected notes using `suo vault adopt`; do not convert the whole Vault. Preserve unrelated prose and properties. Only typed relationship properties create Product edges; ordinary links remain knowledge.
- Inspect local draft edits with `suo vault diff`, present the exact effect, then use `suo vault approve --digest <reviewed-digest> --yes` only after owner approval. Re-read/review if the digest is stale. Handwritten status properties never grant approval.
- `.suo/` is transient staging/cache state, not Product authority.
- `docs/suo/` is generated and must not become independent authority.
- Agent extraction and recommendations are proposals.
- Only explicit owner approval changes Product authority.
- Silence, confidence, code, or continued conversation never counts as approval.
- Product definition and implementation realization remain separate.
- External agents submit closure evidence but cannot accept their own closure.
- Approved history is superseded or retired, never silently rewritten. Proven handoff Product-revision metadata errors may use the explicit `correct_handoff_product_revision` proposal operation with expected old value, reviewed replacement, reason and fixed historical evidence; it preserves an attached correction audit and never changes frozen semantics. Do not infer corrections from counter size or automatically migrate old records.

## Workflow

1. Resolve the intended project, then run `suo inspect --root <directory>`; if no project exists, initialize it according to Project placement using the user's exact idea.
2. Read `suo next --json` before asking anything. If Vault definition edits are pending, review them with `suo vault diff` before continuing; do not silently accept them.
3. Research retrievable facts instead of asking the owner.
4. Present exactly one owner-decidable question with a recommendation, why now, and what it unlocks.
5. Convert the answer into a `kind: "proposal"` protocol envelope and call `suo submit -`.
6. Show the proposal's exact human-readable effect. Do not call approve yet.
7. After explicit approval, call `suo approve <proposal-id> --yes`. Approval writes through the selected adapter to the same knowledge base.
8. When Suo exposes a current handoff, give the external implementation agent that exact handoff revision.
9. On return, submit a `kind: "closure"` envelope with the non-empty implementation-agent identity, implementation references, acceptance evidence, real check results, deviations, risks, and new Product questions.
10. Show the closure evidence to the verifier. After explicit acceptance, call `suo approve <closure-id> --yes --verifier <name>`.
11. Return the new `suo next --json` action.

## Rejection and change

Use `suo reject <proposal-id> --reason <reason>` for a pending proposal. Closure rejection additionally requires `--verifier <identity>`. Reopen, supersede, defer, delete, or freeze Product records through typed proposal operations rather than hidden direct edits.

If an Agent directly edits authority while shaping a proposal, do not treat those edits as approved. Restore or stage them, show the exact diff, and obtain explicit owner approval before committing them as authority.

## Closure refusal

Reject or reopen closure when:

- it targets a stale handoff revision;
- any acceptance criterion lacks passing evidence;
- a required check failed or did not run;
- a deviation requires a Product decision;
- a new Product question remains unresolved;
- implementation references do not identify the realized artifact or revision.

## Boundary

Do not decompose implementation tasks, choose ordinary coding details, orchestrate development agents, or deploy software. Suo ends Product definition at a versioned handoff and resumes when evidence returns for closure.

