import { createHash } from 'node:crypto';
// Process-local observation, never product history or persisted approval evidence.
const observations = new WeakMap();
export function contentIdentity(snapshot) {
    return createHash('sha256').update(canonicalJson({ ...snapshot, proposals: [], modules: byId(snapshot.modules.map(value => ({ ...value, dependencies: [...value.dependencies].sort() }))), decisions: byId(snapshot.decisions.map(value => ({ ...value, prerequisites: [...value.prerequisites].sort() }))), handoffs: byId(snapshot.handoffs.map(value => ({ ...value, decisionIds: [...value.decisionIds].sort() }))), realizations: byId(snapshot.realizations), closures: byId(snapshot.closures) })).digest('hex');
}
export function observe(snapshot, authority = snapshot) {
    observations.set(snapshot, contentIdentity(authority));
    return snapshot;
}
export function inheritObservation(before, after) {
    const identity = observations.get(before);
    if (identity)
        observations.set(after, identity);
    return after;
}
export function observedIdentity(snapshot) { return observations.get(snapshot); }
function byId(values) { return [...values].sort((a, b) => a.id.localeCompare(b.id)); }
export function canonicalJson(value) {
    function canonical(item) {
        if (Array.isArray(item))
            return item.map(canonical);
        if (item !== null && typeof item === 'object')
            return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)]));
        return item;
    }
    return JSON.stringify(canonical(value));
}
//# sourceMappingURL=concurrency.js.map