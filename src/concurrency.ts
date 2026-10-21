import { createHash } from 'node:crypto'
import type { SuoSnapshot } from './model.js'
// Process-local observation, never product history or persisted approval evidence.
const observations = new WeakMap<SuoSnapshot, string>()
export function contentIdentity(snapshot: SuoSnapshot): string {
  return createHash('sha256').update(canonicalJson({ ...snapshot, proposals: [], modules: byId(snapshot.modules.map(value => ({ ...value, dependencies: [...value.dependencies].sort() }))), decisions: byId(snapshot.decisions.map(value => ({ ...value, prerequisites: [...value.prerequisites].sort() }))), handoffs: byId(snapshot.handoffs.map(value => ({ ...value, decisionIds: [...value.decisionIds].sort() }))), realizations: byId(snapshot.realizations), closures: byId(snapshot.closures) })).digest('hex')
}
export function observe(snapshot: SuoSnapshot, authority: SuoSnapshot = snapshot): SuoSnapshot {
  observations.set(snapshot, contentIdentity(authority)); return snapshot
}
export function inheritObservation(before: SuoSnapshot, after: SuoSnapshot): SuoSnapshot {
  const identity = observations.get(before)
  if (identity) observations.set(after, identity)
  return after
}
export function observedIdentity(snapshot: SuoSnapshot): string | undefined { return observations.get(snapshot) }

function byId<T extends { id: string }>(values: T[]): T[] { return [...values].sort((a,b)=>a.id.localeCompare(b.id)) }
export function canonicalJson(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical)
    if (item !== null && typeof item === 'object') return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)]))
    return item
  }
  return JSON.stringify(canonical(value))
}
