import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveProposal, createProduct, stageProposal } from '../src/core.js'
import { knowledgeStore } from '../src/knowledge-store.js'
import { loadSnapshot, saveSnapshot } from '../src/store.js'
import { findProjectRoot } from '../src/source.js'
import { generateArtifacts } from '../src/render.js'
import { adoptVaultNote, approveVaultDraft, compileVault, initVault, readVaultDraft, readVaultHistory, recoverVault } from '../src/vault.js'
import { begin, end, hash } from '../src/vault-notes.js'
import type { ProductOperation, SuoSnapshot } from '../src/model.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function temporary(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'suo-vault-')); roots.push(root); return root }
async function vault(): Promise<string> { const root = await temporary(); await initVault(root, 'A notebook-owned product', 'Notebook'); return root }
async function note(root: string, path = 'Feature.md'): Promise<string> {
  await writeFile(join(root, path), '---\ntags: [personal]\n---\n# My research\n\nKeep this [[ordinary link]].\n')
  return adoptVaultNote(root, path, 'module')
}
async function approveNotes(root: string): Promise<SuoSnapshot> { return approveVaultDraft(root, (await readVaultDraft(root)).token) }
async function operations(root: string, ops: ProductOperation[], legacy = false): Promise<SuoSnapshot> {
  let snapshot = await loadSnapshot(root)
  const id = `proposal:test-${snapshot.revision}`
  snapshot = stageProposal(snapshot, { expectedRevision: snapshot.revision, kind: 'proposal', id, summary: 'Reviewed test proposal', operations: ops })
  await saveSnapshot(snapshot, root)
  snapshot = approveProposal(await loadSnapshot(root), id)
  if (legacy) for (const handoff of snapshot.handoffs) Reflect.deleteProperty(handoff, 'frozenDefinition')
  await saveSnapshot(snapshot, root)
  return loadSnapshot(root)
}
const contract = { objective: 'Original objective', frozenBehavior: ['Original behavior'], scope: ['Feature'], nonGoals: ['Other features'], requiredChecks: [], checkRationale: 'Manual observation suffices for this fixture.', acceptance: [{ id: 'observed', text: 'Observable result' }] }

describe('stateless knowledge-store adapters', () => {
  it('switches between projects and adapters without global state', async () => {
    const a = await vault(), b = await vault(), ts = await temporary()
    await saveSnapshot(createProduct({ title: 'Repo', idea: 'TS authority' }), ts, { initialize: true })
    const id = await note(a)
    await approveNotes(a)
    expect((await loadSnapshot(a)).modules[0]!.id).toBe(id)
    expect((await loadSnapshot(b)).modules).toEqual([])
    expect((await loadSnapshot(ts)).product.title).toBe('Repo')
    expect((await knowledgeStore(a)).kind).toBe('obsidian')
    expect((await knowledgeStore(ts)).kind).toBe('repo-ts')
    await mkdir(join(a, 'nested'))
    expect(await findProjectRoot(join(a, 'nested'))).toBe(a)
  }, 20000)

  it('enrolls in place, reviews drafts and writes proposals without losing personal content', async () => {
    const root = await vault(), id = await note(root)
    const draft = await readVaultDraft(root)
    expect(draft.changed).toBe(true)
    expect(draft.snapshot.modules[0]!.dependencies).toEqual([])
    await expect(loadSnapshot(root)).rejects.toThrow('unapproved')
    await approveVaultDraft(root, draft.token)
    await operations(root, [{ type: 'update_module', moduleId: id, patch: { title: 'New title', contract } }])
    const content = await readFile(join(root, 'Feature.md'), 'utf8')
    expect(content).toContain('Keep this [[ordinary link]].')
    expect(content).toContain('personal')
    expect(content).toContain('Original objective')
    expect((await readVaultDraft(root)).changed).toBe(false)
  })

  it('rejects stale review digests even when only unrelated prose changed', async () => {
    const root = await vault(); await note(root)
    const draft = await readVaultDraft(root)
    await writeFile(join(root, 'Feature.md'), (await readFile(join(root, 'Feature.md'), 'utf8')) + '\nNew research.\n')
    await expect(approveVaultDraft(root, draft.token)).rejects.toThrow('stale')
    expect((await readVaultHistory(root)).length).toBe(1)
  })

  it('keeps identity on rename and rejects missing or duplicate identities', async () => {
    const root = await vault(), id = await note(root)
    await approveNotes(root)
    await rename(join(root, 'Feature.md'), join(root, 'Renamed.md'))
    expect((await readVaultDraft(root)).changed).toBe(false)
    expect((await loadSnapshot(root)).modules[0]!.id).toBe(id)
    const content = await readFile(join(root, 'Renamed.md'), 'utf8')
    await writeFile(join(root, 'Copy.md'), content)
    await expect(readVaultDraft(root)).rejects.toThrow('duplicate')
    await rm(join(root, 'Copy.md')); await rm(join(root, 'Renamed.md'))
    await expect(readVaultDraft(root)).rejects.toThrow('missing enrolled')
  })

  it('rejects changing an enrolled node kind instead of duplicating its identity', async () => {
    const root = await vault(); await note(root); await approveNotes(root)
    const path = join(root, 'Feature.md')
    await writeFile(path, (await readFile(path, 'utf8')).replace('suo_kind: module', 'suo_kind: decision'))
    await expect(readVaultDraft(root)).rejects.toThrow(/identity prefix|kind cannot change|unsupported or lifecycle-controlled/)
  })

  it('resolves only explicit typed wikilinks and rejects ambiguous links and cycles', async () => {
    const root = await vault(), first = await note(root, 'First.md'), second = await note(root, 'Second.md')
    let raw = await readFile(join(root, 'Second.md'), 'utf8')
    raw = raw.replace('suo_kind: module', 'suo_kind: module\nsuo_dependencies: ["[[First]]"]')
    await writeFile(join(root, 'Second.md'), raw)
    expect((await readVaultDraft(root)).snapshot.modules.find(m => m.id === second)!.dependencies).toEqual([first])
    await mkdir(join(root, 'Other')); await note(root, 'Other/First.md')
    await expect(readVaultDraft(root)).rejects.toThrow('ambiguous')
    await rm(join(root, 'Other'), { recursive: true })
    await writeFile(join(root, 'First.md'), (await readFile(join(root, 'First.md'), 'utf8')).replace('suo_kind: module', 'suo_kind: module\nsuo_dependencies: ["[[Second]]"]'))
    await expect(readVaultDraft(root)).rejects.toThrow(/cycle|DAG/)
  })

  it('writes unambiguous relative links when a root note shares its basename', async () => {
    const root = await vault(), first = await note(root, 'First.md'), second = await note(root, 'Second.md')
    await mkdir(join(root, 'Other')); await note(root, 'Other/First.md')
    await approveNotes(root)
    await operations(root, [{ type: 'connect_modules', moduleId: second, dependencyId: first }])
    expect((await readVaultDraft(root)).changed).toBe(false)
    expect((await loadSnapshot(root)).modules.find(m => m.id === second)!.dependencies).toEqual([first])
  })

  it('does not accept handwritten lifecycle or unknown Suo fields', async () => {
    const root = await vault(); await note(root)
    const path = join(root, 'Feature.md'), raw = await readFile(path, 'utf8')
    for (const field of ['suo_status: accepted', 'suo_definition_status: frozen', 'suo_typo: value']) {
      await writeFile(path, raw.replace('suo_kind: module', `suo_kind: module\n${field}`))
      await expect(readVaultDraft(root)).rejects.toThrow('unsupported or lifecycle-controlled')
    }
  })

  it('preserves frozen handoff content after a new approved definition', async () => {
    const root = await vault(), id = await note(root)
    await approveNotes(root)
    let frozen = await operations(root, [{ type: 'update_module', moduleId: id, patch: { contract } }, { type: 'freeze_module', moduleId: id }])
    const originalRevision = frozen.revision, handoff = frozen.handoffs[0]!
    const path = join(root, 'Feature.md')
    await writeFile(path, (await readFile(path, 'utf8')).replace('Original objective', 'New objective'))
    const draft = await readVaultDraft(root)
    expect(draft.snapshot.handoffs[0]!.status).toBe('stale')
    expect((await readVaultHistory(root))[originalRevision]!.snapshot.handoffs[0]!.status).toBe('current')
    await approveVaultDraft(root, draft.token)
    frozen = await loadSnapshot(root)
    await generateArtifacts(frozen, root)
    const output = await readFile(join(root, 'docs/suo/HANDOFFS', `${handoff.id.replaceAll(':', '_')}.md`), 'utf8')
    expect(output).toContain('Original objective')
    expect(output).not.toContain('New objective')
    expect(output).toContain('Status: stale')
  })

  it('rejects incomplete historical authority without modifying Vault history', async () => {
    const root = await vault(), id = await note(root)
    await approveNotes(root)
    const before = await readVaultHistory(root)
    await expect(operations(root, [
      { type: 'update_module', moduleId: id, patch: { contract } },
      { type: 'freeze_module', moduleId: id },
    ], true)).rejects.toThrow('frozenDefinition')
    expect(await readVaultHistory(root)).toEqual(before)
  })

  it('supports decision notes but requires reopening approved decisions before editing', async () => {
    const root = await vault(), moduleId = await note(root)
    await writeFile(join(root, 'Choice.md'), '# Research\n')
    const id = await adoptVaultNote(root, 'Choice.md', 'decision', '[[Feature]]')
    await approveNotes(root)
    expect((await loadSnapshot(root)).decisions[0]).toMatchObject({ id, moduleId, status: 'proposed' })
    await operations(root, [{ type: 'approve_decision', decisionId: id, choice: 'A', rationale: 'Evidence' }])
    const path = join(root, 'Choice.md')
    await writeFile(path, (await readFile(path, 'utf8')).replace(`${begin}\nChoice`, `${begin}\nChanged question`))
    await expect(readVaultDraft(root)).rejects.toThrow('reopened')
  })

  it('round-trips Agent-created approved decisions including optional recommendations', async () => {
    const root = await vault(), moduleId = await note(root); await approveNotes(root)
    await operations(root, [{ type: 'record_decision', decision: {
      id: 'decision:recommended', moduleId, question: 'Which direction?',
      alternatives: [{ id: 'a', label: 'A' }], recommendation: 'A', choice: 'A', rationale: 'Evidence',
      prerequisites: [], evidenceRefs: [],
    } }])
    expect((await readVaultDraft(root)).changed).toBe(false)
    expect((await loadSnapshot(root)).decisions[0]).toMatchObject({ status: 'approved', recommendation: 'A' })
  })

  it('rebuilds disposable TS after cache deletion without changing authority', async () => {
    const root = await vault(); await note(root); await approveNotes(root)
    const before = await loadSnapshot(root)
    await rm(join(root, '.suo'), { recursive: true, force: true })
    const result = await compileVault(root)
    expect(await readFile(result.generated, 'utf8')).toContain('import module0')
    await writeFile(result.generated, 'broken generated TS')
    expect(await loadSnapshot(root)).toEqual(before)
    await compileVault(root)
  }, 20000)

  it('detects history edits and missing history instead of reconstructing approval', async () => {
    const root = await vault(); await note(root); await approveNotes(root)
    const path = join(root, 'suo-history/0000000000.json')
    const raw = await readFile(path, 'utf8')
    await writeFile(path, raw.replace('A notebook-owned product', 'Changed history'))
    await expect(loadSnapshot(root)).rejects.toThrow('integrity')
    await writeFile(path, raw); await rm(path)
    await expect(loadSnapshot(root)).rejects.toThrow('gap')
  })

  it('detaches explicit draft deletions without deleting the personal note', async () => {
    const root = await vault(), id = await note(root); await approveNotes(root)
    await operations(root, [{ type: 'delete_module', moduleId: id }])
    expect((await loadSnapshot(root)).modules).toEqual([])
    const raw = await readFile(join(root, 'Feature.md'), 'utf8')
    expect(raw).toContain('Keep this [[ordinary link]].')
    expect(raw).not.toContain('suo_id:')
  })

  it('fails closed on interrupted writes and recovers without overwriting outside edits', async () => {
    const root = await vault(); await note(root); await approveNotes(root)
    const head = (await readVaultHistory(root)).at(-1)!
    const snapshot = structuredClone(head.snapshot); snapshot.revision++
    const payload = { format: 1, previous: head.digest, snapshot }
    const record = { ...payload, digest: hash(JSON.stringify(payload)) }
    const before = await readFile(join(root, 'Feature.md'), 'utf8'), after = before + '\npartially written\n'
    const journal = { format: 1, revision: snapshot.revision, record, writes: [{ path: 'Feature.md', before, after }] }
    await writeFile(join(root, 'suo-history/transaction.json'), JSON.stringify(journal))
    await writeFile(join(root, 'Feature.md'), 'External concurrent edit')
    await expect(loadSnapshot(root)).rejects.toThrow('interrupted')
    await expect(recoverVault(root)).rejects.toThrow('recovery conflict')
    await writeFile(join(root, 'Feature.md'), after)
    expect(await recoverVault(root)).toContain('Rolled back')
    expect(await readFile(join(root, 'Feature.md'), 'utf8')).toBe(before)
    expect((await loadSnapshot(root)).revision).toBe(head.snapshot.revision)
  })

  it('rejects escaping paths, symlink enrollment and mixed authority modes', async () => {
    const root = await vault(), outside = await temporary()
    await writeFile(join(outside, 'Outside.md'), '# External')
    await symlink(join(outside, 'Outside.md'), join(root, 'Link.md'))
    await expect(adoptVaultNote(root, 'Link.md', 'module')).rejects.toThrow('symlink')
    await expect(adoptVaultNote(root, '../outside.md', 'module')).rejects.toThrow('inside')
    await mkdir(join(root, 'suo')); await writeFile(join(root, 'suo/product.suo.ts'), 'not authority')
    await expect(knowledgeStore(root)).rejects.toThrow('ambiguous authority')
  })

  it('ignores unrelated malformed YAML and preserves source text outside the managed region', async () => {
    const root = await vault(); await note(root)
    await writeFile(join(root, 'Personal.md'), '---\nbroken: [\n---\nUnrelated')
    await approveNotes(root)
    const raw = await readFile(join(root, 'Feature.md'), 'utf8')
    expect(raw).toContain(`${begin}\n\n${end}`)
    expect((await loadSnapshot(root)).modules).toHaveLength(1)
  })
})
