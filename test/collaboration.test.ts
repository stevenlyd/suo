import { expect, it } from 'vitest'
import { createProduct, createModule, stageProposal, approveProposal } from '../src/core.js'
import { validateSnapshot } from '../src/validation.js'
const fixture = () => {
  let s = createProduct({ title: 'Together', idea: 'Independent outcomes' })
  for (const id of ['replies', 'avatars', 'profile']) s = createModule(s, { id: `module:${id}`, title: id })
  return s
}
for (const [sender, receiver] of [['Steven','Quinn'], ['Quinn','Steven']]) {
  it(`${sender} and ${receiver} can approve independent edits without accepting delivery`, () => {
    let s = fixture()
    for (const [id, title] of [['replies','Keep replies'], ['avatars','Keep avatars'], ['profile','Think more']] as const) {
      s = stageProposal(s, {kind:'proposal', id:`proposal:${id}`, expectedRevision:s.revision, summary:`${sender} to ${receiver}: ${title}`, operations:[{type:'update_module',moduleId:`module:${id}`,patch:{title}}]})
    }
    s = approveProposal(s, 'proposal:replies')
    s = approveProposal(s, 'proposal:avatars')
    expect(s.proposals.find(p=>p.id==='proposal:profile')?.status).toBe('pending')
    expect(s.closures).toEqual([])
    expect(validateSnapshot(s)).toEqual([])
  })
}
it('rejects stale submission and conflicting same-feature decisions with provenance', () => {
  let s = fixture()
  const baseline = s.revision
  for (const id of ['steven','quinn']) s = stageProposal(s, { expectedRevision: s.revision,kind:'proposal',id:`proposal:${id}`,summary:id,operations:[{type:'update_module',moduleId:'module:profile',patch:{title:id}}]})
  s = approveProposal(s,'proposal:steven')
  expect(()=>approveProposal(s,'proposal:quinn')).toThrow(/proposal:steven: steven/)
  expect(()=>stageProposal(s,{kind:'proposal',summary:'late',expectedRevision:baseline,operations:[{type:'update_module',moduleId:'module:avatars',patch:{title:'late'}}]})).toThrow(/baseline conflict/)
})
it('legacy proposals retain their conservative global guard', () => {
  let s = fixture()
  s = stageProposal(s, { expectedRevision: s.revision,kind:'proposal',id:'proposal:old',summary:'old',operations:[{type:'update_module',moduleId:'module:avatars',patch:{title:'old'}}]})
  delete s.proposals[0]!.scopeDigest
  s = stageProposal(s, { expectedRevision: s.revision,kind:'proposal',id:'proposal:new',summary:'new',operations:[{type:'update_module',moduleId:'module:replies',patch:{title:'new'}}]})
  s = approveProposal(s,'proposal:new')
  expect(()=>approveProposal(s,'proposal:old')).toThrow(/stale/)
})
it('expected assignee survives authority roundtrip without claimed work or acceptance', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { saveSnapshot, loadSnapshot } = await import('../src/store.js')
  const root = await mkdtemp(join(tmpdir(),'suo-handoff-owner-'))
  try {
    let s = fixture()
    s = stageProposal(s, { expectedRevision: s.revision,kind:'proposal',id:'proposal:handoff',summary:'Quinn to Steven',operations:[
      {type:'update_module',moduleId:'module:replies',patch:{contract:{objective:'Reply',frozenBehavior:['Thread replies'],scope:['Replies'],nonGoals:['Profile'],requiredChecks: [], checkRationale: 'Manual observation suffices for this fixture.', acceptance:[{id:'reply',text:'Reply is visible'}]}}},
      {type:'freeze_module',moduleId:'module:replies',expectedAssignee:'Steven'}
    ]})
    s = approveProposal(s,'proposal:handoff')
    await saveSnapshot(s,root,{initialize:true})
    const loaded = await loadSnapshot(root)
    expect(loaded.handoffs[0]?.expectedAssignee).toBe('Steven')
    expect(loaded.realizations).toEqual([])
    expect(loaded.closures).toEqual([])
    expect(validateSnapshot(loaded)).toEqual([])
  } finally { await rm(root,{recursive:true,force:true}) }
}, 20000)
it('cross-feature decision prerequisites retain the global conflict guard', async () => {
  const { proposeDecision } = await import('../src/core.js')
  let s = fixture()
  s = proposeDecision(s,{id:'decision:base',moduleId:'module:profile',question:'Base?',alternatives:[],prerequisites:[],evidenceRefs:[]})
  s = proposeDecision(s,{id:'decision:dependent',moduleId:'module:replies',question:'Dependent?',alternatives:[],prerequisites:['decision:base'],evidenceRefs:[]})
  s = stageProposal(s, { expectedRevision: s.revision,kind:'proposal',summary:'replies',operations:[{type:'update_module',moduleId:'module:replies',patch:{title:'Reply'}}]})
  expect(s.proposals[0]?.scopeDigest).toBeUndefined()
})
