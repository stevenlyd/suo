import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { createProduct, createModule, freezeModule, startRealization, stageProposal, submitClosure, submitClosureEnvelope, acceptClosure, updateModule, approveProposal, proposeDecision, deferDecision } from '../src/core.js'
import { assertSubmission } from '../src/protocol.js'
import { validateSnapshot } from '../src/validation.js'
import { saveSnapshot, loadSnapshot } from '../src/store.js'
import { saveAuthority, loadAuthority } from '../src/source.js'
import type { ClosureSubmission, ProposalSubmission } from '../src/model.js'

const contract = { objective: 'Reply to a message', frozenBehavior: ['Reply appears'], scope: ['Replies'], nonGoals: ['Profiles'], acceptance: [{ id: 'visible', text: 'Reply is visible' }], requiredChecks: [{ id: 'reply-tests', description: 'Run reply regression tests' }], checkRationale: 'Regression tests cover reply persistence.' }
function fixture() {
  let s = createProduct({ title: 'Collaboration', idea: 'Independent delivery' })
  for (const id of ['replies', 'avatars']) { s = createModule(s, { id, title: id, contract }); s = freezeModule(s, id) }
  return startRealization(s, s.handoffs[0]!.id, { id: 'implementation', agent: 'Steven' })
}
const evidence = (): ClosureSubmission => ({ handoffRevision: 1, implementationRefs: [{ kind: 'commit', uri: 'https://example.test/commit/a', revision: 'a' }], deliveredBehavior: ['Reply appears'], acceptanceEvidence: [{ acceptanceId: 'visible', result: 'pass', evidence: ['https://example.test/observation/1'] }], checks: [{ id: 'reply-tests', revision: 'a', result: 'pass', evidenceRef: 'https://example.test/run/1' }], deviations: [], residualRisks: [], newProductQuestions: [] })
const proposal = (revision: number): ProposalSubmission => ({ kind: 'proposal', expectedRevision: revision, summary: 'Rename replies', operations: [{ type: 'update_module', moduleId: 'replies', patch: { title: 'Replies' } }] })

describe('strict untrusted protocol', () => {
  it.each([undefined, -1, 0.5, '4', NaN])('requires a valid observed revision (%s)', revision => {
    const s = fixture(), raw = { ...proposal(s.revision), expectedRevision: revision }
    expect(() => stageProposal(s, raw as ProposalSubmission)).toThrow()
    expect(s.proposals).toEqual([])
  })
  it('rejects malformed JSON, extra fields, every incomplete operation discriminator and API bypasses', () => {
    expect(() => assertSubmission(JSON.parse('{'))).toThrow()
    for (const type of ['create_module','update_module','delete_module','retire_module','connect_modules','disconnect_modules','record_decision','update_decision','delete_decision','approve_decision','defer_decision','reopen_decision','freeze_module','correct_handoff_product_revision','reopen_closure','unknown']) {
      const raw = JSON.parse(JSON.stringify({ ...proposal(0), operations: [{ type }] }))
      expect(() => assertSubmission(raw), type).toThrow()
    }
    const s = fixture()
    for (const raw of [{ ...proposal(s.revision), surprise: true }, { ...proposal(s.revision), operations: [{ type: 'update_module', moduleId: 'replies', patch: { title: 'x', hidden: true } }] }]) expect(() => stageProposal(s, raw as ProposalSubmission)).toThrow()
    expect(() => updateModule(s, 'replies', { title: 'x', hidden: true } as { title: string })).toThrow()
    expect(() => stageProposal(s, proposal(s.revision - 1))).toThrow('baseline conflict')
  })
  it('rejects missing closure baselines, stale versions and mismatched declared identities atomically', () => {
    const s = fixture(), before = structuredClone(s)
    const raw = evidence(); Reflect.deleteProperty(raw, 'handoffRevision')
    expect(() => submitClosure(s, 'implementation', raw)).toThrow('handoffRevision')
    expect(() => submitClosure(s, 'implementation', { ...evidence(), handoffRevision: 2 })).toThrow('baseline conflict')
    expect(() => submitClosureEnvelope(s, { kind: 'closure', handoffId: s.handoffs[0]!.id, agent: 'Quinn', submission: evidence() })).toThrow('declared agent')
    expect(s).toEqual(before)
  })
})

describe('frozen contracts and cross-record invariants', () => {
  it.each(['unknown','duplicate','missing','empty','whitespace','missing-check','duplicate-check','wrong-revision','empty-check'])('rejects incomplete evidence: %s', kind => {
    const s = fixture(), e = evidence()
    if (kind === 'unknown') e.acceptanceEvidence[0]!.acceptanceId = 'other'
    if (kind === 'duplicate') e.acceptanceEvidence.push(e.acceptanceEvidence[0]!)
    if (kind === 'missing') e.acceptanceEvidence = []
    if (kind === 'empty') e.acceptanceEvidence[0]!.evidence = []
    if (kind === 'whitespace') e.acceptanceEvidence[0]!.evidence = ['  ']
    if (kind === 'missing-check') e.checks = []
    if (kind === 'duplicate-check') e.checks.push(e.checks[0]!)
    if (kind === 'wrong-revision') e.checks[0]!.revision = 'other'
    if (kind === 'empty-check') e.checks[0]!.evidenceRef = ' '
    expect(() => submitClosure(s, 'implementation', e)).toThrow()
    expect(s.closures).toEqual([])
  })
  it('preserves failed observations for review but never accepts them', () => {
    const s = fixture(), e = evidence(); e.checks[0]!.result = 'fail'
    const submitted = submitClosure(s, 'implementation', e, { id: 'closure' })
    expect(() => acceptClosure(submitted, 'closure', 'Quinn')).toThrow('did not pass')
    expect(submitted.closures[0]!.status).toBe('submitted')
  })
  it('accepts complete evidence in both directions and validates against frozen acceptance', () => {
    for (const [agent, verifier] of [['Steven', 'Quinn'], ['Quinn', 'Steven']] as const) {
      const s = fixture(); s.realizations[0]!.agent = agent
      // The frozen contract remains authoritative even if a current draft differs.
      s.modules[0]!.definitionStatus = 'shaping'
      s.modules[0]!.contract = { ...contract, acceptance: [{ id: 'draft', text: 'Different future outcome' }] }
      const submitted = submitClosure(s, 'implementation', evidence(), { id: 'closure' })
      expect(acceptClosure(submitted, 'closure', verifier).closures[0]!.status).toBe('accepted')
    }
  })
  it('rejects canonical real-but-wrong links and incomplete old records', () => {
    for (const mutate of [
      (s: ReturnType<typeof fixture>) => { s.realizations[0]!.moduleId = 'avatars' },
      (s: ReturnType<typeof fixture>) => { s.realizations[0]!.handoffRevision = 2 },
      (s: ReturnType<typeof fixture>) => { s.handoffs[1]!.revision = s.handoffs[0]!.revision; s.handoffs[1]!.moduleId = 'replies' },
      (s: ReturnType<typeof fixture>) => { Reflect.deleteProperty(s.handoffs[0]!, 'frozenDefinition') },
      (s: ReturnType<typeof fixture>) => { Reflect.deleteProperty(s.modules[0]!.contract, 'requiredChecks') },
    ]) {
      const s = fixture(); mutate(s)
      expect(validateSnapshot(s).length).toBeGreaterThan(0)
      expect(() => stageProposal(s, proposal(s.revision))).toThrow()
    }
    const s = submitClosure(fixture(), 'implementation', evidence(), { id: 'closure' })
    s.closures[0]!.handoffId = s.handoffs[1]!.id
    expect(validateSnapshot(s).join()).toContain('closure does not match')
    expect(() => acceptClosure(s, 'closure', 'Quinn')).toThrow()
  })
  it('allows an explicitly justified empty check set but blocks an incomplete freeze', () => {
    let s = createModule(createProduct({ title: 'Manual', idea: 'Review prose' }), { id: 'prose', title: 'Prose', contract: { ...contract, requiredChecks: [], checkRationale: '' } })
    expect(() => freezeModule(s, 'prose')).toThrow('checkRationale')
    s = updateModule(s, 'prose', { contract: { ...contract, requiredChecks: [], checkRationale: 'This is a prose-only contract; manual observation supplies acceptance evidence.' } })
    expect(validateSnapshot(freezeModule(s, 'prose'))).toEqual([])
  })
})

it('round-trips check IDs/revisions and rejects malformed merged staging without partial writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suo-strict-'))
  try {
    const s = submitClosure(fixture(), 'implementation', evidence(), { id: 'closure' })
    await saveAuthority(s, root)
    const loaded = await loadAuthority(root)
    expect(loaded.closures[0]!.checks).toEqual(evidence().checks)
    const before = await readFile(join(root, 'suo/product.suo.ts'), 'utf8')
    const bad = structuredClone(s); bad.realizations[0]!.moduleId = 'avatars'
    await expect(saveAuthority(bad, root)).rejects.toThrow()
    expect(await readFile(join(root, 'suo/product.suo.ts'), 'utf8')).toBe(before)
    const staged = stageProposal(loaded, { ...proposal(loaded.revision), id: 'rename' })
    const approved = approveProposal(staged, 'rename')
    await mkdir(join(root, '.suo/staged'), { recursive: true })
    const malformed = { ...staged.proposals[0], id: 'malformed', operations: [{ type: 'update_module' }] }
    const raw = JSON.stringify([malformed]); await writeFile(join(root, '.suo/staged/proposals.json'), raw)
    await expect(saveSnapshot(approved, root)).rejects.toThrow()
    expect(await readFile(join(root, '.suo/staged/proposals.json'), 'utf8')).toBe(raw)
    expect(await readFile(join(root, 'suo/product.suo.ts'), 'utf8')).toBe(before)
    await expect(loadSnapshot(root)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
}, 20000)

it('rejects direct decision approval injection and forged accepted lifecycle', () => {
  const s = fixture()
  expect(() => proposeDecision(s, { id: 'd', moduleId: 'replies', question: 'Q', alternatives: [], prerequisites: [], evidenceRefs: [], status: 'approved', ownerChoice: 'A', rationale: 'R' } as never)).toThrow()
  const proposed = proposeDecision(s, { id: 'd', moduleId: 'replies', question: 'Q', alternatives: [], prerequisites: [], evidenceRefs: [] })
  expect(() => deferDecision(proposed, 'd', ' ')).toThrow()
  const submitted = submitClosure(s, 'implementation', evidence(), { id: 'closure' })
  const orphan = structuredClone(submitted); orphan.realizations[0]!.status = 'in_progress'; delete orphan.realizations[0]!.closureId
  expect(validateSnapshot(orphan).join()).toContain('submitted closure is not active')
  const accepted = acceptClosure(submitted, 'closure', 'Quinn')
  accepted.closures[0]!.newProductQuestions = ['Unresolved']
  expect(validateSnapshot(accepted).join()).toContain('Product reconciliation')
  const padded = fixture(); padded.realizations[0]!.agent = ' Steven '
  expect(validateSnapshot(padded).join()).toContain('noncanonical realization agent')
  const closed = fixture(); closed.handoffs[1]!.status = 'closed'
  expect(validateSnapshot(closed).join()).toContain('closed handoff')
})
