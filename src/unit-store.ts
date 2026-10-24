import { checkWriter, currentWriter, readWriter, requireCompatibleWriter, writerContents, writerPath } from './writer.js'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, readdir, lstat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { withProjectLock, safePath } from './project-files.js'
import { unitSourceContents, loadUnits } from './unit-source.js'
import { readRepository, resolveCoverageSymbols } from './unit-checkout.js'
import { validateUnits, inspectUnits } from './unit-core.js'
import { digest, canonical } from './unit-identity.js'
import type { UnitSnapshot } from './unit-model.js'
const journalName = '.suo/unit-write.json'
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } }
async function sourceIdentity(root: string, directory = 'suo'): Promise<string | null> {
  const base = await safePath(root, directory); if (!await exists(base)) return null
  const stack = [directory], entries: Array<[string,string]> = []
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of await readdir(await safePath(root,dir),{withFileTypes:true})) {
      const path = `${dir}/${entry.name}`, actual = await safePath(root,path)
      if (entry.isDirectory()) stack.push(path); else if (entry.isFile()) entries.push(['suo'+path.slice(directory.length),(await readFile(actual)).toString('base64')]); else throw new Error('authority contains a nonregular file')
    }
  }
  return digest(entries.sort(([a],[b])=>a<b?-1:a>b?1:0))
}
async function verifyRecoveredSource(root:string, expected:string):Promise<void>{
  const stage=await safePath(root,`.suo/unit-verify-${randomUUID()}`);await mkdir(stage,{recursive:true});
  try {
    const stack=['suo'];while(stack.length){const dir=stack.pop()!;for(const entry of await readdir(await safePath(root,dir),{withFileTypes:true})){const path=`${dir}/${entry.name}`,actual=await safePath(root,path);if(entry.isDirectory())stack.push(path);else if(entry.isFile()){await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),await readFile(actual))}else throw new Error('nonregular recovery source')}}
    if(await sourceIdentity(stage)!==expected)throw new Error('recovery source changed while validating');await loadUnits(stage);if(await sourceIdentity(root)!==expected)throw new Error('recovery source changed before finalization');
  }finally{await rm(stage,{recursive:true,force:true})}
}
/** Called explicitly after a crash; a lock never silently expires. */
export async function recoverUnits(root: string): Promise<void> {
  await withProjectLock(root,async()=>{
    const installed=await currentWriter();requireCompatibleWriter(installed,await readWriter(root));
    const path=await safePath(root,journalName); if (!await exists(path)) return
    const journal: unknown=JSON.parse(await readFile(path,'utf8'))
    if (!journal || typeof journal!=='object' || Array.isArray(journal) || Object.keys(journal).sort().join(',')!=='after,before,stage' ) throw new Error('malformed Unit transaction; preserve for manual recovery')
    const j=journal as {stage:string;before:string|null;after:string}
    if (!/^\.suo\/unit-stage-[a-f0-9-]{36}$/.test(j.stage) || (j.before!==null&&!/^[a-f0-9]{64}$/.test(j.before)) || !/^[a-f0-9]{64}$/.test(j.after)) throw new Error('invalid transaction identity')
    const current=await sourceIdentity(root), stage=await safePath(root,j.stage), backup=join(stage,'before')
    for(const path of [`${j.stage}/suo/writer.json`,`${j.stage}/before/writer.json`])requireCompatibleWriter(installed,await readWriter(root,path))
    if (current===j.after) { await verifyRecoveredSource(root,j.after); await rm(stage,{recursive:true,force:true}); await rm(path); return }
    if (current===null && await exists(backup)) { if(await sourceIdentity(root,`${j.stage}/before`)!==j.before) throw new Error('backup recovery identity mismatch'); await rename(backup,join(root,'suo')); }
    else if (current!==j.before) throw new Error('transaction conflicts with current authority; preserve both states')
    await rm(stage,{recursive:true,force:true}); await rm(path)
  })
}
/** All-or-nothing logical authority replacement; never commits Git or writes external facts. */
export async function saveUnits(root: string, snapshot: UnitSnapshot, expectedToken: string): Promise<void> {
  validateUnits(snapshot)
  snapshot = JSON.parse(canonical(snapshot)) as UnitSnapshot
  if(!/^[a-f0-9]{64}$/.test(expectedToken)) throw new Error('observed repository content token required')
  await withProjectLock(root,async()=>{
    const {installed:writer}=await checkWriter(root)
    const journal=await safePath(root,journalName);if(await exists(journal))throw new Error('pending Unit transaction: recover before reading/writing')
    const current=await readRepository(root,'working-tree');if(current.token!==expectedToken)throw new Error('stale repository inputs: reload before saving')
    const observedAuthority = [...current.contents].filter(([path])=>path.startsWith('suo/')).map(([path,bytes])=>[path,bytes.toString('base64')] as [string,string]).sort(([a],[b])=>a<b?-1:a>b?1:0)
    const observedAuthorityIdentity = observedAuthority.length ? digest(observedAuthority) : null
    if (await sourceIdentity(root) !== observedAuthorityIdentity) throw new Error('authority contains unobserved or concurrently changed files; include it in the Git candidate')
    if (observedAuthority.some(([path])=>path!=='suo/ontology.d.ts' && path!==writerPath && !path.endsWith('.suo.ts'))) throw new Error('authority replacement would remove auxiliary files; migrate these explicitly first')
    resolveCoverageSymbols(snapshot,current)
    inspectUnits(snapshot,current.context)
    const stageName=`.suo/unit-stage-${randomUUID()}`,stage=await safePath(root,stageName)
    await mkdir(stage,{recursive:true})
    let recorded=false
    try {
      for(const [path,content]of unitSourceContents(snapshot)){await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),content)}
      await writeFile(join(stage,writerPath),writerContents(writer))
      if(!isDeepStrictEqual(await loadUnits(stage),snapshot))throw new Error('Unit source roundtrip mismatch')
      if((await readRepository(root,'working-tree')).token!==expectedToken)throw new Error('repository changed while preparing Unit write')
      const before=await sourceIdentity(root),after=await sourceIdentity(stage)
      if(!after)throw new Error('empty prepared authority')
      if(before!==observedAuthorityIdentity)throw new Error('authority changed while preparing Unit write')
      await writeFile(journal,JSON.stringify({stage:stageName,before,after}),{flag:'wx'});recorded=true
      if(before!==null)await rename(join(root,'suo'),join(stage,'before'))
      await rename(join(stage,'suo'),join(root,'suo'))
      if(await sourceIdentity(root)!==after)throw new Error('saved Unit authority verification failed; recover transaction')
      await rm(stage,{recursive:true,force:true});await rm(journal)
    } finally { if(!recorded)await rm(stage,{recursive:true,force:true}) }
  })
}
/** Initial authority creation is staged as one directory, never partial file writes. */
export async function createUnitTemplate(root:string,snapshot:UnitSnapshot):Promise<void>{
 validateUnits(snapshot);snapshot=JSON.parse(canonical(snapshot)) as UnitSnapshot;
 await withProjectLock(root,async()=>{
  if(await exists(await safePath(root,journalName)))throw new Error('pending Unit transaction: recover before initializing');
  const {installed:writer}=await checkWriter(root);
  const destination=await safePath(root,'suo');if(await exists(destination))throw new Error('authority already exists; inspect/migrate it rather than initializing over it');
  const stage=await safePath(root,`.suo/unit-template-${randomUUID()}`);await mkdir(stage,{recursive:true});
  try{for(const[path,content]of unitSourceContents(snapshot)){await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),content,{flag:'wx'})}await writeFile(join(stage,writerPath),writerContents(writer));if(!isDeepStrictEqual(await loadUnits(stage),snapshot))throw new Error('template roundtrip mismatch');await rename(join(stage,'suo'),destination)}finally{await rm(stage,{recursive:true,force:true})}
 })
}
