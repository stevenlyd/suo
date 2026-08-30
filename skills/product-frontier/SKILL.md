---
name: product-frontier
description: "Use when turning an idea into one next Product decision. Maintains authority, handoff, and implementation closure."
version: 0.1.0
license: MIT
metadata:
  hermes:
    tags: [product-discovery, product-graph, decision-frontier, closure]
---

# Product Frontier

Use Product Frontier to move from a vague idea to exactly one bounded Product action, then maintain the loop through an external agent handoff and evidence-backed closure.

## Operating invariant

The default user-facing result is exactly one `NextProductAction`. The internal graph can be complex; do not dump the backlog or dependency graph unless the user asks.

## Authority rules

- Treat agent extraction and recommendations as proposals.
- Treat explicit owner approval as Product authority.
- Never infer approval from silence, continued conversation, confidence, code, or an external agent report.
- Keep Product definition and implementation realization separate.
- External agents may submit closure evidence but cannot accept their own closure.
- Reopen or supersede decisions when reality contradicts a handoff; do not rewrite history.

## Workflow

1. In a repository workspace, run `pf status`; if absent, initialize from the user's exact idea with `pf init`.
2. Read `pf next --json` before asking a question.
3. If the gap is a retrievable fact, research it instead of asking the owner.
4. Ask only the bounded owner choice represented by the current action. Include a recommendation, why now, and what it unlocks.
5. Convert the answer into a decision proposal. Show the exact proposed change before approval.
6. Call `pf decision approve` only after explicit approval.
7. Complete the module contract without selecting implementation details. Freeze it only when behavior, scope, non-goals, and observable acceptance are complete.
8. Give the external implementation agent the exact generated handoff revision.
9. On return, require `pf closure submit` with implementation references, acceptance evidence, real check results, deviations, risks, and new Product questions.
10. Accept closure only after verifying the evidence and reconciling every Product deviation. Then run `pf next --json` again.

## Closure handling

Reject or reopen closure when:

- it targets a stale handoff revision;
- any acceptance criterion lacks passing evidence;
- a required check failed or did not run;
- a deviation requires a Product decision;
- a new Product question remains unresolved;
- the implementation reference does not identify the realized artifact or revision.

Report implementation, merge, deployment, and closure as distinct facts when applicable.

## Boundary

Do not use this skill to decompose implementation tasks, choose ordinary coding details, orchestrate development agents, or run deployment. Its terminal output is an agent-ready Product handoff; its return path is verified closure.
