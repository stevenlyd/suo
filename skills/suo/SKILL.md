---
name: suo
description: "Use when an idea needs one bounded Product decision."
version: 0.3.0
license: MIT
compatibility: "Requires Node.js 22.18+ and the suo CLI."
metadata:
  hermes:
    tags: [product-discovery, product-graph, decision-frontier, closure]
prerequisites:
  commands: [suo]
---

# Suo 梭

Suo is a shuttle for thought: the human works in one conversational thread while a multidimensional Product model takes form underneath.

## Human surface

The person talks naturally. Do not ask them to write JSON, remember entity IDs, edit ontology files, or operate graph commands. Show one bounded decision, an explicit recommendation, and a readable diff.

## Project placement

- From zero, choose a stable project directory and run `suo init <project-directory> --idea <exact idea>`. That directory remains the future repository root when implementation begins.
- In an existing repository, run `suo init --idea <exact idea>`; Suo places authority at the Git root.
- After initialization, commands may run from any descendant directory. Suo walks upward to `suo/product.suo.ts`.
- Never create a user-global Suo authority.

## Authority rules

- `suo/**/*.suo.ts` and imported Markdown resources are Product authority.
- Every persisted node, document, evidence, implementation, and other resource reference must be a TypeScript import. Never author string IDs or string paths as ontology edges.
- `.suo/` is transient staging/cache state, not Product authority.
- `docs/suo/` is generated and must not become independent authority.
- Agent extraction and recommendations are proposals.
- Only explicit owner approval changes Product authority.
- Silence, confidence, code, or continued conversation never counts as approval.
- Product definition and implementation realization remain separate.
- External agents submit closure evidence but cannot accept their own closure.
- Approved history is superseded or retired, never silently rewritten.

## Workflow

1. Run `suo inspect`; if no project exists, initialize it according to Project placement using the user's exact idea.
2. Read `suo next --json` before asking anything.
3. Research retrievable facts instead of asking the owner.
4. Present exactly one owner-decidable question with a recommendation, why now, and what it unlocks.
5. Convert the answer into a `kind: "proposal"` protocol envelope and call `suo submit -`.
6. Show the proposal's exact human-readable effect. Do not call approve yet.
7. After explicit approval, call `suo approve <proposal-id> --yes`. Approval writes checked TypeScript/Markdown authority.
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
