import { cp, access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  approveProposal,
  createModule,
  createProduct,
  freezeModule,
  stageProposal,
} from '../src/core.js'
import { generateArtifacts } from '../src/render.js'
import { loadAuthority, saveAuthority } from '../src/source.js'
import { loadSnapshot, saveSnapshot } from '../src/store.js'
import type { ModuleContract, SuoSnapshot } from '../src/model.js'

const contract: ModuleContract = {
  objective: 'Produce an observable outcome.',
  frozenBehavior: ['Behavior is explicit.'],
  scope: ['One outcome'],
  nonGoals: ['Implementation planning'],
  acceptance: [{ id: 'observable', text: 'The outcome can be observed.' }],
}

async function populatedProject(): Promise<{ root: string; snapshot: SuoSnapshot }> {
  const root = await mkdtemp(join(tmpdir(), 'suo-source-'))
  let snapshot = createProduct({ title: 'Imported graph', idea: 'Use TypeScript imports as authority.' }, { now: '2026-01-01T00:00:00.000Z', id: 'product:test' })
  snapshot = stageProposal(snapshot, {
    kind: 'proposal',
    id: 'proposal:graph',
    summary: 'Create an imported module graph',
    operations: [
      { type: 'create_module', module: { id: 'module:foundation', title: 'Foundation', contract } },
      { type: 'create_module', module: { id: 'module:feature', title: 'Feature', contract } },
      { type: 'connect_modules', moduleId: 'module:feature', dependencyId: 'module:foundation' },
    ],
  }, { now: '2026-01-01T00:01:00.000Z' })
  snapshot = approveProposal(snapshot, 'proposal:graph', { now: '2026-01-01T00:02:00.000Z' })
  await saveAuthority(snapshot, root)
  return { root, snapshot }
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

describe('TypeScript ontology authority', () => {
  // These integration cases compile the authority repeatedly; hosted runners need more than 5s.
  it('keeps each frozen handoff after approved edits, refreezing and a clean source copy', async () => {
    const { root } = await populatedProject()
    const clone = await mkdtemp(join(tmpdir(), 'suo-clean-'))
    try {
      let snapshot = await loadSnapshot(root)
      const apply = async (id: string, operations: import('../src/model.js').ProductOperation[]) => {
        snapshot = approveProposal(stageProposal(snapshot, { kind: 'proposal', id, summary: id, operations }), id)
        await saveSnapshot(snapshot, root)
        snapshot = await loadSnapshot(root)
      }
      await apply('proposal:freeze', [
        { type: 'freeze_module', moduleId: 'module:foundation' },
        { type: 'freeze_module', moduleId: 'module:feature' },
      ])
      await generateArtifacts(snapshot, root)
      const oldDigest = snapshot.handoffs.find(value => value.moduleId === 'module:foundation')!.contractDigest
      await apply('proposal:change', [
        { type: 'update_module', moduleId: 'module:foundation', patch: { title: 'Changed title', contract: { ...contract, objective: 'Changed objective' } } },
        { type: 'freeze_module', moduleId: 'module:foundation' },
        { type: 'freeze_module', moduleId: 'module:feature' },
      ])
      await cp(join(root, 'suo'), join(clone, 'suo'), { recursive: true })
      const loaded = await loadSnapshot(clone)
      await generateArtifacts(loaded, clone)
      const view = (module: string, revision: number) => readFile(join(clone, `docs/suo/HANDOFFS/handoff_module_${module}_${revision}.md`), 'utf8')
      expect(await view('foundation', 1)).toContain(contract.objective)
      expect(await view('foundation', 1)).not.toContain('Changed')
      expect(await view('foundation', 1)).toContain('Status: stale')
      expect(await view('foundation', 1)).toContain(oldDigest)
      expect(await view('foundation', 2)).toContain('Changed objective')
      expect(await view('feature', 1)).toContain(contract.objective)
      expect(await view('feature', 2)).not.toContain('Changed objective')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(clone, { recursive: true, force: true })
    }
  }, 30_000)

  it('loads legacy repo-ts handoffs without backfilling current definitions', async () => {
    const { root, snapshot } = await populatedProject()
    try {
      const legacy = freezeModule(snapshot, 'module:foundation')
      delete legacy.handoffs[0]!.frozenDefinition
      await saveAuthority(legacy, root)
      const loaded = await loadSnapshot(root)
      expect(loaded.handoffs[0]!.frozenDefinition).toBeUndefined()
      await generateArtifacts(loaded, root)
      const output = await readFile(join(root, 'docs/suo/HANDOFFS/handoff_module_foundation_1.md'), 'utf8')
      expect(output).toContain('Historical content unavailable')
      expect(output).not.toContain(contract.objective)
      expect((await loadSnapshot(root)).handoffs[0]!.frozenDefinition).toBeUndefined()
    } finally { await rm(root, { recursive: true, force: true }) }
  }, 30_000)

  it.each(['git', 'suo'])('initializes the exact target beneath an existing %s root', async (ancestorKind) => {
    const parent = await mkdtemp(join(tmpdir(), 'suo-init-boundary-'))
    const root = join(parent, 'child')
    await mkdir(root)
    const parentSnapshot = createProduct({ title: 'Parent', idea: 'Keep the parent unchanged.' })
    const childSnapshot = createProduct({ title: 'Child', idea: 'Initialize only the selected directory.' })
    try {
      if (ancestorKind === 'git') await mkdir(join(parent, '.git'))
      else await saveAuthority(parentSnapshot, parent)
      const parentBefore = ancestorKind === 'suo'
        ? await readFile(join(parent, 'suo/product.suo.ts'), 'utf8')
        : undefined

      await saveSnapshot(childSnapshot, root, { initialize: true })

      expect((await loadAuthority(root)).product.id).toBe(childSnapshot.product.id)
      if (parentBefore !== undefined) {
        expect(await readFile(join(parent, 'suo/product.suo.ts'), 'utf8')).toBe(parentBefore)
      } else {
        expect(await exists(join(parent, 'suo'))).toBe(false)
      }
      expect(await exists(join(parent, '.suo'))).toBe(false)
      expect((await loadSnapshot(root)).product.id).toBe(childSnapshot.product.id)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('persists nodes as imported TypeScript resources without an authority JSON snapshot', async () => {
    const { root, snapshot } = await populatedProject()
    const feature = await readFile(join(root, 'suo/modules/feature.suo.ts'), 'utf8')
    const product = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')

    expect(feature).toContain('import dependency0 from "./foundation.suo.js"')
    expect(feature).toContain('"dependencies": [\n    dependency0')
    expect(product).toContain('import module0 from "./modules/feature.suo.js"')
    expect(await exists(join(root, '.suo/suo.json'))).toBe(false)
    expect((await loadAuthority(root)).revision).toBe(snapshot.revision)
  })

  it('loads Markdown through a mandatory TypeScript import and preserves its digest', async () => {
    const { root } = await populatedProject()
    const modulePath = join(root, 'suo/modules/feature.suo.ts')
    const markdownPath = join(root, 'docs/feature-objective.md')
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(markdownPath, 'A Markdown-owned objective.\n', 'utf8')
    const source = await readFile(modulePath, 'utf8')
    await writeFile(modulePath, source
      .replace('import type { ModuleNode }', 'import objective from "../../docs/feature-objective.md"\nimport type { ModuleNode }')
      .replace('"objective": "Produce an observable outcome."', '"objective": objective'), 'utf8')

    const loaded = await loadAuthority(root)
    const objective = loaded.modules.find(value => value.id === 'module:feature')!.contract.objective
    expect(objective).toMatchObject({ kind: 'markdown', path: 'docs/feature-objective.md' })
    expect(typeof objective === 'string' ? objective : objective.content).toBe('A Markdown-owned objective.\n')
    await saveAuthority(loaded, root)
    expect(await readFile(modulePath, 'utf8')).toContain('import objective from "../../docs/feature-objective.md"')
    expect(await readFile(markdownPath, 'utf8')).toBe('A Markdown-owned objective.\n')
  })

  it('rejects missing Markdown imports and string graph references', async () => {
    const { root } = await populatedProject()
    const featurePath = join(root, 'suo/modules/feature.suo.ts')
    const source = await readFile(featurePath, 'utf8')
    await writeFile(featurePath, source.replace('dependency0\n  ]', '"module:foundation"\n  ]'), 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/not assignable|ModuleNode/)

    await writeFile(featurePath, source
      .replace('import type { ModuleNode }', 'import objective from "../content/missing.md"\nimport type { ModuleNode }')
      .replace('"objective": "Produce an observable outcome."', '"objective": objective'), 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/Cannot find module|Could not resolve|ENOENT/)
  })

  it('rejects executable or computed TypeScript sources before loading them', async () => {
    const { root } = await populatedProject()
    const featurePath = join(root, 'suo/modules/feature.suo.ts')
    const source = await readFile(featurePath, 'utf8')
    await writeFile(featurePath, source.replace('"objective": "Produce an observable outcome."', '"objective": true ? "first" : "second"'), 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/not declarative|computed values/)
  })

  it('rejects shadow imports that reuse a canonical node id', async () => {
    const { root } = await populatedProject()
    const canonicalPath = join(root, 'suo/modules/foundation.suo.ts')
    const shadowPath = join(root, 'suo/shadows/foundation.suo.ts')
    await mkdir(dirname(shadowPath), { recursive: true })
    await writeFile(shadowPath, (await readFile(canonicalPath, 'utf8')).replace('"title": "Foundation"', '"title": "Shadow foundation"'), 'utf8')
    const featurePath = join(root, 'suo/modules/feature.suo.ts')
    await writeFile(featurePath, (await readFile(featurePath, 'utf8')).replace('./foundation.suo.js', '../shadows/foundation.suo.js'), 'utf8')
    const productPath = join(root, 'suo/product.suo.ts')
    await writeFile(productPath, `import shadow from "./shadows/foundation.suo.js"\n${await readFile(productPath, 'utf8')}`, 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/canonical rooted node/)
  })

  it('rejects Markdown imports outside the project root', async () => {
    const { root } = await populatedProject()
    const modulePath = join(root, 'suo/modules/feature.suo.ts')
    const outside = join(dirname(root), `${root.split(sep).at(-1)!}-outside.md`)
    await writeFile(outside, 'outside\n', 'utf8')
    let importPath = relative(dirname(modulePath), outside).split(sep).join('/')
    if (!importPath.startsWith('.')) importPath = `./${importPath}`
    const source = await readFile(modulePath, 'utf8')
    await writeFile(modulePath, source
      .replace('import type { ModuleNode }', `import objective from ${JSON.stringify(importPath)}\nimport type { ModuleNode }`)
      .replace('"objective": "Produce an observable outcome."', '"objective": objective'), 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/inside the project root/)
  })

  it('rejects Markdown symlinks that resolve outside the project root', async () => {
    const { root } = await populatedProject()
    const outside = join(dirname(root), `${root.split(sep).at(-1)!}-symlink-target.md`)
    const linked = join(root, 'docs/linked-objective.md')
    await writeFile(outside, 'outside through symlink\n', 'utf8')
    await mkdir(dirname(linked), { recursive: true })
    await symlink(outside, linked)
    const modulePath = join(root, 'suo/modules/feature.suo.ts')
    const source = await readFile(modulePath, 'utf8')
    await writeFile(modulePath, source
      .replace('import type { ModuleNode }', 'import objective from "../../docs/linked-objective.md"\nimport type { ModuleNode }')
      .replace('"objective": "Produce an observable outcome."', '"objective": objective'), 'utf8')
    await expect(loadAuthority(root)).rejects.toThrow(/outside the project root/)
  })

  it('persists colliding readable filename stems without corrupting the graph', async () => {
    const { root, snapshot: initial } = await populatedProject()
    let snapshot = createModule(initial, { id: 'module:a:b', title: 'Colon', contract }, { now: '2026-01-01T00:03:00.000Z' })
    snapshot = createModule(snapshot, { id: 'module:a-b', title: 'Dash', contract }, { now: '2026-01-01T00:04:00.000Z' })
    await saveAuthority(snapshot, root)
    const loaded = await loadAuthority(root)
    expect(loaded.modules.filter(value => value.id === 'module:a:b' || value.id === 'module:a-b').map(value => value.id).sort()).toEqual(['module:a-b', 'module:a:b'])
  })

  it('persists supersession as an imported decision edge', async () => {
    const { root, snapshot } = await populatedProject()
    snapshot.decisions.push({ id: 'decision:original', moduleId: 'module:foundation', question: 'Original?', status: 'superseded', alternatives: [], prerequisites: [], evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:01:00.000Z' })
    snapshot.decisions.push({ id: 'decision:successor', moduleId: 'module:foundation', question: 'Successor?', status: 'open', alternatives: [], prerequisites: [], evidenceRefs: [], supersedes: 'decision:original', createdAt: '2026-01-01T00:01:00.000Z', updatedAt: '2026-01-01T00:01:00.000Z' })
    await saveAuthority(snapshot, root)
    const successor = await readFile(join(root, 'suo/decisions/successor.suo.ts'), 'utf8')
    expect(successor).toContain('import supersededDecision from "./original.suo.js"')
    expect(successor).toContain('"supersedes": supersededDecision')
    expect((await loadAuthority(root)).decisions.find(value => value.id === 'decision:successor')?.supersedes).toBe('decision:original')
  })

  it('makes an active handoff stale when imported Markdown changes', async () => {
    const { root } = await populatedProject()
    const modulePath = join(root, 'suo/modules/feature.suo.ts')
    const markdownPath = join(root, 'suo/content/feature-objective.md')
    await mkdir(dirname(markdownPath), { recursive: true })
    await writeFile(markdownPath, 'First objective.\n', 'utf8')
    const source = await readFile(modulePath, 'utf8')
    await writeFile(modulePath, source
      .replace('import type { ModuleNode }', 'import objective from "../content/feature-objective.md"\nimport type { ModuleNode }')
      .replace('"objective": "Produce an observable outcome."', '"objective": objective'), 'utf8')
    let snapshot = await loadAuthority(root)
    snapshot = freezeModule(snapshot, 'module:foundation', { now: '2026-01-01T00:02:30.000Z' })
    snapshot = freezeModule(snapshot, 'module:feature', { now: '2026-01-01T00:03:00.000Z' })
    await saveAuthority(snapshot, root)
    await writeFile(markdownPath, 'Changed objective.\n', 'utf8')
    const changed = await loadAuthority(root)
    expect(changed.modules.find(value => value.id === 'module:feature')?.definitionStatus).toBe('shaping')
    expect(changed.handoffs.find(value => value.moduleId === 'module:feature')?.status).toBe('stale')
    await saveAuthority(changed, root)
    await generateArtifacts(await loadSnapshot(root), root)
    const output = await readFile(join(root, 'docs/suo/HANDOFFS/handoff_module_feature_1.md'), 'utf8')
    expect(output).toContain('First objective.')
    expect(output).not.toContain('Changed objective.')
  })

  it('does not change authority when transient staging fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suo-stage-failure-'))
    const initial = createProduct({ title: 'Failure isolation', idea: 'Keep authority unchanged.' }, { now: '2026-01-01T00:00:00.000Z', id: 'product:failure' })
    await saveSnapshot(initial, root, { initialize: true })
    const authorityBefore = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')
    await mkdir(join(root, '.suo/staged/proposals.json'), { recursive: true })
    const staged = stageProposal(initial, { kind: 'proposal', id: 'proposal:failure', summary: 'Must remain transient', operations: [{ type: 'create_module', module: { id: 'module:nope', title: 'Nope' } }] })
    await expect(saveSnapshot(staged, root)).rejects.toThrow()
    expect(await readFile(join(root, 'suo/product.suo.ts'), 'utf8')).toBe(authorityBefore)
  })

  it('refuses a second writer while the project write lock is held', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suo-lock-'))
    const initial = createProduct({ title: 'Locked', idea: 'Serialize writers.' }, { now: '2026-01-01T00:00:00.000Z', id: 'product:lock' })
    await saveSnapshot(initial, root, { initialize: true })
    const lock = join(root, '.suo/write.lock')
    await writeFile(lock, 'other writer\n', 'utf8')
    await expect(saveSnapshot(initial, root)).rejects.toThrow(/another Suo writer/)
    await rm(lock)
    await saveSnapshot(initial, root)
  })

  it('merges concurrent same-revision proposal submissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suo-concurrent-proposals-'))
    const initial = createProduct({ title: 'Concurrent', idea: 'Keep both proposals.' }, { now: '2026-01-01T00:00:00.000Z', id: 'product:concurrent' })
    await saveSnapshot(initial, root, { initialize: true })
    const left = stageProposal(await loadSnapshot(root), { kind: 'proposal', id: 'proposal:left', summary: 'Left', operations: [{ type: 'create_module', module: { id: 'module:left', title: 'Left' } }] }, { now: '2026-01-01T00:01:00.000Z' })
    const right = stageProposal(await loadSnapshot(root), { kind: 'proposal', id: 'proposal:right', summary: 'Right', operations: [{ type: 'create_module', module: { id: 'module:right', title: 'Right' } }] }, { now: '2026-01-01T00:02:00.000Z' })
    await saveSnapshot(left, root)
    await saveSnapshot(right, root)
    expect((await loadSnapshot(root)).proposals.map(value => value.id).sort()).toEqual(['proposal:left', 'proposal:right'])
  })

  it('discovers the project root from nested directories and keeps pending proposals transient', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suo-root-'))
    const nested = join(root, 'packages/app/src')
    await mkdir(nested, { recursive: true })
    const initial = createProduct({ title: 'Root discovery', idea: 'Find the project root.' }, { now: '2026-01-01T00:00:00.000Z', id: 'product:root' })
    await saveSnapshot(initial, root, { initialize: true })
    const authorityBefore = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')
    const staged = stageProposal(initial, { kind: 'proposal', id: 'proposal:pending', summary: 'Pending only', operations: [{ type: 'create_module', module: { id: 'module:pending', title: 'Pending' } }] }, { now: '2026-01-01T00:01:00.000Z' })
    expect(staged.revision).toBe(initial.revision)
    await saveSnapshot(staged, nested)

    expect((await loadSnapshot(nested)).proposals.some(value => value.id === 'proposal:pending')).toBe(true)
    expect(await readFile(join(root, 'suo/product.suo.ts'), 'utf8')).toBe(authorityBefore)
    expect(await exists(join(root, '.suo/staged/proposals.json'))).toBe(true)
    expect(await exists(join(root, 'packages/app/src/suo'))).toBe(false)
  })
})
