# Suo

Suo keeps current product definitions and honest implementation coverage with the code in Git. One Unit type supports arbitrary nesting, explicit dependencies, constraints, criteria and unresolved decisions. Git keeps prior states; no product-history ledger or external current-state store is required.

The runtime checks strict shapes, canonical TypeScript imports, dependency/phase cycles, inherited machine-checkable constraints, repository mappings, content applicability and stale writes. It cannot prove behavior, authenticate supplied identity, accept a product for a user, or infer deployment from a merge.

```sh
suo --version
suo template ./project --title 'My product'
suo --root ./project --target working-tree inspect
# Commit the reviewed authority and code with normal Git flow.
suo --root ./project check
suo --root ./project next
suo --root ./project render
```

Default reads inspect committed HEAD. Index and working-tree candidates are explicit. All runtime/provider CI, PR and deployment facts belong to fresh Duet observations, never persisted Suo status. A null check policy or missing implementation record remains unknown.

- [Runtime contract and algorithms](docs/unit-runtime.md)
- [Strict schema upgrade](docs/validation-upgrade.md)
- [Native installation and updates](docs/distribution.md)
- [Distribution testing](docs/testing/distribution.md)

Run `pnpm check`, `node test/cli-e2e.mjs`, `pnpm test:package` and `pnpm benchmark:units`. Benchmarks report measurements, not a claim that explicit stacks always outperform recursion.
