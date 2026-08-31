# Agent instructions

Suo owns Product-definition and closure semantics, not software implementation planning.

- Keep `suo/**/*.suo.ts` and their imported Markdown/resources as Product authority.
- Keep `schemas/compiled-snapshot.schema.json` as runtime validation only; JSON is not authority.
- Persist ontology edges as TypeScript imports, never string IDs or string paths.
- Keep Product definition status separate from realization and closure status.
- A full knowledge graph may be cyclic; only module definition dependencies must be a DAG.
- Never let an external agent mark its own closure accepted.
- Approved records are superseded/retired; hard delete is only for unreferenced drafts.
- Generated documents are projections and must not become independent authority.
- Keep the core local-first and provider-neutral. Add adapters only after a real second integration exists.
- Run `pnpm check` and a CLI end-to-end exercise before claiming completion.
