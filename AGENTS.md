# Agent instructions

Suo owns Git-contained current product definitions and declared implementation coverage. Git owns history; Duet queries external delivery facts at use time.

- One flat Unit registry, arbitrary logical nesting, single-parent containment and typed dependency phases. Canonical TS references remain authoritative.
- No external current-state Vault, historic approval ledger, environment/PR/CI flags or parallel legacy runtime. Git-backed Markdown may be a disposable view, never a second authority.
- Preserve strict API/schema boundaries, atomic staged writes, stale-content guards, real coverage completeness and visible unknown/stale applicability. A code mapping is not behavioral proof or acceptance.
- All owned hierarchy/graph/helper traversal must use explicit stacks/queues. Keep graph work linear apart from documented sorting/hash/input/constraint costs; benchmark actual paths.
- Current definitions may be replaced under authorized intent. Changed dependencies/code invalidate applicability; never fabricate acceptance, required-check policy or deployment authorization.
- Keep the core local-first, deterministic and provider-neutral. Remote observations are collected separately by Duet, not trusted because a caller supplied a URL.
- Run `pnpm check`, the CLI end-to-end exercise and package smoke tests before claiming completion.
