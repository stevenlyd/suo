import { describe, expect, it } from 'vitest'
import { approveDecision, createModule, createProduct, freezeModule, proposeDecision, reopenDecision, updateModule } from '../src/core.js'
import { renderHandoff } from '../src/render.js'
import { validateSnapshot } from '../src/validation.js'
import type { ModuleContract } from '../src/model.js'

const contract: ModuleContract = { objective: 'Original objective', frozenBehavior: ['Original behavior'], scope: ['Original scope'], nonGoals: ['Original non-goal'], requiredChecks: [], checkRationale: 'Manual observation suffices for this fixture.', acceptance: [{ id: 'a', text: 'Original acceptance' }] }
function frozen() {
  let snapshot = createModule(createProduct({ title: 'Test', idea: 'Test idea' }), { id: 'module:a', title: 'Original title', contract })
  snapshot = proposeDecision(snapshot, { id: 'decision:a', moduleId: 'module:a', question: 'Original question', alternatives: [], prerequisites: [], evidenceRefs: [] })
  snapshot = approveDecision(snapshot, 'decision:a', { choice: 'Original choice', rationale: 'Original rationale' })
  return freezeModule(snapshot, 'module:a')
}

describe('frozen handoff projections', () => {
  it('captures all rendered fields and governing decisions independently of current state', () => {
    const original = frozen()
    const before = renderHandoff(original, original.handoffs[0]!)
    let next = reopenDecision(original, 'decision:a', { id: 'decision:b' })
    next = updateModule(next, 'module:a', { title: 'New title', contract: { ...contract, objective: 'New objective' } })
    next.decisions[0]!.question = 'New question'
    const after = renderHandoff(next, next.handoffs[0]!)
    expect(after).toBe(before.replace('Status: current', 'Status: stale'))
    expect(after).toContain('Original choice')
    expect(after).toContain('Original acceptance')
    expect(validateSnapshot(next)).toEqual([])
  })

  it('blocks historical records without frozen authority instead of fabricating it', () => {
    const snapshot = frozen()
    Reflect.deleteProperty(snapshot.handoffs[0]!, 'frozenDefinition')
    expect(validateSnapshot(snapshot).join()).toContain('frozenDefinition')
    expect(() => updateModule(snapshot, 'module:a', { title: 'New' })).toThrow('invalid Suo snapshot')
  })

  it('rejects altered frozen contracts, decision membership and malformed payloads', () => {
    const snapshot = frozen()
    snapshot.handoffs[0]!.frozenDefinition!.module.contract.scope = ['Forged']
    expect(validateSnapshot(snapshot).join()).toContain('frozen definition does not match')
    const missing = frozen()
    missing.handoffs[0]!.frozenDefinition!.decisions = []
    expect(validateSnapshot(missing).join()).toContain('frozen definition does not match')
    expect(validateSnapshot({ ...frozen(), handoffs: [{ ...frozen().handoffs[0], frozenDefinition: {} }] }).length).toBeGreaterThan(0)
  })
})
