#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { acceptClosure, approveDecision, connectModules, createModule, createProduct, deferDecision, deleteDraftDecision, deleteDraftModule, disconnectModules, freezeModule, generateArtifacts, loadSnapshot, nextAction, proposeDecision, rejectClosure, reopenClosure, reopenDecision, retireModule, saveSnapshot, startRealization, submitClosure, updateDecisionProposal, updateModule, validateSnapshot, } from './index.js';
const argv = process.argv.slice(2);
const command = argv.shift();
try {
    switch (command) {
        case 'init': {
            const productId = flag('--id');
            const activeSlice = flag('--slice');
            const profile = flag('--profile');
            const snapshot = createProduct({
                title: requiredFlag('--title'), idea: requiredFlag('--idea'),
                ...(productId ? { id: productId } : {}),
                ...(activeSlice ? { activeSlice } : {}),
                ...(profile ? { profile } : {}),
            });
            await saveSnapshot(snapshot);
            await generateArtifacts(snapshot);
            print({ workspace: '.intent-loop', revision: snapshot.revision, next: nextAction(snapshot) });
            break;
        }
        case 'next': {
            const snapshot = await loadSnapshot();
            print(nextAction(snapshot), argv.includes('--json'));
            break;
        }
        case 'status': {
            const snapshot = await loadSnapshot();
            print({ revision: snapshot.revision, product: snapshot.product, modules: snapshot.modules.map(value => ({ id: value.id, definitionStatus: value.definitionStatus })), handoffs: snapshot.handoffs.map(value => ({ id: value.id, status: value.status })), realizations: snapshot.realizations.map(value => ({ id: value.id, status: value.status })), next: nextAction(snapshot) });
            break;
        }
        case 'validate': {
            const snapshot = await loadSnapshot();
            const issues = validateSnapshot(snapshot);
            if (issues.length)
                throw new Error(issues.join('\n'));
            print({ valid: true, revision: snapshot.revision });
            break;
        }
        case 'generate': {
            const snapshot = await loadSnapshot();
            print({ generated: await generateArtifacts(snapshot), revision: snapshot.revision });
            break;
        }
        case 'module':
            await moduleCommand();
            break;
        case 'decision':
            await decisionCommand();
            break;
        case 'realization':
            await realizationCommand();
            break;
        case 'closure':
            await closureCommand();
            break;
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
async function moduleCommand() {
    const action = argv.shift();
    switch (action) {
        case 'create': {
            const moduleId = requiredArg('module id');
            const phase = flag('--phase');
            await mutate(snapshot => createModule(snapshot, { id: moduleId, title: requiredFlag('--title'), ...(phase ? { phase } : {}) }));
            break;
        }
        case 'update': {
            const moduleId = requiredArg('module id');
            const patch = await readJson(requiredFlag('--file'));
            await mutate(snapshot => updateModule(snapshot, moduleId, patch));
            break;
        }
        case 'delete':
            await mutate(snapshot => deleteDraftModule(snapshot, requiredArg('module id')));
            break;
        case 'retire':
            await mutate(snapshot => retireModule(snapshot, requiredArg('module id')));
            break;
        case 'connect': {
            const moduleId = requiredArg('module id');
            const dependencyId = requiredArg('dependency id');
            await mutate(snapshot => connectModules(snapshot, moduleId, dependencyId));
            break;
        }
        case 'disconnect': {
            const moduleId = requiredArg('module id');
            const dependencyId = requiredArg('dependency id');
            await mutate(snapshot => disconnectModules(snapshot, moduleId, dependencyId));
            break;
        }
        case 'freeze':
            await mutate(snapshot => freezeModule(snapshot, requiredArg('module id')));
            break;
        default: throw new Error(`unknown module command: ${String(action)}`);
    }
}
async function decisionCommand() {
    const action = argv.shift();
    switch (action) {
        case 'propose': {
            const input = await readJson(requiredFlag('--file'));
            await mutate(snapshot => proposeDecision(snapshot, input));
            break;
        }
        case 'update': {
            const decisionId = requiredArg('decision id');
            const patch = await readJson(requiredFlag('--file'));
            await mutate(snapshot => updateDecisionProposal(snapshot, decisionId, patch));
            break;
        }
        case 'delete':
            await mutate(snapshot => deleteDraftDecision(snapshot, requiredArg('decision id')));
            break;
        case 'approve': {
            const decisionId = requiredArg('decision id');
            await mutate(snapshot => approveDecision(snapshot, decisionId, { choice: requiredFlag('--choice'), rationale: requiredFlag('--rationale') }));
            break;
        }
        case 'defer': {
            const decisionId = requiredArg('decision id');
            await mutate(snapshot => deferDecision(snapshot, decisionId, requiredFlag('--rationale')));
            break;
        }
        case 'reopen': {
            const decisionId = requiredArg('decision id');
            const successorId = flag('--id');
            await mutate(snapshot => reopenDecision(snapshot, decisionId, successorId ? { id: successorId } : {}));
            break;
        }
        default: throw new Error(`unknown decision command: ${String(action)}`);
    }
}
async function realizationCommand() {
    const action = argv.shift();
    if (action !== 'start')
        throw new Error(`unknown realization command: ${String(action)}`);
    const handoffId = requiredArg('handoff id');
    const realizationId = flag('--id');
    const agent = flag('--agent');
    await mutate(snapshot => startRealization(snapshot, handoffId, { ...(realizationId ? { id: realizationId } : {}), ...(agent ? { agent } : {}) }));
}
async function closureCommand() {
    const action = argv.shift();
    switch (action) {
        case 'submit': {
            const realizationId = requiredArg('realization id');
            const submission = await readJson(requiredFlag('--file'));
            const closureId = flag('--id');
            await mutate(snapshot => submitClosure(snapshot, realizationId, submission, closureId ? { id: closureId } : {}));
            break;
        }
        case 'accept': {
            const closureId = requiredArg('closure id');
            await mutate(snapshot => acceptClosure(snapshot, closureId, requiredFlag('--verifier')));
            break;
        }
        case 'reject': {
            const closureId = requiredArg('closure id');
            await mutate(snapshot => rejectClosure(snapshot, closureId, requiredFlag('--verifier'), requiredFlag('--reason')));
            break;
        }
        case 'reopen': {
            const realizationId = requiredArg('realization id');
            const decisionId = flag('--decision-id');
            await mutate(snapshot => reopenClosure(snapshot, realizationId, requiredFlag('--reason'), decisionId ? { id: decisionId } : {}));
            break;
        }
        default: throw new Error(`unknown closure command: ${String(action)}`);
    }
}
async function mutate(operation) {
    const current = await loadSnapshot();
    const next = operation(current);
    if (next.revision !== current.revision)
        await saveSnapshot(next);
    await generateArtifacts(next);
    print({ revision: next.revision, next: nextAction(next) });
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
function requiredFlag(name) { const value = flag(name); if (!value)
    throw new Error(`missing ${name}`); return value; }
function requiredArg(label) { const value = argv.shift(); if (!value || value.startsWith('--'))
    throw new Error(`missing ${label}`); return value; }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function print(value, compact = false) { console.log(JSON.stringify(value, null, compact ? 0 : 2)); }
function helpText() {
    return `IntentLoop

Usage:
  iloop init --title <title> --idea <idea> [--id <id>] [--slice mvp]
  iloop next [--json]
  iloop status | validate | generate

  iloop module create <id> --title <title> [--phase mvp]
  iloop module update <id> --file <module-patch.json>
  iloop module connect <module-id> <dependency-id>
  iloop module disconnect <module-id> <dependency-id>
  iloop module freeze <id>
  iloop module delete <id>
  iloop module retire <id>

  iloop decision propose --file <decision.json>
  iloop decision update <id> --file <patch.json>
  iloop decision delete <id>
  iloop decision approve <id> --choice <choice> --rationale <rationale>
  iloop decision defer <id> --rationale <rationale>
  iloop decision reopen <id> [--id <successor-id>]

  iloop realization start <handoff-id> [--id <id>] [--agent <agent>]
  iloop closure submit <realization-id> --file <closure.json> [--id <id>]
  iloop closure accept <closure-id> --verifier <name>
  iloop closure reject <closure-id> --verifier <name> --reason <reason>
  iloop closure reopen <realization-id> --reason <reason>
`;
}
//# sourceMappingURL=cli.js.map