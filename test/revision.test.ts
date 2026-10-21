import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createProduct, stageProposal, approveProposal } from '../src/core.js'
import { contentIdentity } from '../src/concurrency.js'
import { saveAuthority } from '../src/source.js'
import { saveSnapshot, loadSnapshot } from '../src/store.js'
it('consumes proposals without a durable decided ledger and rejects stale writers',async()=>{
 const root=await mkdtemp(join(tmpdir(),'suo-current-'))
 try {
  await saveSnapshot(createProduct({title:'Current',idea:'Current state'}),root,{initialize:true})
  const old=await loadSnapshot(root)
  const staged=stageProposal(old,{kind:'proposal',expectedRevision:old.revision,id:'p',summary:'Create feature',operations:[{type:'create_module',module:{id:'a',title:'A'}}]})
  await saveSnapshot(staged,root)
  await saveSnapshot(approveProposal(await loadSnapshot(root),'p'),root)
  const current=await loadSnapshot(root);expect(current.proposals).toEqual([]);expect(current.modules).toHaveLength(1)
  expect(await readdir(join(root,'suo'))).not.toContain('proposals')
  expect(await readFile(join(root,'suo/product.suo.ts'),'utf8')).not.toContain('proposal-audit')
  await expect(saveSnapshot(stageProposal(old,{kind:'proposal',expectedRevision:old.revision,summary:'Stale write',operations:[{type:'create_module',module:{id:'b',title:'B'}}]}),root)).rejects.toThrow('stale authority')
 } finally {await rm(root,{recursive:true,force:true})}
},20000)

it.each([false,true])('recovers consumed staging atomically around authority commit (written=%s)',async written=>{
 const root=await mkdtemp(join(tmpdir(),'suo-recovery-'))
 try {
  await saveSnapshot(createProduct({title:'Current',idea:'Atomic approval'}),root,{initialize:true})
  const before=await loadSnapshot(root)
  const staged=stageProposal(before,{kind:'proposal',id:'p',expectedRevision:before.revision,summary:'Create',operations:[{type:'create_module',module:{id:'a',title:'A'}}]})
  await saveSnapshot(staged,root)
  const approved=approveProposal(await loadSnapshot(root),'p'),after={...approved,proposals:[]}
  await writeFile(join(root,'.suo/commit.json'),JSON.stringify({before:contentIdentity(before),after,pending:[],pendingBefore:staged.proposals}))
  if(written) await saveAuthority(after,root)
  const loaded=await loadSnapshot(root)
  expect(loaded.modules).toHaveLength(1);expect(loaded.proposals).toEqual([])
  expect(await readdir(join(root,'.suo'))).not.toContain('commit.json')
 } finally {await rm(root,{recursive:true,force:true})}
},20000)
