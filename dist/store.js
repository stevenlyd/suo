import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { findProjectRoot } from './source.js';
import { knowledgeStore } from './knowledge-store.js';
import { withProjectLock } from './project-files.js';
import { assertValidSnapshot } from './validation.js';
export const workspaceDir = (root) => join(root, '.suo');
const stagedProposalPath = (root) => join(workspaceDir(root), 'staged', 'proposals.json');
export async function loadSnapshot(start = process.cwd()) {
    const root = await findProjectRoot(start);
    const authority = await (await knowledgeStore(root)).load();
    const authorityProposalIds = new Set(authority.proposals.map(value => value.id));
    const staged = (await loadStagedProposals(root)).filter(value => !authorityProposalIds.has(value.id));
    const snapshot = { ...authority, proposals: [...authority.proposals, ...staged] };
    assertValidSnapshot(snapshot);
    return snapshot;
}
export async function saveSnapshot(snapshot, start = process.cwd(), options = {}) {
    assertValidSnapshot(snapshot);
    // Initialization receives the selected destination (the CLI already resolves
    // implicit Git roots). Rediscovery here can redirect writes into an ancestor.
    const root = options.initialize ? resolve(start) : await findProjectRoot(start);
    const adapter = await knowledgeStore(root);
    await withProjectLock(root, async () => {
        const canonical = authorityProjection(snapshot);
        const requestedPending = snapshot.proposals.filter(proposal => proposal.status === 'pending');
        const current = options.initialize ? undefined : await adapter.load();
        const pending = options.initialize
            ? requestedPending
            : mergePending(await loadStagedProposals(root), requestedPending, new Set(canonical.proposals.map(value => value.id)));
        const prepared = await prepareStagedWrite(root, pending);
        try {
            if (options.initialize) {
                await adapter.save(canonical);
                await prepared.commit();
                return;
            }
            if (!current)
                throw new Error('current authority is unavailable');
            if (snapshot.revision === current.revision) {
                if (stable(canonical) !== stable(authorityProjection(current)))
                    throw new Error('authority changes require an explicit revision commit');
                await prepared.commit();
                return;
            }
            if (snapshot.revision !== current.revision + 1)
                throw new Error(`stale Suo revision: expected ${current.revision.toString()} -> ${(current.revision + 1).toString()}, received ${snapshot.revision.toString()}`);
            await adapter.save(canonical);
            try {
                await prepared.commit();
            }
            catch (error) {
                if (adapter.kind === 'repo-ts') {
                    await adapter.save(current);
                    throw error;
                }
                throw new Error(`Vault revision ${canonical.revision} committed, but local proposal staging failed; reload before retrying`, { cause: error });
            }
        }
        finally {
            await prepared.cleanup();
        }
    });
}
export async function projectRoot(start = process.cwd()) {
    return findProjectRoot(start);
}
async function loadStagedProposals(root) {
    try {
        const value = JSON.parse(await readFile(stagedProposalPath(root), 'utf8'));
        if (!Array.isArray(value))
            throw new Error('staged proposals must be an array');
        return value;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    }
}
async function prepareStagedWrite(root, proposals) {
    const path = stagedProposalPath(root);
    await mkdir(dirname(path), { recursive: true });
    try {
        if ((await lstat(path)).isDirectory())
            throw new Error(`staged proposal path is a directory: ${path}`);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    if (!proposals.length)
        return {
            commit: async () => { await rm(path, { force: true }); },
            cleanup: async () => { },
        };
    const temporary = `${path}.${process.pid.toString()}.${Date.now().toString()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(proposals, null, 2)}\n`, 'utf8');
    let committed = false;
    return {
        commit: async () => { await rename(temporary, path); committed = true; },
        cleanup: async () => { if (!committed)
            await rm(temporary, { force: true }); },
    };
}
function authorityProjection(snapshot) {
    return {
        ...structuredClone(snapshot),
        proposals: snapshot.proposals
            .filter(proposal => proposal.status !== 'pending')
            .map(proposal => ({ ...structuredClone(proposal), operations: [] })),
    };
}
function stable(snapshot) {
    return JSON.stringify(snapshot);
}
function mergePending(current, requested, committedIds) {
    const merged = new Map();
    for (const proposal of [...current, ...requested]) {
        if (committedIds.has(proposal.id))
            continue;
        const existing = merged.get(proposal.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(proposal))
            throw new Error(`conflicting staged proposal: ${proposal.id}`);
        merged.set(proposal.id, proposal);
    }
    return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}
//# sourceMappingURL=store.js.map