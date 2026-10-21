import { randomUUID } from 'node:crypto';
import { safePath, withProjectLock } from './project-files.js';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createProduct, reconcileImportedAuthority, updateModule } from './core.js';
import { assertValidSnapshot } from './validation.js';
import { saveAuthority, checkSource } from './source.js';
import { arrayField, authored, enrollNote, equal, hash, noteContent, parseNote, readNotes, renderNote, resolveLink, stringField } from './vault-notes.js';
export const vaultMarker = 'suo.vault.json';
const stateDirectory = 'suo-state';
const statePath = `${stateDirectory}/current.json`;
const journalPath = `${stateDirectory}/transaction.json`;
export async function isVault(root) {
    const marker = await optionalRead(await safePath(root, vaultMarker));
    if (marker === null)
        return false;
    const config = JSON.parse(marker);
    if (config.format !== 2 || config.adapter !== 'obsidian')
        throw new Error('unsupported Suo knowledge-store configuration');
    if (await optionalRead(join(root, 'suo/product.suo.ts')) !== null)
        throw new Error('ambiguous authority: both repo-ts and obsidian are configured');
    return true;
}
export async function initVault(root, idea, title) {
    await mkdir(root, { recursive: true });
    root = await realpath(root);
    if (await optionalRead(join(root, vaultMarker)) !== null || await optionalRead(join(root, 'suo/product.suo.ts')) !== null)
        throw new Error('Suo is already initialized here');
    if (await exists(join(root, stateDirectory)))
        throw new Error('existing suo-state must be recovered, not overwritten');
    if ((await readNotes(root)).length)
        throw new Error('existing enrolled notes require their current state; initialization cannot replace it');
    const snapshot = createProduct({ title: title ?? idea.trim().split(/\s+/).slice(0, 8).join(' '), idea });
    const notePath = 'Suo Product.md';
    if (await exists(join(root, notePath)))
        throw new Error(`${notePath} already exists`);
    await withProjectLock(root, async () => {
        const record = makeCurrent(snapshot);
        await transact(root, record, [
            { path: notePath, before: null, after: renderNote(undefined, 'product', snapshot.product, new Map()) },
            { path: vaultMarker, before: null, after: `${JSON.stringify({ format: 2, adapter: 'obsidian' }, null, 2)}\n` },
        ]);
    });
    const ignorePath = await safePath(root, '.gitignore');
    const ignore = await optionalRead(ignorePath) ?? '';
    if (!ignore.split(/\r?\n/).includes('.suo/'))
        await writeFile(ignorePath, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}.suo/\n`);
    return snapshot;
}
export async function adoptVaultNote(root, path, kind, moduleLink) {
    await requireVault(root);
    return withProjectLock(root, async () => {
        await ensureNoJournal(root);
        const actual = await safePath(root, path);
        const local = relative(root, actual).split(sep).join('/');
        if (!local.endsWith('.md') || local.split('/').some(p => p.startsWith('.') || p === 'node_modules' || p === stateDirectory) || local.startsWith('docs/suo/'))
            throw new Error('enroll a Markdown note in a scanned Vault directory');
        const before = await readFile(actual, 'utf8');
        const id = `${kind}:${randomUUID()}`;
        const after = enrollNote(before, id, kind, basename(actual, '.md'), moduleLink);
        const parsed = parseNote(local, after);
        if (kind === 'decision')
            resolveLink(await readNotes(root), parsed, moduleLink, 'module');
        if (await readFile(actual, 'utf8') !== before)
            throw new Error('note changed during enrollment');
        await atomicWrite(actual, after);
        return id;
    });
}
export async function readVaultDraft(root) {
    await requireVault(root);
    await ensureNoJournal(root);
    const head = await readVaultCurrent(root);
    const approved = head.snapshot;
    const notes = await readNotes(root);
    const products = notes.filter(n => n.kind === 'product');
    if (products.length !== 1 || products[0].id !== approved.product.id)
        throw new Error('Vault requires its original single product note');
    const noteIds = new Set(notes.map(n => n.id));
    for (const node of [...approved.modules, ...approved.decisions])
        if (!noteIds.has(node.id))
            throw new Error(`missing enrolled note ${node.id}; restore it or use an explicit delete proposal`);
    for (const note of notes) {
        if (approved.modules.some(n => n.id === note.id) && note.kind !== 'module' || approved.decisions.some(n => n.id === note.id) && note.kind !== 'decision')
            throw new Error(`${note.path}: node kind cannot change`);
    }
    let snapshot = structuredClone(approved);
    const product = products[0];
    snapshot.product = { ...snapshot.product, title: stringField(product, 'suo_title'), initialIdea: noteContent(product), activeSlice: stringField(product, 'suo_slice', 'mvp'), profile: stringField(product, 'suo_profile', 'software-product-mvp') };
    // Deterministic draft timestamps; commit assigns actual timestamps to changed records.
    const timestamp = approved.product.updatedAt;
    for (const note of notes.filter(n => n.kind === 'module')) {
        const old = snapshot.modules.find(m => m.id === note.id);
        if (!note.document.has('suo_required_checks') || !note.document.has('suo_check_rationale'))
            throw new Error(`${note.path}: required checks need explicit completion`);
        const module = {
            id: note.id, title: stringField(note, 'suo_title'), phase: stringField(note, 'suo_phase', snapshot.product.activeSlice),
            definitionStatus: old?.definitionStatus ?? 'candidate',
            dependencies: arrayField(note, 'suo_dependencies').map(link => resolveLink(notes, note, link, 'module')).sort(),
            contract: { objective: noteContent(note), frozenBehavior: arrayField(note, 'suo_frozen_behavior'), scope: arrayField(note, 'suo_scope'), nonGoals: arrayField(note, 'suo_non_goals'), acceptance: arrayField(note, 'suo_acceptance'), requiredChecks: note.document.get('suo_required_checks') === null ? null : arrayField(note, 'suo_required_checks'), checkRationale: note.document.get('suo_check_rationale') },
            createdAt: old?.createdAt ?? timestamp, updatedAt: old?.updatedAt ?? timestamp,
        };
        if (!old)
            snapshot.modules.push(module);
        else if (!equal(module, old)) {
            snapshot = updateModule(snapshot, old.id, { title: module.title, phase: module.phase, contract: module.contract }, { now: timestamp });
            snapshot.modules.find(m => m.id === old.id).dependencies = module.dependencies;
        }
    }
    for (const note of notes.filter(n => n.kind === 'decision')) {
        const old = snapshot.decisions.find(d => d.id === note.id);
        const decision = {
            ...(old ?? {}), id: note.id, moduleId: resolveLink(notes, note, stringField(note, 'suo_module'), 'module'),
            question: noteContent(note), alternatives: arrayField(note, 'suo_alternatives'),
            prerequisites: arrayField(note, 'suo_prerequisites').map(link => resolveLink(notes, note, link, 'decision')).sort(),
            evidenceRefs: arrayField(note, 'suo_evidence'), status: old?.status ?? 'proposed',
            createdAt: old?.createdAt ?? timestamp, updatedAt: old?.updatedAt ?? timestamp,
        };
        delete decision.recommendation;
        if (note.document.has('suo_recommendation')) {
            const recommendation = note.document.get('suo_recommendation');
            if (typeof recommendation !== 'string')
                throw new Error(`${note.path}: suo_recommendation must be a string`);
            decision.recommendation = recommendation;
        }
        if (!old)
            snapshot.decisions.push(decision);
        else if (!equal(old, decision)) {
            if (old.moduleId !== decision.moduleId)
                throw new Error(`${note.path}: decision ownership cannot be reassigned`);
            snapshot.decisions[snapshot.decisions.findIndex(d => d.id === old.id)] = decision;
        }
    }
    snapshot = reconcileImportedAuthority(snapshot);
    snapshot.modules.sort((a, b) => a.id.localeCompare(b.id));
    snapshot.decisions.sort((a, b) => a.id.localeCompare(b.id));
    snapshot.revision = approved.revision;
    assertValidSnapshot(snapshot);
    const before = authored(approved), after = authored(snapshot);
    const token = hash(JSON.stringify({ head: head.digest, notes: notes.map(n => [n.path, hash(n.raw)]) }));
    return { snapshot, approved, notes, token, changed: !equal(before, after), before, after, head };
}
export async function loadVaultAuthority(root) {
    const draft = await readVaultDraft(root);
    if (draft.changed)
        throw new Error('Vault has unapproved definition edits; run suo vault diff and approve the reviewed digest first');
    return draft.approved;
}
export async function compileVault(root) {
    const draft = await readVaultDraft(root);
    const cache = await safePath(root, '.suo/compiled');
    // TS is an optional inspectable artifact, never read as Vault authority.
    await saveAuthority(draft.snapshot, cache);
    await checkSource(cache);
    return { token: draft.token, changed: draft.changed, generated: join(cache, 'suo', 'product.suo.ts') };
}
export async function approveVaultDraft(root, token) {
    return withProjectLock(root, async () => {
        const draft = await readVaultDraft(root);
        if (token !== draft.token)
            throw new Error('review is stale; run suo vault diff again');
        if (!draft.changed)
            return draft.approved;
        const next = draft.snapshot;
        next.revision = draft.approved.revision + 1;
        const timestamp = new Date().toISOString();
        next.product.updatedAt = timestamp;
        for (const values of [next.modules, next.decisions])
            for (const node of values) {
                const old = [...draft.approved.modules, ...draft.approved.decisions].find(n => n.id === node.id);
                if (!old)
                    node.createdAt = timestamp;
                if (!equal(old, node))
                    node.updatedAt = timestamp;
            }
        assertValidSnapshot(next);
        await verifyDraft(root, draft.token);
        await transact(root, makeCurrent(next), []);
        return next;
    });
}
// Called under the shared project writer lock by the store layer.
export async function saveVaultAuthority(snapshot, root) {
    snapshot = structuredClone(snapshot);
    for (const module of snapshot.modules) {
        if (typeof module.contract.objective !== 'string')
            throw new Error('Vault objectives must be note text; imported MarkdownDocument bindings are not supported yet');
        module.dependencies.sort();
    }
    for (const decision of snapshot.decisions)
        decision.prerequisites.sort();
    const draft = await readVaultDraft(root);
    if (draft.changed)
        throw new Error('unapproved note edits block proposal writes; review them first');
    if (snapshot.revision !== draft.approved.revision + 1)
        throw new Error('stale Vault revision');
    const nodes = [
        { kind: 'product', value: snapshot.product }, ...snapshot.modules.map(value => ({ kind: 'module', value })), ...snapshot.decisions.map(value => ({ kind: 'decision', value })),
    ];
    const paths = new Map(draft.notes.map(n => [n.id, n.path]));
    for (const { kind, value } of nodes)
        if (!paths.has(value.id))
            paths.set(value.id, `Suo/${kind}-${hash(value.id).slice(0, 20)}.md`);
    const writes = [];
    for (const { kind, value } of nodes) {
        const note = draft.notes.find(n => n.id === value.id);
        const after = renderNote(note, kind, value, paths);
        const path = paths.get(value.id);
        if (note?.raw !== after)
            writes.push({ path, before: note?.raw ?? null, after });
    }
    const retained = new Set(nodes.map(n => n.value.id));
    for (const note of draft.notes.filter(n => !retained.has(n.id))) {
        const doc = note.document.clone();
        for (const key of Object.keys(doc.toJS()))
            if (key.startsWith('suo_'))
                doc.delete(key);
        writes.push({ path: note.path, before: note.raw, after: `---\n${doc.toString()}---\n${note.body}` });
    }
    assertValidSnapshot(snapshot);
    await verifyDraft(root, draft.token);
    await transact(root, makeCurrent(snapshot), writes);
}
export async function readVaultCurrent(root) {
    const raw = await optionalRead(await safePath(root, statePath));
    if (raw === null)
        throw new Error('missing current Vault state; restore the current files from Git or backup');
    const record = JSON.parse(raw);
    assertValidSnapshot(record.snapshot);
    if (!equal(record, makeCurrent(record.snapshot)))
        throw new Error('invalid current Vault state digest');
    return record;
}
function makeCurrent(snapshot) {
    const payload = { format: 2, snapshot };
    return { ...payload, digest: hash(JSON.stringify(payload)) };
}
async function transact(root, record, writes) {
    await safePath(root, stateDirectory);
    await mkdir(join(root, stateDirectory), { recursive: true });
    await ensureNoJournal(root);
    for (const write of writes)
        if (await optionalRead(await safePath(root, write.path)) !== write.before)
            throw new Error(`concurrent edit: ${write.path}`);
    const before = await optionalRead(await safePath(root, statePath));
    const journal = { format: 2, before, record, writes };
    await writeFile(join(root, journalPath), `${JSON.stringify(journal, null, 2)}\n`, { flag: 'wx' });
    for (const write of writes) {
        const path = await safePath(root, write.path);
        if (await optionalRead(path) !== write.before)
            throw new Error(`concurrent edit: ${write.path}; run suo vault recover`);
        await mkdir(dirname(path), { recursive: true });
        await atomicWrite(path, write.after);
    }
    if (await optionalRead(await safePath(root, statePath)) !== before)
        throw new Error('concurrent Vault state edit; run suo vault recover');
    await atomicWrite(join(root, statePath), `${JSON.stringify(record, null, 2)}\n`);
    await rm(join(root, journalPath));
}
export async function recoverVault(root) {
    return withProjectLock(root, async () => {
        const raw = await optionalRead(await safePath(root, journalPath));
        if (raw === null)
            return 'No interrupted transaction.';
        const journal = JSON.parse(raw);
        if (journal.format !== 2 || !Array.isArray(journal.writes) || !equal(journal.record, makeCurrent(journal.record.snapshot)))
            throw new Error('invalid transaction journal');
        assertValidSnapshot(journal.record.snapshot);
        const currentState = await optionalRead(await safePath(root, statePath));
        const committed = currentState !== null && equal(JSON.parse(currentState), journal.record);
        if (!committed && currentState !== journal.before)
            throw new Error('transaction current-state conflict');
        for (const write of journal.writes) {
            const current = await optionalRead(await safePath(root, write.path));
            if (current !== write.before && current !== write.after)
                throw new Error(`recovery conflict: preserve and resolve ${write.path} before retrying`);
            if (committed && current !== write.after)
                throw new Error(`committed transaction has an externally changed note: ${write.path}`);
        }
        if (!committed)
            for (const write of [...journal.writes].reverse()) {
                const path = await safePath(root, write.path);
                if (write.before === null)
                    await rm(path, { force: true });
                else
                    await atomicWrite(path, write.before);
            }
        await rm(join(root, journalPath));
        return !committed ? 'Rolled back interrupted note writes; original notes preserved.' : 'Completed committed transaction cleanup.';
    });
}
async function verifyDraft(root, token) {
    if ((await readVaultDraft(root)).token !== token)
        throw new Error('Vault changed during write preparation; retry from a fresh read');
}
async function requireVault(root) { if (!await isVault(root))
    throw new Error('not an Obsidian knowledge store'); }
async function ensureNoJournal(root) {
    if (await optionalRead(await safePath(root, journalPath)) !== null)
        throw new Error('interrupted Vault transaction; run suo vault recover (including --root if initialization was interrupted)');
}
async function atomicWrite(path, content) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, content, { flag: 'wx' });
        await rename(temporary, path);
    }
    finally {
        await rm(temporary, { force: true });
    }
}
async function optionalRead(path) {
    try {
        return await readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    }
}
async function exists(path) { try {
    await lstat(path);
    return true;
}
catch (error) {
    if (error.code === 'ENOENT')
        return false;
    throw error;
} }
//# sourceMappingURL=vault.js.map