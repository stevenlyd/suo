import {inspectUnits} from './unit-core.js'
import type {UnitSnapshot,CheckoutContext} from './unit-model.js'
const line=(value:string)=>value.replaceAll('\n',' ').replaceAll('|','\\|')
/** Flat output stays stack-safe even for a deeply nested logical forest. */
export function renderUnits(snapshot:UnitSnapshot,context:CheckoutContext):string {
 const projection=inspectUnits(snapshot,context),parents=new Map(snapshot.containment.map(e=>[e.child,e.parent]))
 const lines=[`# ${line(snapshot.product.title)}`, '','Generated view of repository declarations. Run Suo inspect for the exact current snapshot identity and applicability.','','Repository declarations and applicable source mappings only. No CI, acceptance or deployment result.','','| Unit | Parent | Declared implementation | Applicability | Complete coverage |','| --- | --- | --- | --- | --- |']
 for(const u of projection.units)lines.push(`| ${line(u.id)} — ${line(u.title)} | ${line(parents.get(u.id)??'root')} | ${u.declaredState} | ${u.applicability} | ${u.implemented?'declared and current':'not established'} |`)
 for(let i=0;i<snapshot.units.length;i++){const u=snapshot.units[i]!,p=projection.units[i]!;lines.push('',`## ${line(u.title)} (${line(u.id)})`,'',u.definition.objective,'',`Scope: ${u.definition.scope}; selection: ${u.definition.decision}; intended assignee: ${u.expectedAssignee??'unspecified (no assumed acceptance)'}.`,'',...u.definition.behavior.map(b=>`- ${line(b)}`),'',`Start blockers: ${p.blockers.join('; ')||'none mechanically found; semantic review still applies'}`,`Verification blockers: ${p.verificationBlockers.join('; ')||'none mechanically found; checks have not been run'}`,`Acceptance: ${p.acceptanceBlockers.join('; ')}`,`Semantic constraint review: ${p.semanticReviewRequired?'required':'no prose constraints declared; behavior still needs review'}`)}
 return lines.join('\n')+'\n'
}
