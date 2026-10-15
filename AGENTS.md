# Agent instructions

Suo owns Product-definition and closure semantics, not software implementation planning.

- In TypeScript mode, keep `suo/**/*.suo.ts` and imported Markdown/resources as Product authority. In Markdown mode, enrolled Vault notes own authored definitions, durable history owns approval/lifecycle records, and TS is disposable generated IR. See `docs/plans/obsidian-authority.md`.
- Keep `schemas/compiled-snapshot.schema.json` as runtime validation only; JSON is not authority.
- Persist typed relationships as imports in TS mode/IR and explicit typed wikilink properties in Markdown mode; ordinary prose links are not Product edges.
- Keep Product definition status separate from realization and closure status.
- A full knowledge graph may be cyclic; only module definition dependencies must be a DAG.
- Never let an external agent mark its own closure accepted.
- Approved records are superseded/retired; hard delete is only for unreferenced drafts.
- Generated documents are projections and must not become independent authority.
- Keep the core local-first and provider-neutral. Add adapters only after a real second integration exists.
- Run `pnpm check` and a CLI end-to-end exercise before claiming completion.

