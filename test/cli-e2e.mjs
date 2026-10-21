import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'suo-cli-'))
const clone = await mkdtemp(join(tmpdir(), 'suo-cli-clone-'))
const cli = process.env.SUO_TEST_CLI ?? resolve('dist/cli.js')
const run = (project, ...args) => execFileSync(process.execPath, [cli, ...args, '--root', project], { encoding: 'utf8' })
const contract = { objective: 'Original CLI objective', frozenBehavior: ['Original behavior'], scope: ['Feature'], nonGoals: ['Other features'], requiredChecks: [], checkRationale: 'Manual CLI observation is the acceptance check.', acceptance: [{ id: 'observable', text: 'Observable outcome' }] }
try {
  run(root, 'init', root, '--idea', 'CLI regression')
  const approve = async (id, operations) => {
    const path = join(root, 'proposal.json')
    await writeFile(path, JSON.stringify({ kind: 'proposal', expectedRevision: JSON.parse(run(root, 'inspect')).revision, id, summary: id, operations }))
    run(root, 'submit', path)
    run(root, 'approve', id, '--yes')
  }
  const before = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')
  for (const raw of ['{', JSON.stringify({ kind: 'proposal', summary: 'Missing baseline', operations: [{ type: 'freeze_module' }] })]) {
    const invalid = join(root, 'invalid.json'); await writeFile(invalid, raw)
    assert.throws(() => run(root, 'submit', invalid))
    assert.equal(await readFile(join(root, 'suo/product.suo.ts'), 'utf8'), before)
  }
  const snapshotPath = join(root, 'snapshot.json')
  const inspected = JSON.parse(run(root, 'inspect'))
  const snapshot = { schemaVersion: 3, revision: inspected.revision, product: inspected.product, modules: [], decisions: [], proposals: [], handoffs: [], realizations: [], closures: [] }
  await writeFile(snapshotPath, JSON.stringify(snapshot))
  assert.equal(JSON.parse(run(root, 'diagnose', snapshotPath)).status, 'valid')
  const badSnapshot = JSON.stringify({ ...snapshot, extra: true })
  await writeFile(snapshotPath, badSnapshot)
  assert.throws(() => run(root, 'diagnose', snapshotPath))
  assert.equal(await readFile(snapshotPath, 'utf8'), badSnapshot)
  await approve('proposal:first' , [
    { type: 'create_module', module: { id: 'module:feature', title: 'Feature', contract } },
    { type: 'freeze_module', moduleId: 'module:feature' },
  ])
  await approve('proposal:second', [
    { type: 'update_module', moduleId: 'module:feature', patch: { contract: { ...contract, objective: 'New CLI objective' } } },
    { type: 'freeze_module', moduleId: 'module:feature' },
  ])
  await cp(join(root, 'suo'), join(clone, 'suo'), { recursive: true })
  run(clone, 'check')
  const path = () => join(clone, 'docs/suo/HANDOFFS/handoff_module_feature.md')
  const first = await readFile(path(), 'utf8')
  assert.match(first, /New CLI objective/)
  assert.doesNotMatch(first, /Original CLI objective/)
  assert.match(first, /Status: current/)
  await rm(join(clone, 'docs'), { recursive: true })
  run(clone, 'check')
  assert.equal(await readFile(path(1), 'utf8'), first)
  console.log('CLI E2E passed: init → approve/freeze → change/refreeze → clean copy → regenerate twice')
} finally {
  await rm(root, { recursive: true, force: true })
  await rm(clone, { recursive: true, force: true })
}
