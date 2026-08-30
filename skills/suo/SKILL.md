---
name: suo
description: "Use when an idea needs one bounded Product decision."
version: 0.2.0
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

The person talks naturally. Do not ask them to write JSON, remember entity IDs, or operate graph commands. Show one bounded decision, an explicit recommendation, and a readable diff.

## Authority rules

- Agent extraction and recommendations are proposals.
- Only explicit owner approval changes Product authority.
- Silence, confidence, code, or continued conversation never counts as approval.
- Product definition and implementation realization remain separate.
- External agents submit closure evidence but cannot accept their own closure.
- Approved history is superseded or retired, never silently rewritten.

## Workflow

1. Run `suo inspect`; if no workspace exists, initialize with the user's exact idea using `suo init`.
2. Read `suo next --json` before asking anything.
3. Research retrievable facts instead of asking the owner.
4. Present exactly one owner-decidable question with a recommendation, why now, and what it unlocks.
5. Convert the answer into a `kind: "proposal"` submission and call `suo submit -`.
6. Show the proposal's exact human-readable effect. Do not call approve yet.
7. After explicit approval, call `suo approve <proposal-id> --yes`.
8. When Suo exposes a current handoff, give the external implementation agent that exact handoff revision.
9. On return, submit a `kind: "closure"` envelope with implementation references, acceptance evidence, real check results, deviations, risks, and new Product questions.
10. Show the closure evidence to the verifier. After explicit acceptance, call `suo approve <closure-id> --yes --verifier <name>`.
11. Return the new `suo next --json` action.

## Rejection and change

Use `suo reject <id> --reason <reason>` for a pending proposal or closure. Reopen, supersede, defer, delete, or freeze Product records through typed proposal operations rather than hidden direct edits.

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
