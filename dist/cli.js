#!/usr/bin/env node
import { assertSubmission } from './protocol.js';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adoptVaultNote, approveVaultDraft, compileVault, initVault, readVaultDraft, recoverVault } from './vault.js';
import { acceptClosure, approveProposal, createProduct, findProjectRoot, generateArtifacts, loadSnapshot, nextAction, rejectClosure, rejectProposal, renderNext, saveSnapshot, stageProposal, submitClosureEnvelope, validateSnapshot, } from './index.js';
const argv = process.argv.slice(2);
const command = argv.shift();
let commandRoot = process.cwd();
let explicitRoot;
try {
    explicitRoot = flag('--root');
    commandRoot = resolve(explicitRoot ?? '.');
    switch (command) {
        case '--version':
        case '-v':
            console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
            break;
        case 'vault':
            await vaultCommand();
            break;
        case 'init':
            await initCommand();
            break;
        case 'next':
            await nextCommand();
            break;
        case 'submit':
            await submitCommand();
            break;
        case 'approve':
            await approveCommand();
            break;
        case 'reject':
            await rejectCommand();
            break;
        case 'inspect':
            await inspectCommand();
            break;
        case 'check':
            await checkCommand();
            break;
        case 'diagnose': {
            const raw = JSON.parse(await readFile(resolve(requiredArg('snapshot JSON path')), 'utf8'));
            const issues = validateSnapshot(raw);
            print({ status: issues.length ? 'needs-completion' : 'valid', issues, verification: 'Structural validation only; supplied evidence and declared identity are not independently authenticated.' });
            if (issues.length)
                process.exitCode = 1;
            break;
        }
        case 'help':
        case '--help':
        case '-h':
        case undefined:
            console.log(helpText());
            break;
        default: throw new Error(`unknown command: ${command}`);
    }
}
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
async function vaultCommand() {
    const action = requiredArg('vault action');
    if (action === 'init') {
        const idea = requiredFlag('--idea');
        const title = flag('--title');
        const root = resolve(explicitRoot ?? argv.shift() ?? commandRoot);
        const snapshot = await initVault(root, idea, title);
        await generateArtifacts(snapshot, root);
        print({ root, adapter: 'obsidian', revision: snapshot.revision });
        return;
    }
    const root = action === 'recover' && explicitRoot ? commandRoot : await findProjectRoot(commandRoot);
    switch (action) {
        case 'adopt': {
            const path = requiredArg('note path relative to project root');
            const kind = requiredFlag('--kind');
            if (kind !== 'module' && kind !== 'decision')
                throw new Error('kind must be module or decision');
            print({ id: await adoptVaultNote(root, path, kind, flag('--module')), status: 'draft' });
            break;
        }
        case 'check':
            print(await compileVault(root));
            break;
        case 'diff': {
            const draft = await readVaultDraft(root);
            print({ changed: draft.changed, digest: draft.token, before: draft.before, after: draft.after });
            break;
        }
        case 'approve': {
            if (!hasFlag('--yes'))
                throw new Error('approval requires --yes after explicit owner approval');
            const snapshot = await approveVaultDraft(root, requiredFlag('--digest'));
            await generateArtifacts(snapshot, root);
            print({ revision: snapshot.revision, next: nextAction(snapshot) });
            break;
        }
        case 'recover':
            print({ recovery: await recoverVault(root) });
            break;
        default: throw new Error('usage: suo vault init|adopt|check|diff|approve|recover');
    }
}
async function initCommand() {
    const flaggedIdea = flag('--idea');
    const positionals = positionalArgs(argv);
    const requestedRoot = explicitRoot ?? (flaggedIdea && positionals[0] ? positionals[0] : undefined);
    const root = requestedRoot ? resolve(requestedRoot) : await findProjectRoot(commandRoot, true);
    const idea = flaggedIdea ?? positionals[0];
    if (!idea?.trim())
        throw new Error('usage: suo init [project-directory] --idea "I have an idea..." [--title <title>]');
    await mkdir(root, { recursive: true });
    if (await pathExists(resolve(root, 'suo', 'product.suo.ts')) || await pathExists(resolve(root, 'suo.vault.json')))
        throw new Error(`Suo is already initialized at ${root}`);
    const title = flag('--title')?.trim() || idea.trim().split(/\s+/).slice(0, 8).join(' ');
    const productId = flag('--id');
    const activeSlice = flag('--slice');
    const profile = flag('--profile');
    const snapshot = createProduct({
        title,
        idea,
        ...(productId ? { id: productId } : {}),
        ...(activeSlice ? { activeSlice } : {}),
        ...(profile ? { profile } : {}),
    });
    await saveSnapshot(snapshot, root, { initialize: true });
    await ensureSuoIgnored(root);
    await generateArtifacts(snapshot, root);
    print({ root, authority: 'suo/product.suo.ts', documents: 'docs/suo', revision: snapshot.revision, next: nextAction(snapshot) });
}
async function nextCommand() {
    const action = nextAction(await loadSnapshot(commandRoot));
    if (hasFlag('--json'))
        print(action, true);
    else
        console.log(renderNext(action).replace(/^<!--[^\n]*-->\n?/, '').trim());
}
async function submitCommand() {
    const source = requiredArg('submission file or -');
    const envelope = await readSubmission(source);
    await mutate(snapshot => envelope.kind === 'proposal'
        ? stageProposal(snapshot, envelope)
        : submitClosureEnvelope(snapshot, envelope));
}
async function approveCommand() {
    const targetId = requiredArg('proposal or closure id');
    if (!hasFlag('--yes'))
        throw new Error('approval requires --yes after explicit owner or verifier approval');
    const verifier = flag('--verifier');
    await mutate(snapshot => {
        if (snapshot.proposals.some(value => value.id === targetId))
            return approveProposal(snapshot, targetId);
        if (snapshot.closures.some(value => value.id === targetId)) {
            if (!verifier)
                throw new Error('closure approval requires --verifier <identity>');
            return acceptClosure(snapshot, targetId, verifier);
        }
        throw new Error(`unknown proposal or closure: ${targetId}`);
    });
}
async function rejectCommand() {
    const targetId = requiredArg('proposal or closure id');
    const reason = requiredFlag('--reason');
    const verifier = flag('--verifier');
    await mutate(snapshot => {
        if (snapshot.proposals.some(value => value.id === targetId))
            return rejectProposal(snapshot, targetId, reason);
        if (snapshot.closures.some(value => value.id === targetId)) {
            if (!verifier)
                throw new Error('closure rejection requires --verifier <identity>');
            return rejectClosure(snapshot, targetId, verifier, reason);
        }
        throw new Error(`unknown proposal or closure: ${targetId}`);
    });
}
async function inspectCommand() {
    const snapshot = await loadSnapshot(commandRoot);
    const targetId = argv.find(value => !value.startsWith('--'));
    if (!targetId) {
        print({
            revision: snapshot.revision,
            product: snapshot.product,
            modules: snapshot.modules.map(value => ({ id: value.id, title: value.title, status: value.definitionStatus })),
            pendingProposals: snapshot.proposals.filter(value => value.status === 'pending').map(value => ({ id: value.id, summary: value.summary })),
            handoffs: snapshot.handoffs.map(value => ({ id: value.id, status: value.status })),
            closures: snapshot.closures.map(value => ({ id: value.id, status: value.status })),
            next: nextAction(snapshot),
        });
        return;
    }
    const record = findRecord(snapshot, targetId);
    if (!record)
        throw new Error(`unknown record: ${targetId}`);
    print(record, hasFlag('--json'));
}
async function checkCommand() {
    const snapshot = await loadSnapshot(commandRoot);
    const issues = validateSnapshot(snapshot);
    if (issues.length)
        throw new Error(issues.join('\n'));
    const generated = await generateArtifacts(snapshot, commandRoot);
    print({ valid: true, revision: snapshot.revision, generated });
}
async function mutate(operation) {
    const current = await loadSnapshot(commandRoot);
    const next = operation(current);
    await saveSnapshot(next, commandRoot);
    await generateArtifacts(next, commandRoot);
    print({ revision: next.revision, next: nextAction(next) });
}
function findRecord(snapshot, targetId) {
    if (snapshot.product.id === targetId)
        return snapshot.product;
    for (const values of [snapshot.modules, snapshot.decisions, snapshot.proposals, snapshot.handoffs, snapshot.realizations, snapshot.closures]) {
        const value = values.find(item => item.id === targetId);
        if (value)
            return value;
    }
    return undefined;
}
function flag(name) {
    const index = argv.indexOf(name);
    if (index < 0)
        return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith('--'))
        throw new Error(`missing value for ${name}`);
    argv.splice(index, 2);
    return value;
}
function hasFlag(name) { return argv.includes(name); }
function positionalArgs(values) {
    const valued = new Set(['--idea', '--root', '--title', '--id', '--slice', '--profile', '--reason', '--verifier']);
    const output = [];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (valued.has(value)) {
            index += 1;
            continue;
        }
        if (!value.startsWith('--'))
            output.push(value);
    }
    return output;
}
function requiredFlag(name) { const value = flag(name); if (!value)
    throw new Error(`missing ${name}`); return value; }
function requiredArg(label) { const value = argv.shift(); if (!value || value.startsWith('--'))
    throw new Error(`missing ${label}`); return value; }
async function readSubmission(path) {
    const text = path === '-' ? await readStdin() : await readFile(path, 'utf8');
    const value = JSON.parse(text);
    assertSubmission(value);
    return value;
}
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
}
function print(value, compact = false) { console.log(JSON.stringify(value, null, compact ? 0 : 2)); }
async function pathExists(path) { try {
    await access(path);
    return true;
}
catch {
    return false;
} }
async function ensureSuoIgnored(root) {
    const path = resolve(root, '.gitignore');
    const current = await pathExists(path) ? await readFile(path, 'utf8') : '';
    if (current.split(/\r?\n/).includes('.suo/'))
        return;
    const prefix = current.length && !current.endsWith('\n') ? `${current}\n` : current;
    await writeFile(path, `${prefix}.suo/\n`, 'utf8');
}
function helpText() {
    return `Suo 梭 — A shuttle for thought.

Human interaction happens through the Suo Agent Skill. This CLI is the deterministic local protocol used by agents and CI.

Usage:
  suo --version
  suo init [project-directory] --idea "I have an idea..." [--title <title>]
  suo next [--json]
  suo submit <submission.json|->
  suo approve <proposal-id> --yes
  suo approve <closure-id> --yes --verifier <identity>
  suo reject <proposal-id> --reason <reason>
  suo reject <closure-id> --reason <reason> --verifier <identity>
  suo inspect [record-id] [--json]
  suo check
  suo diagnose <raw-snapshot.json>
  suo vault init [directory] --idea <idea> [--title <title>]
  suo vault adopt <note.md> --kind module|decision [--module "[[Module note]]"]
  suo vault check
  suo vault diff
  suo vault approve --digest <reviewed-digest> --yes
  suo vault recover

All commands accept --root <project-directory>. No global active project is stored.
`;
}
//# sourceMappingURL=cli.js.map