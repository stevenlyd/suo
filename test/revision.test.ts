import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { approveProposal, createModule, createProduct, freezeModule, stageProposal } from '../src/core.js'
import { generateArtifacts, renderHandoff } from '../src/render.js'
import { loadAuthority, saveAuthority } from '../src/source.js'
import { loadSnapshot, saveSnapshot } from '../src/store.js'
import { compileVault, initVault, readVaultHistory } from '../src/vault.js'
import { validateSnapshot } from '../src/validation.js'
import type { ProductOperation, SuoSnapshot } from '../src/model.js'

const contract = { objective: 'Feature', frozenBehavior: ['Behavior'], scope: ['Scope'], nonGoals: ['Other'], requiredChecks: [], checkRationale: 'Manual observation suffices for this fixture.', acceptance: [{ id: 'a', text: 'Works' }] }
const setup: ProductOperation[] = [
  { type: 'create_module', module: { id: 'a', title: 'A', contract } },
  { type: 'create_module', module: { id: 'b', title: 'B', contract } },
  { type: 'connect_modules', moduleId: 'b', dependencyId: 'a' },
  { type: 'record_decision', decision: { id: 'd', moduleId: 'a', question: 'Which?', alternatives: [], choice: 'A', rationale: 'Owner chose', prerequisites: [], evidenceRefs: [] } },
  { type: 'freeze_module', moduleId: 'a' },
  { type: 'freeze_module', moduleId: 'b' },
]
function approve(snapshot: SuoSnapshot, operations: ProductOperation[]) {
  const id = `p:${snapshot.revision}`
  return approveProposal(stageProposal(snapshot, { expectedRevision: snapshot.revision, kind: 'proposal', id, summary: 'Reviewed changes', operations }), id)
}
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function temporary() { const root = await realpath(await mkdtemp(join(tmpdir(), 'suo-revisions-'))); roots.push(root); return root }

it('binds all batch freezes to the approval commit, including compound operations and repeated freezes', () => {
  const initial = createProduct({ title: 'Test', idea: 'Test' })
  const first = approve(initial, setup)
  expect(first.revision).toBe(1)
  expect(first.handoffs.map(h => h.productRevision)).toEqual([1, 1])
  const next = approve(first, [
    { type: 'update_module', moduleId: 'a', patch: { title: 'Changed' } },
    { type: 'freeze_module', moduleId: 'a' },
    { type: 'update_module', moduleId: 'a', patch: { title: 'Changed again' } },
    { type: 'freeze_module', moduleId: 'a' },
    { type: 'freeze_module', moduleId: 'b' },
  ])
  expect(next.revision).toBe(2)
  expect(next.handoffs.map(h => h.productRevision)).toEqual([1, 1, 2, 2, 2])
  expect(next.handoffs.filter(h => h.moduleId === 'a').map(h => h.revision)).toEqual([1, 2, 3])
  expect(next.handoffs[2]!.frozenDefinition!.module.title).toBe('Changed')
  expect(next.handoffs[3]!.frozenDefinition!.module.title).toBe('Changed again')
  expect(first.handoffs.every(h => h.status === 'current')).toBe(true)
  expect(validateSnapshot(next)).toEqual([])
  expect(() => approve(first, [{ type: 'freeze_module', moduleId: 'missing' }])).toThrow()
  expect(initial.revision).toBe(0)
})

it('preserves standalone commits and pre-existing imported/legacy provenance without guessing', () => {
  const direct = freezeModule(createModule(createProduct({ title: 'T', idea: 'I' }), { id: 'a', title: 'A', contract }), 'a')
  expect(direct.handoffs[0]!.productRevision).toBe(direct.revision)
  direct.handoffs[0]!.productRevision = 99
  Reflect.deleteProperty(direct.handoffs[0]!, 'frozenDefinition')
  expect(() => approve(direct, [{ type: 'freeze_module', moduleId: 'a' }])).toThrow('invalid Suo snapshot')
})

it('round-trips repeated approvals through Vault history, compiled TS and repo-ts without renumbering', async () => {
  const vault = await temporary(), repo = await temporary()
  await initVault(vault, 'Test', 'Test')
  let snapshot = approve(await loadSnapshot(vault), setup)
  await saveSnapshot(snapshot, vault)
  const firstHistory = await readFile(join(vault, 'suo-history/0000000001.json'), 'utf8')
  for (let revision = 2; revision <= 3; revision++) {
    await compileVault(vault)
    const compiled = await loadAuthority(join(vault, '.suo/compiled'))
    expect(compiled).toEqual(await loadSnapshot(vault))
    await saveAuthority(compiled, repo)
    snapshot = approve(await loadSnapshot(repo), [
      { type: 'update_module', moduleId: 'a', patch: { contract: { ...contract, objective: `Feature ${revision}` } } },
      { type: 'freeze_module', moduleId: 'a' }, { type: 'freeze_module', moduleId: 'b' },
    ])
    await saveSnapshot(snapshot, repo)
    const exported = await loadSnapshot(repo)
    expect(exported.revision).toBe(revision)
    expect(exported.handoffs.filter(h => h.revision === revision).map(h => h.productRevision)).toEqual([revision, revision])
    // Rejoin this same Product's existing history with precisely its next commit;
    // this is not initialization of an unrelated Vault or a migration API.
    await saveSnapshot(exported, vault)
    expect((await loadSnapshot(vault)).handoffs).toEqual(exported.handoffs)
    await generateArtifacts(exported, repo)
    expect(await readFile(join(repo, `docs/suo/HANDOFFS/handoff_a_${revision}.md`), 'utf8')).toContain(`Product revision: ${revision}`)
  }
  expect(await readFile(join(vault, 'suo-history/0000000001.json'), 'utf8')).toBe(firstHistory)
  expect((await readVaultHistory(vault)).map(h => h.snapshot.revision)).toEqual([0, 1, 2, 3])
}, 30000)

it('records explicit corrections without changing frozen semantics or prior Vault history', async () => {
  const root = await temporary(), repo = await temporary()
  await initVault(root, 'Test', 'Test')
  const legacy = approve(await loadSnapshot(root), setup)
  legacy.handoffs[0]!.productRevision = 0
  await saveSnapshot(legacy, root)
  const beforeHistory = await readFile(join(root, 'suo-history/0000000001.json'), 'utf8')
  const correction: ProductOperation = { type: 'correct_handoff_product_revision', handoffId: 'handoff:a:1', expectedFrom: 0, to: 1, reason: 'Verified original batch commit', evidenceRefs: ['https://example.test/commit/fixed-evidence'] }
  const next = approve(await loadSnapshot(root), [correction])
  expect(next.handoffs[0]).toEqual({ ...legacy.handoffs[0], productRevision: 1, productRevisionCorrections: [{ from: 0, to: 1, reason: correction.reason, evidenceRefs: correction.evidenceRefs, proposalId: 'p:1', revision: 2, correctedAt: next.product.updatedAt }] })
  expect(next.handoffs[1]).toEqual(legacy.handoffs[1])
  await saveSnapshot(next, root)
  expect(await readFile(join(root, 'suo-history/0000000001.json'), 'utf8')).toBe(beforeHistory)
  await compileVault(root)
  await saveAuthority(await loadAuthority(join(root, '.suo/compiled')), repo)
  const loaded = await loadSnapshot(repo)
  expect(loaded.handoffs).toEqual(next.handoffs)
  expect(renderHandoff(loaded, loaded.handoffs[0]!, legacy)).toContain('0 → 1')
  expect(validateSnapshot(loaded)).toEqual([])
  const tampered = structuredClone(loaded)
  tampered.handoffs[0]!.productRevisionCorrections![0]!.to = 0
  expect(validateSnapshot(tampered).join()).toContain('correction chain')
  for (const patch of [{ revision: 999 }, { proposalId: 'missing' }, { correctedAt: '2000-01-01T00:00:00.000Z' }]) {
    const forged = structuredClone(loaded)
    Object.assign(forged.handoffs[0]!.productRevisionCorrections![0]!, patch)
    expect(validateSnapshot(forged).join()).toContain('correction chain')
  }
  const second = approve(loaded, [{ ...correction, expectedFrom: 1, to: 0 }])
  expect(second.handoffs[0]!.productRevisionCorrections).toHaveLength(2)
  expect(validateSnapshot(second)).toEqual([])
  const backwards = structuredClone(second)
  backwards.handoffs[0]!.productRevisionCorrections![1]!.revision = 1
  expect(validateSnapshot(backwards).join()).toContain('correction chain')
  expect(() => approve(next, [correction])).toThrow('stale')
  for (const patch of [{ to: 2 }, { to: -1 }, { to: 52 }, { to: 0.5 }, { reason: ' ' }, { evidenceRefs: [] }]) {
    expect(() => approve(legacy, [{ ...correction, ...patch }])).toThrow()
  }
  const initial = createProduct({ title: 'T', idea: 'I' })
  expect(() => approve(initial, [...setup, correction])).toThrow('previously committed')
})
