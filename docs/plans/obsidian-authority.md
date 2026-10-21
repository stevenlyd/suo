> Historical design context. Schema 5 runtime/skill and docs/unit-runtime.md supersede authority and lifecycle details below.

# Obsidian current-state adapter

Enrolled notes contain authored definitions and explicit typed links. `suo-state/current.json` holds current approved lifecycle state. Generated TS is disposable IR. Git or the user's backup owns previous versions; there is no required history chain.

Draft review uses exact note-content and current-state digests. Approval updates current definitions, invalidates affected evidence, and atomically replaces current state using a recoverable multi-note transaction. Recovery preserves outside edits and refuses conflicts. Unknown checks remain explicitly undecided. See `docs/validation-upgrade.md` and the current skill for the operational protocol.
