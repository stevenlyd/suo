# Agent Plugins schema

`agent-plugin-1.0.0.schema.json` is the unmodified official schema retrieved on
2026-10-20 from https://agent-plugins.org/schemas/1.0.0/plugin.schema.json.
It validates the portable manifest only; runtime activation and host-specific
catalog schemas require separate verification. Its content hash is included in
`distribution-lock.json`. Updating this fixture requires reviewing the upstream
schema and the target host's compatibility; CI does not fetch a moving schema.
