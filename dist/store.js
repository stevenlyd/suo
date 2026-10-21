import { observe, observedIdentity, contentIdentity } from './concurrency.js';
import { safePath } from './project-files.js';
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
    await withProjectLock(root, () => recoverPendingCommit(root));
    const authority = await (await knowledgeStore(root)).load();
    const authorityProposalIds = new Set(authority.proposals.map(value => value.id));
    const staged = (await loadStagedProposals(root)).filter(value => !authorityProposalIds.has(value.id));
    const snapshot = { ...authority, proposals: [...authority.proposals, ...staged] };
    assertValidSnapshot(snapshot);
    return observe(snapshot, authority);
}
export async function saveSnapshot(snapshot, start = process.cwd(), options = {}) {
    assertValidSnapshot(snapshot);
    // Initialization receives the selected destination (the CLI already resolves
    // implicit Git roots). Rediscovery here can redirect writes into an ancestor.
    const root = options.initialize ? resolve(start) : await findProjectRoot(start);
    const adapter = await knowledgeStore(root);
    await withProjectLock(root, async () => {
        await recoverPendingCommit(root);
        const canonical = authorityProjection(snapshot);
        const consumed = new Set(snapshot.proposals.filter(value => value.status !== 'pending').map(value => value.id));
        const requested = snapshot.proposals.filter(value => value.status === 'pending');
        const current = options.initialize ? undefined : await adapter.load();
        if (current && observedIdentity(snapshot) !== contentIdentity(current))
            throw new Error('stale authority content: reload before saving');
        const pendingBefore = options.initialize ? [] : await loadStagedProposals(root);
        const pending = options.initialize ? requested : mergePending(pendingBefore, requested, consumed);
        assertValidSnapshot({ ...canonical, proposals: pending });
        const prepared = await prepareStagedWrite(root, pending);
        try {
            if (!current) {
                await adapter.save(canonical);
                await prepared.commit();
            }
            else if (snapshot.revision === current.revision) {
                if (stable(canonical) !== stable(authorityProjection(current)))
                    throw new Error('authority changes require an explicit revision commit');
                await prepared.commit();
            }
            else {
                if (snapshot.revision !== current.revision + 1)
                    throw new Error('stale Suo revision: expected one concurrency-token increment');
                // A recoverable transaction consumes staged approvals with the authority
                // write. A decided-proposal ledger is neither persisted nor required.
                const path = await safePath(root, '.suo/commit.json');
                await writeFile(path, JSON.stringify({ before: contentIdentity(current), after: canonical, pending, pendingBefore }), { flag: 'wx' });
                await adapter.save(canonical);
                await prepared.commit();
                await rm(path);
            }
            observe(snapshot, await adapter.load());
        }
        finally {
            await prepared.cleanup();
        }
    });
}
async function recoverPendingCommit(root) {
    const path = await safePath(root, '.suo/commit.json');
    let raw;
    try {
        raw = await readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    const record = JSON.parse(raw);
    assertValidSnapshot(record.after);
    assertValidSnapshot({ ...record.after, proposals: record.pending });
    const staged = await loadStagedProposals(root);
    if (JSON.stringify(staged) !== JSON.stringify(record.pendingBefore) && JSON.stringify(staged) !== JSON.stringify(record.pending))
        throw new Error('interrupted commit conflicts with staged proposals');
    const adapter = await knowledgeStore(root);
    const current = await adapter.load();
    const identity = contentIdentity(current);
    if (identity !== record.before && identity !== contentIdentity(record.after))
        throw new Error('interrupted commit conflicts with current authority; preserve and resolve it');
    const prepared = await prepareStagedWrite(root, record.pending);
    try {
        if (identity === record.before)
            await adapter.save(record.after);
        await prepared.commit();
        await rm(path);
    }
    finally {
        await prepared.cleanup();
    }
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
    return { ...structuredClone(snapshot), proposals: [] };
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