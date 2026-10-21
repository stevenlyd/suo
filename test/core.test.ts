import { describe, expect, it } from 'vitest'
import {
  acceptClosure,
  approveProposal,
  approveDecision,
  connectModules,
  createModule,
  createProduct,
  deleteDraftModule,
  freezeModule,
  nextAction,
  proposeDecision,
  rejectClosure,
  reopenDecision,
  stageProposal,
  startRealization,
  submitClosure,
  updateModule,
  validateInvariants,
} from '../src/core.js'
import type { ClosureSubmission, ModuleContract, SuoSnapshot } from '../src/model.js'
import { validateSnapshot } from '../src/validation.js'

const time = '2026-08-30T00:00:00.000Z'
const contract = (prefix: string): ModuleContract => ({
  objective: `${prefix} objective`,
  frozenBehavior: [`${prefix} behavior`],
  scope: [`${prefix} scope`],
  nonGoals: [`${prefix} non-goal`],
  requiredChecks: [{ id: 'tests', description: 'Fixture tests' }], checkRationale: 'Manual observation suffices for this fixture.', acceptance: [{ id: `${prefix}-acceptance`, text: `${prefix} works` }],
})

function product(): SuoSnapshot {
  return createProduct({ id: 'product:test', title: 'Test product', idea: 'I have an idea' }, { now: time })
}

function frozenModule(): SuoSnapshot {
  let snapshot = product()
  snapshot = createModule(snapshot, { id: 'module:a', title: 'Module A', contract: contract('a') }, { now: time })
  snapshot = proposeDecision(snapshot, {
    id: 'decision:a', moduleId: 'module:a', question: 'Choose behavior?', alternatives: [{ id: 'option:a', label: 'A' }],
    recommendation: 'A', prerequisites: [], evidenceRefs: [],
  }, { now: time })
  snapshot = approveDecision(snapshot, 'decision:a', { choice: 'A', rationale: 'Smallest coherent behavior.' }, { now: time })
  return freezeModule(snapshot, 'module:a', { now: time })
}

const closure = (): ClosureSubmission => ({
  handoffRevision: 1,
  implementationRefs: [{ kind: 'commit', uri: 'https://example.test/commit/abc', revision: 'abc' }],
  deliveredBehavior: ['a behavior'],
  acceptanceEvidence: [{ acceptanceId: 'a-acceptance', evidence: ['pnpm test: pass'], result: 'pass' }],
  checks: [{ id: 'tests', revision: 'abc', command: 'pnpm test', result: 'pass', evidenceRef: 'run:1' }],
  deviations: [], residualRisks: [], newProductQuestions: [],
})

describe('Suo', () => {
  it('turns an idea into exactly one next action', () => {
    const snapshot = product()
    expect(nextAction(snapshot)).toMatchObject({ type: 'clarify_idea' })
  })

  it('selects one unlocked module and explains what it unlocks', () => {
    let snapshot = product()
    snapshot = createModule(snapshot, { id: 'module:a', title: 'A' }, { now: time })
    snapshot = createModule(snapshot, { id: 'module:b', title: 'B' }, { now: time })
    snapshot = connectModules(snapshot, 'module:b', 'module:a', { now: time })
    expect(nextAction(snapshot)).toMatchObject({ type: 'define_module', moduleId: 'module:a', whatItUnlocks: ['B'] })
  })

  it('rejects module dependency cycles', () => {
    let snapshot = product()
    snapshot = createModule(snapshot, { id: 'module:a', title: 'A' }, { now: time })
    snapshot = createModule(snapshot, { id: 'module:b', title: 'B' }, { now: time })
    snapshot = connectModules(snapshot, 'module:b', 'module:a', { now: time })
    expect(() => connectModules(snapshot, 'module:a', 'module:b', { now: time })).toThrow('create a cycle')
  })

  it('requires owner-approved decisions and a complete contract before freeze', () => {
    let snapshot = product()
    snapshot = createModule(snapshot, { id: 'module:a', title: 'A' }, { now: time })
    snapshot = proposeDecision(snapshot, { id: 'decision:a', moduleId: 'module:a', question: 'Choose?', alternatives: [], prerequisites: [], evidenceRefs: [] }, { now: time })
    expect(() => freezeModule(snapshot, 'module:a', { now: time })).toThrow('unresolved decisions')
    snapshot = approveDecision(snapshot, 'decision:a', { choice: 'A', rationale: 'Owner choice' }, { now: time })
    expect(() => freezeModule(snapshot, 'module:a', { now: time })).toThrow('contract is incomplete')
  })

  it('generates a versioned handoff and closes only with complete evidence', () => {
    let snapshot = frozenModule()
    const handoff = snapshot.handoffs[0]!
    expect(handoff).toMatchObject({ id: 'handoff:module:a:1', revision: 1, status: 'current' })
    expect(() => startRealization(snapshot, handoff.id, { id: 'missing-agent' } as { id: string; agent: string }, { now: time })).toThrow('agent identity is required')
    snapshot = startRealization(snapshot, handoff.id, { id: 'realization:a', agent: 'external-agent ' }, { now: time })
    expect(snapshot.realizations[0]?.agent).toBe('external-agent')
    snapshot = submitClosure(snapshot, 'realization:a', closure(), { id: 'closure:a', now: time })
    expect(nextAction(snapshot)).toMatchObject({ type: 'review_closure', closureId: 'closure:a' })
    expect(() => acceptClosure(snapshot, 'closure:a', 'external-agent', { now: time })).toThrow('cannot accept its own closure')
    expect(() => rejectClosure(snapshot, 'closure:a', 'external-agent', 'retry', { now: time })).toThrow('cannot reject its own closure')
    snapshot = acceptClosure(snapshot, 'closure:a', 'owner', { now: time })
    expect(snapshot.realizations[0]?.status).toBe('closed')
    expect(snapshot.handoffs[0]?.status).toBe('closed')
  })

  it('refuses closure when acceptance, checks, or Product reconciliation is incomplete', () => {
    let snapshot = frozenModule()
    snapshot = startRealization(snapshot, snapshot.handoffs[0]!.id, { id: 'realization:a', agent: 'external-agent' }, { now: time })
    const bad = closure()
    bad.acceptanceEvidence[0]!.result = 'partial'
    bad.newProductQuestions.push('Should the behavior change?')
    snapshot = submitClosure(snapshot, 'realization:a', bad, { id: 'closure:a', now: time })
    expect(() => acceptClosure(snapshot, 'closure:a', 'owner', { now: time })).toThrow('did not pass')
  })

  it('reopening an upstream decision stales handoffs and downstream definitions', () => {
    let snapshot = frozenModule()
    snapshot = createModule(snapshot, { id: 'module:b', title: 'B', contract: contract('b') }, { now: time })
    snapshot = connectModules(snapshot, 'module:b', 'module:a', { now: time })
    snapshot = freezeModule(snapshot, 'module:b', { now: time })
    snapshot = reopenDecision(snapshot, 'decision:a', { id: 'decision:a:v2', now: time })
    expect(snapshot.decisions.find(value => value.id === 'decision:a')).toMatchObject({ status: 'superseded', ownerChoice: 'A' })
    expect(snapshot.decisions.find(value => value.id === 'decision:a:v2')).toMatchObject({ status: 'proposed', supersedes: 'decision:a' })
    expect(snapshot.modules.find(value => value.id === 'module:a')?.definitionStatus).toBe('shaping')
    expect(snapshot.modules.find(value => value.id === 'module:b')?.definitionStatus).toBe('shaping')
    expect(snapshot.handoffs.every(value => value.status === 'stale')).toBe(true)
  })

  it('hard-deletes only unreferenced draft modules', () => {
    let snapshot = product()
    snapshot = createModule(snapshot, { id: 'module:a', title: 'A' }, { now: time })
    snapshot = deleteDraftModule(snapshot, 'module:a', { now: time })
    expect(snapshot.modules).toEqual([])
    snapshot = frozenModule()
    expect(() => deleteDraftModule(snapshot, 'module:a', { now: time })).toThrow('only candidate or shaping')
  })

  it('validates schema and domain invariants', () => {
    const snapshot = frozenModule()
    expect(validateSnapshot(snapshot)).toEqual([])
    expect(validateInvariants(snapshot)).toEqual([])
    expect(validateSnapshot({ ...snapshot, schemaVersion: 1 })).toContain('/schemaVersion must be equal to constant')
  })

  it('stages an agent proposal before owner authority and applies it atomically', () => {
    let snapshot = product()
    snapshot = stageProposal(snapshot, { expectedRevision: snapshot.revision,
      kind: 'proposal',
      id: 'proposal:create-intake',
      summary: 'Create the bounded idea-intake module',
      operations: [{ type: 'create_module', module: { id: 'module:intake', title: 'Idea intake' } }],
    }, { now: time })
    expect(nextAction(snapshot)).toMatchObject({ type: 'review_proposal', proposalId: 'proposal:create-intake' })
    expect(snapshot.modules).toEqual([])

    snapshot = approveProposal(snapshot, 'proposal:create-intake', { now: time })
    expect(snapshot.proposals[0]?.status).toBe('approved')
    expect(snapshot.modules[0]).toMatchObject({ id: 'module:intake', title: 'Idea intake' })
    expect(nextAction(snapshot)).toMatchObject({ type: 'define_module', moduleId: 'module:intake' })
  })

  it('rejects a proposal when Product authority changed after submission', () => {
    let snapshot = product()
    snapshot = stageProposal(snapshot, { expectedRevision: snapshot.revision,
      kind: 'proposal', id: 'proposal:stale', summary: 'Create A',
      operations: [{ type: 'create_module', module: { id: 'module:a', title: 'A' } }],
    }, { now: time })
    snapshot = createModule(snapshot, { id: 'module:other', title: 'Other' }, { now: time })
    expect(() => approveProposal(snapshot, 'proposal:stale', { now: time })).toThrow('proposal is stale')
  })

  it('changing a frozen contract invalidates its handoff', () => {
    let snapshot = frozenModule()
    snapshot = updateModule(snapshot, 'module:a', { contract: contract('changed') }, { now: time })
    expect(snapshot.modules[0]?.definitionStatus).toBe('shaping')
    expect(snapshot.handoffs[0]?.status).toBe('stale')
  })
})
