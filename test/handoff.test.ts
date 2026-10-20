import { describe, expect, it } from 'vitest'
import { approveDecision, createModule, createProduct, freezeModule, proposeDecision, reopenDecision, updateModule } from '../src/core.js'
import { renderHandoff } from '../src/render.js'
import { validateSnapshot } from '../src/validation.js'
import type { ModuleContract } from '../src/model.js'

const contract: ModuleContract = { objective: 'Original objective', frozenBehavior: ['Original behavior'], scope: ['Original scope'], nonGoals: ['Original non-goal'], acceptance: [{ id: 'a', text: 'Original acceptance' }] }
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

  it('keeps old records valid but omits unproven bodies even when the current digest matches', () => {
    const snapshot = frozen()
    delete snapshot.handoffs[0]!.frozenDefinition
    expect(validateSnapshot(snapshot)).toEqual([])
    const output = renderHandoff(snapshot, snapshot.handoffs[0]!)
    expect(output).toContain('Historical content unavailable')
    expect(output).not.toContain('Original objective')
    expect(output).not.toContain('Original question')
    expect(output).toContain(snapshot.handoffs[0]!.contractDigest)
  })

  it('uses verified legacy history and rejects mismatching history', () => {
    const original = frozen()
    delete original.handoffs[0]!.frozenDefinition
    const next = updateModule(original, 'module:a', { contract: { ...contract, objective: 'New objective' } })
    const legacy = renderHandoff(next, next.handoffs[0]!, original)
    expect(legacy).toContain('Original objective')
    expect(legacy).toContain('Legacy history:')
    expect(legacy).not.toContain('# Handoff: Original title')
    expect(legacy).not.toContain('Original question')
    expect(renderHandoff(next, next.handoffs[0]!, next)).toContain('Historical content unavailable')
    const wrong = structuredClone(original)
    wrong.handoffs[0]!.revision++
    expect(renderHandoff(next, next.handoffs[0]!, wrong)).toContain('Historical content unavailable')
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
