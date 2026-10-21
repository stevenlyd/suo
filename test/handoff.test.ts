import { expect, it } from 'vitest'
import { createModule, createProduct, freezeModule, updateModule, startRealization, submitClosure, acceptClosure, connectModules, reconcileImportedAuthority, proposeDecision, approveDecision, reopenDecision } from '../src/core.js'
import { validateSnapshot } from '../src/validation.js'
import { renderHandoff } from '../src/render.js'
const contract = { objective: 'Current objective', frozenBehavior: ['Visible behavior'], scope: ['Feature'], nonGoals: ['Other'], requiredChecks: [], checkRationale: 'Manual observation is appropriate for this fixture.', acceptance: [{ id: 'a', text: 'Visible result' }] }
function accepted() {
 let s=freezeModule(createModule(createProduct({title:'Current',idea:'Current state'}),{id:'a',title:'A',contract}),'a')
 s=startRealization(s,s.handoffs[0]!.id,{id:'r',agent:'Steven'})
 s=submitClosure(s,'r',{definitionDigest:s.handoffs[0]!.contractDigest,implementationRefs:[{kind:'commit',uri:'commit:a',revision:'a'}],deliveredBehavior:['Visible'],acceptanceEvidence:[{acceptanceId:'a',result:'pass',evidence:['observation:a']}],checks:[],deviations:[],residualRisks:[],newProductQuestions:[]},{id:'c'})
 return acceptClosure(s,'c','Quinn')
}
it('edits current definitions and invalidates closed acceptance without storing old contracts',()=>{
 const old=accepted(), digest=old.closures[0]!.definitionDigest
 let next=updateModule(old,'a',{contract:{...contract,objective:'Changed',acceptance:[{id:'new',text:'New result'}]}})
 expect(next.closures[0]!.status).toBe('stale');expect(next.realizations[0]!.status).toBe('stale')
 expect(next.closures[0]!.definitionDigest).toBe(digest);expect(validateSnapshot(next)).toEqual([])
 next=freezeModule(next,'a');expect(next.handoffs).toHaveLength(1)
 expect(next.handoffs[0]!.contractDigest).not.toBe(digest)
 expect(renderHandoff(next,next.handoffs[0]!)).toContain('Changed')
 expect(next.handoffs[0]).not.toHaveProperty('frozenDefinition')
})
it('invalidates downstream delivery on imported dependency edits, including accepted results',()=>{
 let s=accepted();s=createModule(s,{id:'b',title:'B',contract});s=connectModules(s,'b','a');s=freezeModule(s,'b')
 const raw=structuredClone(s);raw.modules.find(m=>m.id==='a')!.contract.scope=['Changed upstream']
 const next=reconcileImportedAuthority(raw)
 expect(next.handoffs.every(h=>h.status==='stale')).toBe(true);expect(next.closures[0]!.status).toBe('stale');expect(validateSnapshot(next)).toEqual([])
})
it('represents undecided checks explicitly and never freezes them as an empty approved policy',()=>{
 const s=createModule(createProduct({title:'Current',idea:'Current state'}),{id:'a',title:'A',contract:{...contract,requiredChecks:null,checkRationale:null}})
 expect(validateSnapshot(s)).toEqual([]);expect(()=>freezeModule(s,'a')).toThrow('required check policy')
})

it('invalidates accepted evidence through cross-module decision prerequisites',()=>{
 let s=createModule(createProduct({title:'Prerequisites',idea:'Independent feature graph'}),{id:'up',title:'Up',contract})
 s=createModule(s,{id:'down',title:'Down',contract})
 for (const [id,moduleId,prerequisites] of [['du','up',[]],['dd','down',['du']]] as const) {
  s=proposeDecision(s,{id,moduleId,question:'Choose?',alternatives:[],prerequisites:[...prerequisites],evidenceRefs:[]})
  s=approveDecision(s,id,{choice:'Yes',rationale:'Authorized choice'})
 }
 s=freezeModule(s,'down');s=startRealization(s,s.handoffs[0]!.id,{id:'r',agent:'Steven'})
 s=submitClosure(s,'r',{definitionDigest:s.handoffs[0]!.contractDigest,implementationRefs:[{kind:'commit',uri:'commit:a',revision:'a'}],deliveredBehavior:['Visible'],acceptanceEvidence:[{acceptanceId:'a',result:'pass',evidence:['observation:a']}],checks:[],deviations:[],residualRisks:[],newProductQuestions:[]},{id:'c'})
 s=acceptClosure(s,'c','Quinn')
 const next=reopenDecision(s,'du')
 expect(next.closures[0]!.status).toBe('stale');expect(next.handoffs[0]!.status).toBe('stale');expect(validateSnapshot(next)).toEqual([])
})
