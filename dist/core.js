import { inheritObservation, canonicalJson } from './concurrency.js';
import { assertSubmission, assertClosureSubmission, assertOperation, assertDecisionProposal } from './protocol.js';
import { assertValidSnapshot } from './validation.js';
import { createHash, randomUUID } from 'node:crypto';
import { DirectedGraph } from 'graphology';
import { hasCycle, topologicalSort, willCreateCycle } from 'graphology-dag';
const now = (value) => value ?? new Date().toISOString();
const id = (prefix, value) => value ?? `${prefix}:${randomUUID()}`;
const copy = (snapshot) => { assertValidSnapshot(snapshot); return inheritObservation(snapshot, structuredClone(snapshot)); };
const commit = (snapshot, timestamp) => {
    snapshot.revision += 1;
    snapshot.product.updatedAt = timestamp;
    assertValidSnapshot(snapshot);
    return snapshot;
};
export function createProduct(input, options = {}) {
    const timestamp = now(options.now);
    if (!input.title.trim() || !input.idea.trim())
        throw new Error('title and idea are required');
    return {
        schemaVersion: 3,
        revision: 0,
        product: {
            id: id('product', input.id),
            title: input.title.trim(),
            initialIdea: input.idea.trim(),
            activeSlice: input.activeSlice?.trim() || 'mvp',
            profile: input.profile?.trim() || 'software-product-mvp',
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        modules: [], decisions: [], proposals: [], handoffs: [], realizations: [], closures: [],
    };
}
const emptyContract = () => ({ objective: '', frozenBehavior: [], scope: [], nonGoals: [], acceptance: [], requiredChecks: null, checkRationale: null });
export function createModule(snapshot, input, options = {}) {
    assertOperation({ type: 'create_module', module: input });
    if (snapshot.modules.some(value => value.id === input.id))
        throw new Error(`module already exists: ${input.id}`);
    const timestamp = now(options.now);
    const next = copy(snapshot);
    next.modules.push({
        id: input.id,
        title: input.title.trim(),
        phase: input.phase?.trim() || snapshot.product.activeSlice,
        definitionStatus: 'candidate',
        dependencies: [],
        contract: input.contract ? structuredClone(input.contract) : emptyContract(),
        createdAt: timestamp,
        updatedAt: timestamp,
    });
    return commit(next, timestamp);
}
export function updateModule(snapshot, moduleId, patch, options = {}) {
    assertOperation({ type: 'update_module', moduleId, patch });
    const next = copy(snapshot);
    const module = requireModule(next, moduleId);
    if (['superseded', 'retired'].includes(module.definitionStatus))
        throw new Error(`cannot update ${module.definitionStatus} module: ${moduleId}`);
    if (patch.title !== undefined)
        module.title = patch.title.trim();
    if (patch.phase !== undefined)
        module.phase = patch.phase.trim();
    if (patch.contract !== undefined)
        module.contract = structuredClone(patch.contract);
    if (['candidate', 'frozen'].includes(module.definitionStatus))
        module.definitionStatus = 'shaping';
    module.updatedAt = now(options.now);
    invalidateModuleAndDownstream(next, moduleId);
    return commit(next, module.updatedAt);
}
export function deleteDraftModule(snapshot, moduleId, options = {}) {
    const module = requireModule(snapshot, moduleId);
    if (!['candidate', 'shaping'].includes(module.definitionStatus))
        throw new Error('only candidate or shaping modules can be deleted');
    if (snapshot.modules.some(value => value.dependencies.includes(moduleId)))
        throw new Error('cannot delete a referenced module');
    if (snapshot.decisions.some(value => value.moduleId === moduleId) || snapshot.handoffs.some(value => value.moduleId === moduleId))
        throw new Error('cannot delete a module with durable records');
    const next = copy(snapshot);
    next.modules = next.modules.filter(value => value.id !== moduleId);
    return commit(next, now(options.now));
}
export function retireModule(snapshot, moduleId, options = {}) {
    const next = copy(snapshot);
    const module = requireModule(next, moduleId);
    module.definitionStatus = 'retired';
    module.updatedAt = now(options.now);
    invalidateModuleAndDownstream(next, moduleId);
    return commit(next, module.updatedAt);
}
export function connectModules(snapshot, moduleId, dependencyId, options = {}) {
    if (moduleId === dependencyId)
        throw new Error('a module cannot depend on itself');
    const next = copy(snapshot);
    const module = requireModule(next, moduleId);
    requireModule(next, dependencyId);
    if (module.dependencies.includes(dependencyId))
        return snapshot;
    const graph = moduleGraph(next);
    // Edges point prerequisite -> dependent.
    if (willCreateCycle(graph, dependencyId, moduleId))
        throw new Error(`dependency would create a cycle: ${dependencyId} -> ${moduleId}`);
    module.dependencies.push(dependencyId);
    module.dependencies.sort();
    if (module.definitionStatus === 'frozen')
        module.definitionStatus = 'shaping';
    module.updatedAt = now(options.now);
    invalidateModuleAndDownstream(next, moduleId);
    return commit(next, module.updatedAt);
}
export function disconnectModules(snapshot, moduleId, dependencyId, options = {}) {
    const next = copy(snapshot);
    const module = requireModule(next, moduleId);
    if (!module.dependencies.includes(dependencyId))
        return snapshot;
    module.dependencies = module.dependencies.filter(value => value !== dependencyId);
    if (module.definitionStatus === 'frozen')
        module.definitionStatus = 'shaping';
    module.updatedAt = now(options.now);
    invalidateModuleAndDownstream(next, moduleId);
    return commit(next, module.updatedAt);
}
export function proposeDecision(snapshot, input, options = {}) {
    assertDecisionProposal(input);
    requireModule(snapshot, input.moduleId);
    if (snapshot.decisions.some(value => value.id === input.id))
        throw new Error(`decision already exists: ${input.id}`);
    for (const prerequisite of input.prerequisites)
        requireDecision(snapshot, prerequisite);
    const timestamp = now(options.now);
    const next = copy(snapshot);
    next.decisions.push({ ...structuredClone(input), status: input.status ?? 'proposed', createdAt: timestamp, updatedAt: timestamp });
    const module = requireModule(next, input.moduleId);
    if (['candidate', 'frozen'].includes(module.definitionStatus))
        module.definitionStatus = 'shaping';
    invalidateModuleAndDownstream(next, input.moduleId);
    return commit(next, timestamp);
}
export function updateDecisionProposal(snapshot, decisionId, patch, options = {}) {
    assertOperation({ type: 'update_decision', decisionId, patch });
    const next = copy(snapshot);
    const decision = requireDecision(next, decisionId);
    if (patch.prerequisites)
        for (const prerequisite of patch.prerequisites)
            requireDecision(next, prerequisite);
    if (patch.question !== undefined)
        decision.question = patch.question.trim();
    if (patch.alternatives !== undefined)
        decision.alternatives = structuredClone(patch.alternatives);
    if (patch.recommendation !== undefined)
        decision.recommendation = patch.recommendation;
    if (patch.prerequisites !== undefined)
        decision.prerequisites = [...patch.prerequisites];
    if (patch.evidenceRefs !== undefined)
        decision.evidenceRefs = [...patch.evidenceRefs];
    if (hasCycle(decisionGraph(next)))
        throw new Error('decision prerequisites would create a cycle');
    const timestamp = now(options.now);
    decision.updatedAt = timestamp;
    invalidateModuleAndDownstream(next, decision.moduleId);
    return commit(next, timestamp);
}
export function deleteDraftDecision(snapshot, decisionId, options = {}) {
    const decision = requireDecision(snapshot, decisionId);
    if (snapshot.decisions.some(value => value.prerequisites.includes(decisionId)))
        throw new Error('cannot delete a referenced decision');
    const next = copy(snapshot);
    next.decisions = next.decisions.filter(value => value.id !== decisionId);
    for (const handoff of next.handoffs)
        handoff.decisionIds = handoff.decisionIds.filter(value => value !== decisionId);
    invalidateModuleAndDownstream(next, decision.moduleId);
    return commit(next, now(options.now));
}
export function approveDecision(snapshot, decisionId, input, options = {}) {
    assertOperation({ type: 'approve_decision', decisionId, ...input });
    const next = copy(snapshot);
    const decision = requireDecision(next, decisionId);
    if (!['open', 'proposed'].includes(decision.status))
        throw new Error(`cannot approve ${decision.status} decision`);
    for (const prerequisite of decision.prerequisites) {
        const status = requireDecision(next, prerequisite).status;
        if (!['approved', 'deferred'].includes(status))
            throw new Error(`decision prerequisite is unresolved: ${prerequisite}`);
    }
    const timestamp = now(options.now);
    decision.status = 'approved';
    decision.ownerChoice = input.choice.trim();
    decision.rationale = input.rationale.trim();
    if (input.evidenceRefs)
        decision.evidenceRefs = [...input.evidenceRefs];
    decision.updatedAt = timestamp;
    invalidateModuleAndDownstream(next, decision.moduleId);
    return commit(next, timestamp);
}
export function deferDecision(snapshot, decisionId, rationale, options = {}) {
    assertOperation({ type: 'defer_decision', decisionId, rationale });
    const next = copy(snapshot);
    const decision = requireDecision(next, decisionId);
    if (!['open', 'proposed'].includes(decision.status))
        throw new Error(`cannot defer ${decision.status} decision`);
    const timestamp = now(options.now);
    decision.status = 'deferred';
    decision.rationale = rationale.trim();
    decision.updatedAt = timestamp;
    invalidateModuleAndDownstream(next, decision.moduleId);
    return commit(next, timestamp);
}
export function reopenDecision(snapshot, decisionId, options = {}) {
    const next = copy(snapshot);
    const decision = requireDecision(next, decisionId);
    if (!['approved', 'deferred'].includes(decision.status))
        throw new Error(`cannot reopen ${decision.status} decision`);
    const timestamp = now(options.now);
    decision.status = 'proposed';
    delete decision.ownerChoice;
    delete decision.rationale;
    decision.updatedAt = timestamp;
    const module = requireModule(next, decision.moduleId);
    if (module.definitionStatus === 'frozen')
        module.definitionStatus = 'shaping';
    invalidateModuleAndDownstream(next, decision.moduleId);
    return commit(next, timestamp);
}
export function freezeModule(snapshot, moduleId, options = {}) {
    const next = copy(snapshot);
    const module = requireModule(next, moduleId);
    for (const dependency of module.dependencies) {
        if (requireModule(next, dependency).definitionStatus !== 'frozen')
            throw new Error(`module dependency is not frozen: ${dependency}`);
    }
    const unresolved = next.decisions.filter(value => value.moduleId === moduleId && !['approved', 'deferred', 'superseded'].includes(value.status));
    if (unresolved.length)
        throw new Error(`module has unresolved decisions: ${unresolved.map(value => value.id).join(', ')}`);
    const gaps = contractGaps(module.contract);
    if (gaps.length)
        throw new Error(`module contract is incomplete: ${gaps.join(', ')}`);
    const timestamp = now(options.now);
    module.definitionStatus = 'frozen';
    module.updatedAt = timestamp;
    invalidateModuleAndDownstream(next, moduleId);
    module.definitionStatus = 'frozen';
    createCurrentHandoff(next, module, timestamp);
    return commit(next, timestamp);
}
export function startRealization(snapshot, handoffId, input, options = {}) {
    const next = copy(snapshot);
    const handoff = requireHandoff(next, handoffId);
    if (handoff.status !== 'current')
        throw new Error(`handoff is not current: ${handoff.status}`);
    if (next.realizations.some(value => value.handoffId === handoffId && ['in_progress', 'closure_submitted', 'reopened'].includes(value.status)))
        throw new Error('handoff already has an active realization');
    const agent = input.agent?.trim();
    if (!agent)
        throw new Error('realization agent identity is required');
    const timestamp = now(options.now);
    const realization = {
        id: id('realization', input.id), moduleId: handoff.moduleId, handoffId: handoff.id, definitionDigest: handoff.contractDigest,
        status: 'in_progress', implementationRefs: [], startedAt: timestamp, updatedAt: timestamp,
        agent,
    };
    next.realizations.push(realization);
    handoff.status = 'in_delivery';
    return commit(next, timestamp);
}
export function submitClosure(snapshot, realizationId, submission, options = {}) {
    assertClosureSubmission(submission);
    const next = copy(snapshot);
    const realization = requireRealization(next, realizationId);
    if (!['in_progress', 'reopened'].includes(realization.status))
        throw new Error(`cannot submit closure for ${realization.status} realization`);
    const handoff = requireHandoff(next, realization.handoffId);
    if (!['in_delivery', 'current'].includes(handoff.status) || handoff.contractDigest !== realization.definitionDigest)
        throw new Error('realization targets a stale handoff');
    if (submission.definitionDigest !== handoff.contractDigest)
        throw new Error('closure baseline conflict: observed definition digest differs');
    const issues = closureCoverage(submission, requireModule(next, handoff.moduleId).contract);
    if (issues.length)
        throw new Error(issues.join('; '));
    if (!submission.implementationRefs.length)
        throw new Error('closure requires at least one implementation reference');
    const timestamp = now(options.now);
    const closure = {
        ...structuredClone(submission), id: id('closure', options.id), realizationId, handoffId: handoff.id,
        definitionDigest: handoff.contractDigest, status: 'submitted', submittedAt: timestamp,
    };
    next.closures.push(closure);
    realization.status = 'closure_submitted';
    realization.implementationRefs = structuredClone(submission.implementationRefs);
    realization.closureId = closure.id;
    realization.updatedAt = timestamp;
    return commit(next, timestamp);
}
export function acceptClosure(snapshot, closureId, verifier, options = {}) {
    const next = copy(snapshot);
    const closure = requireClosure(next, closureId);
    if (closure.status !== 'submitted')
        throw new Error(`closure is ${closure.status}`);
    const realization = requireRealization(next, closure.realizationId);
    const verifierIdentity = verifier.trim();
    if (!verifierIdentity)
        throw new Error('closure verifier is required');
    if (realization.agent === verifierIdentity)
        throw new Error('an implementation agent cannot accept its own closure');
    const handoff = requireHandoff(next, closure.handoffId);
    if (handoff.contractDigest !== closure.definitionDigest || handoff.status !== 'in_delivery')
        throw new Error('closure targets a stale handoff');
    const issues = closureCoverage(closure, requireModule(next, handoff.moduleId).contract, true);
    if (issues.length)
        throw new Error(issues.join('; '));
    if (closure.deviations.some(value => value.requiresProductDecision) || closure.newProductQuestions.length)
        throw new Error('closure requires Product reconciliation');
    const timestamp = now(options.now);
    closure.status = 'accepted';
    closure.verifier = verifierIdentity;
    closure.decidedAt = timestamp;
    realization.status = 'closed';
    realization.updatedAt = timestamp;
    handoff.status = 'closed';
    return commit(next, timestamp);
}
export function rejectClosure(snapshot, closureId, verifier, reason, options = {}) {
    const next = copy(snapshot);
    const closure = requireClosure(next, closureId);
    if (closure.status !== 'submitted')
        throw new Error(`closure is ${closure.status}`);
    const realization = requireRealization(next, closure.realizationId);
    const verifierIdentity = verifier.trim();
    if (!verifierIdentity)
        throw new Error('closure verifier is required');
    if (realization.agent === verifierIdentity)
        throw new Error('an implementation agent cannot reject its own closure');
    const rejectionReason = reason.trim();
    if (!rejectionReason)
        throw new Error('closure rejection reason is required');
    const timestamp = now(options.now);
    closure.status = 'rejected';
    closure.verifier = verifierIdentity;
    closure.rejectionReason = rejectionReason;
    closure.decidedAt = timestamp;
    realization.status = 'reopened';
    realization.updatedAt = timestamp;
    return commit(next, timestamp);
}
export function reopenClosure(snapshot, realizationId, reason, options = {}) {
    const next = copy(snapshot);
    const realization = requireRealization(next, realizationId);
    if (realization.status !== 'closed')
        throw new Error('only a closed realization can be reopened');
    const timestamp = now(options.now);
    realization.status = 'reopened';
    for (const closure of next.closures.filter(value => value.realizationId === realization.id))
        closure.status = 'stale';
    realization.updatedAt = timestamp;
    const handoff = requireHandoff(next, realization.handoffId);
    handoff.status = 'in_delivery';
    const module = requireModule(next, realization.moduleId);
    const decisionId = id('decision', options.id);
    next.decisions.push({
        id: decisionId, moduleId: module.id, question: `Closure reopened: ${reason.trim()}`, status: 'proposed', alternatives: [],
        recommendation: 'Reconcile observed behavior with the current Product handoff.', prerequisites: [], evidenceRefs: [], createdAt: timestamp, updatedAt: timestamp,
    });
    return commit(next, timestamp);
}
export function stageProposal(snapshot, input, options = {}) {
    assertSubmission(input);
    if (input.expectedRevision !== snapshot.revision)
        throw new Error(`proposal baseline conflict: expected ${input.expectedRevision}, current ${snapshot.revision}; inspect current authority before resubmitting`);
    if (!input.summary.trim())
        throw new Error('proposal summary is required');
    if (!input.operations.length)
        throw new Error('proposal requires at least one operation');
    const proposalId = id('proposal', input.id ?? options.id);
    if (snapshot.proposals.some(value => value.id === proposalId))
        throw new Error(`proposal already exists: ${proposalId}`);
    const timestamp = now(options.now);
    const next = copy(snapshot);
    const scopeDigest = proposalScopeDigest(snapshot, input.operations);
    const proposal = {
        id: proposalId,
        status: 'pending',
        summary: input.summary.trim(),
        baseRevision: snapshot.revision,
        ...(scopeDigest ? { scopeDigest } : {}),
        baseDigest: definitionDigest(snapshot),
        operations: structuredClone(input.operations),
        submittedAt: timestamp,
    };
    next.proposals.push(proposal);
    return next;
}
export function approveProposal(snapshot, proposalId, options = {}) {
    assertValidSnapshot(snapshot);
    const proposal = requireProposal(snapshot, proposalId);
    if (proposal.status !== 'pending')
        throw new Error(`proposal is ${proposal.status}`);
    if (proposal.baseDigest !== definitionDigest(snapshot) && (!proposal.scopeDigest || proposal.scopeDigest !== proposalScopeDigest(snapshot, proposal.operations))) {
        const provenance = snapshot.proposals.filter(value => value.status === 'approved').map(value => `${value.id}: ${value.summary}`).join('; ');
        throw new Error(`proposal is stale; Product conflict for ${proposal.id} (baseline ${proposal.baseRevision ?? 'unknown'}, current ${snapshot.revision}). Inspect current authority and approved decision provenance: ${provenance || 'direct authority change'}; submit a revised proposal`);
    }
    const timestamp = now(options.now);
    let next = copy(snapshot);
    const pending = requireProposal(next, proposalId);
    pending.status = 'approved';
    pending.decidedAt = timestamp;
    for (const operation of proposal.operations) {
        assertOperation(operation);
        next = applyProductOperation(next, operation, timestamp);
    }
    const approved = requireProposal(next, proposalId);
    approved.status = 'approved';
    approved.decidedAt = timestamp;
    next.revision = snapshot.revision + 1;
    next.product.updatedAt = timestamp;
    assertValidSnapshot(next);
    return next;
}
export function rejectProposal(snapshot, proposalId, reason, options = {}) {
    const next = copy(snapshot);
    const proposal = requireProposal(next, proposalId);
    if (proposal.status !== 'pending')
        throw new Error(`proposal is ${proposal.status}`);
    const timestamp = now(options.now);
    proposal.status = 'rejected';
    proposal.rejectionReason = reason.trim();
    proposal.decidedAt = timestamp;
    return commit(next, timestamp);
}
export function submitClosureEnvelope(snapshot, envelope, options = {}) {
    assertSubmission(envelope);
    const timestamp = now(options.now);
    let next = copy(snapshot);
    let realizationId = envelope.realizationId;
    if (realizationId) {
        const realization = requireRealization(next, realizationId);
        if (realization.handoffId !== envelope.handoffId)
            throw new Error('realization does not target the supplied handoff');
    }
    else {
        const active = next.realizations.find(value => value.handoffId === envelope.handoffId && ['in_progress', 'reopened'].includes(value.status));
        if (active)
            realizationId = active.id;
        else {
            realizationId = id('realization');
            next = startRealization(next, envelope.handoffId, { id: realizationId, agent: envelope.agent }, { now: timestamp });
        }
    }
    if (requireRealization(next, realizationId).agent !== envelope.agent.trim())
        throw new Error('declared agent does not match realization agent');
    next = submitClosure(next, realizationId, envelope.submission, {
        ...(envelope.id ? { id: envelope.id } : {}),
        now: timestamp,
    });
    next.revision = snapshot.revision + 1;
    next.product.updatedAt = timestamp;
    assertValidSnapshot(next);
    return next;
}
export function nextAction(snapshot) {
    assertValidSnapshot(snapshot);
    const pendingProposal = snapshot.proposals.find(value => value.status === 'pending');
    if (pendingProposal)
        return {
            type: 'review_proposal',
            proposalId: pendingProposal.id,
            title: pendingProposal.summary,
            whyNow: 'An agent proposal is awaiting explicit owner authority.',
            expectedOutcome: 'Approve the exact change set or reject it with a concrete reason.',
        };
    const submitted = snapshot.closures.find(value => value.status === 'submitted');
    if (submitted) {
        const realization = requireRealization(snapshot, submitted.realizationId);
        return { type: 'review_closure', moduleId: realization.moduleId, closureId: submitted.id, title: `Review closure for ${requireModule(snapshot, realization.moduleId).title}`, whyNow: 'An external agent has submitted implementation evidence.', expectedOutcome: 'Accept the closure, reject it with a concrete reason, or reopen Product definition.' };
    }
    const activeRealization = snapshot.realizations.find(value => ['in_progress', 'closure_submitted', 'reopened'].includes(value.status));
    if (activeRealization)
        return { type: 'await_delivery', moduleId: activeRealization.moduleId, realizationId: activeRealization.id, title: `Await closure for ${requireModule(snapshot, activeRealization.moduleId).title}`, whyNow: 'The current handoff is being realized externally.', expectedOutcome: 'Receive a closure submission tied to the current definition digest.' };
    const frozen = new Set(snapshot.modules.filter(value => value.definitionStatus === 'frozen').map(value => value.id));
    const eligible = snapshot.modules
        .filter(value => !['frozen', 'deferred', 'superseded', 'retired'].includes(value.definitionStatus))
        .filter(value => value.dependencies.every(dependency => frozen.has(dependency)))
        .sort((a, b) => unlockCount(snapshot, b.id) - unlockCount(snapshot, a.id) || a.phase.localeCompare(b.phase) || a.id.localeCompare(b.id));
    const module = eligible[0];
    if (module) {
        const decision = snapshot.decisions
            .filter(value => value.moduleId === module.id && ['open', 'proposed'].includes(value.status))
            .filter(value => value.prerequisites.every(prerequisite => ['approved', 'deferred'].includes(requireDecision(snapshot, prerequisite).status)))
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        const unlocks = downstream(snapshot, module.id).map(value => requireModule(snapshot, value).title);
        if (decision?.status === 'proposed')
            return { type: 'approve_decision', moduleId: module.id, decisionId: decision.id, title: decision.question, whyNow: `${module.title} is definition-ready and this proposal is awaiting owner authority.`, whatItUnlocks: unlocks, expectedOutcome: 'Approve, revise, or defer the proposal.', ...(decision.recommendation ? { recommendation: decision.recommendation } : {}) };
        if (decision)
            return { type: 'answer_decision', moduleId: module.id, decisionId: decision.id, title: decision.question, whyNow: `${module.title} is the highest-leverage unlocked module.`, whatItUnlocks: unlocks, expectedOutcome: 'Produce an owner-approved product decision.', ...(decision.recommendation ? { recommendation: decision.recommendation } : {}) };
        const gaps = contractGaps(module.contract);
        if (gaps.length)
            return { type: 'define_module', moduleId: module.id, title: `Define ${module.title}`, whyNow: `The module is unlocked but its contract is missing: ${gaps.join(', ')}.`, whatItUnlocks: unlocks, expectedOutcome: 'Complete the bounded Product contract without choosing implementation details.' };
        return { type: 'freeze_module', moduleId: module.id, title: `Freeze ${module.title}`, whyNow: 'All hard prerequisites and required Product decisions are resolved.', whatItUnlocks: unlocks, expectedOutcome: 'Create a versioned, agent-ready handoff.' };
    }
    const currentHandoff = snapshot.handoffs.find(value => value.status === 'current');
    if (currentHandoff)
        return { type: 'start_delivery', moduleId: currentHandoff.moduleId, handoffId: currentHandoff.id, title: `Hand off ${requireModule(snapshot, currentHandoff.moduleId).title}`, whyNow: 'Its Product contract is frozen and the handoff is current.', expectedOutcome: 'An external agent starts realization against this current definition digest.' };
    if (!snapshot.modules.length)
        return { type: 'clarify_idea', title: 'Identify the first product capability', whyNow: 'The idea exists but has not yet been decomposed into bounded product modules.', expectedOutcome: 'Create the smallest capability that can produce a user-observable outcome.' };
    return { type: 'definition_complete', title: 'Current product slice is complete', whyNow: 'No unresolved or deliverable module remains in the active graph.', expectedOutcome: 'Import new evidence, reopen a decision, or define the next product slice.' };
}
export function validateInvariants(snapshot) {
    const issues = [];
    for (const [label, values] of [['module', snapshot.modules], ['decision', snapshot.decisions], ['proposal', snapshot.proposals], ['handoff', snapshot.handoffs], ['realization', snapshot.realizations], ['closure', snapshot.closures]]) {
        const seen = new Set();
        for (const value of values)
            seen.has(value.id) ? issues.push(`duplicate ${label} id: ${value.id}`) : seen.add(value.id);
    }
    if (issues.length)
        return issues; // Duplicate graph nodes must not throw during diagnostics.
    const unique = (ids, label) => { if (new Set(ids).size !== ids.length)
        issues.push(`duplicate ${label}`); };
    for (const module of snapshot.modules) {
        unique(module.contract.acceptance.map(value => value.id), `acceptance id: ${module.id}`);
        unique((module.contract.requiredChecks ?? []).map(value => value.id), `required check id: ${module.id}`);
        unique(module.dependencies, `dependency: ${module.id}`);
        if (module.definitionStatus === 'frozen' && contractGaps(module.contract).length)
            issues.push(`incomplete frozen contract: ${module.id}`);
    }
    unique(snapshot.handoffs.map(value => value.moduleId), 'current handoff module');
    for (const handoff of snapshot.handoffs) {
        if (!snapshot.modules.some(value => value.id === handoff.moduleId))
            issues.push(`unknown handoff module: ${handoff.id}`);
        unique(handoff.decisionIds, `handoff decision: ${handoff.id}`);
        for (const decisionId of handoff.decisionIds)
            if (!snapshot.decisions.some(value => value.id === decisionId && value.moduleId === handoff.moduleId))
                issues.push(`handoff decision belongs to another module or is unknown: ${handoff.id}/${decisionId}`);
        if (snapshot.modules.some(value => value.id === handoff.moduleId) && handoff.status !== 'stale' && handoff.contractDigest !== handoffDefinitionDigest(snapshot, requireModule(snapshot, handoff.moduleId)))
            issues.push(`handoff definition is not current: ${handoff.id}`);
    }
    for (const realization of snapshot.realizations) {
        if (realization.status !== 'stale' && (!snapshot.handoffs.some(value => value.id === realization.handoffId && value.status !== 'stale' && value.contractDigest === realization.definitionDigest)))
            issues.push(`realization definition is stale: ${realization.id}`);
        if (realization.agent !== realization.agent.trim())
            issues.push(`noncanonical realization agent: ${realization.id}`);
        const handoff = snapshot.handoffs.find(value => value.id === realization.handoffId);
        if (!handoff || realization.moduleId !== handoff.moduleId)
            issues.push(`realization does not match handoff: ${realization.id}`);
        const closure = snapshot.closures.find(value => value.id === realization.closureId);
        if (realization.closureId && (!closure || closure.realizationId !== realization.id))
            issues.push(`realization closure mismatch: ${realization.id}`);
        if (realization.status === 'closed' && closure?.status !== 'accepted')
            issues.push(`closed realization lacks accepted closure: ${realization.id}`);
        if (realization.status === 'closure_submitted' && closure?.status !== 'submitted')
            issues.push(`realization lacks submitted closure: ${realization.id}`);
    }
    for (const closure of snapshot.closures) {
        issues.push(...evidenceIssues(closure));
        if (closure.verifier !== undefined && closure.verifier !== closure.verifier.trim())
            issues.push(`noncanonical closure verifier: ${closure.id}`);
        const realization = snapshot.realizations.find(value => value.id === closure.realizationId);
        const handoff = snapshot.handoffs.find(value => value.id === closure.handoffId);
        if (!realization || !handoff || realization.handoffId !== closure.handoffId)
            issues.push(`closure does not match realization handoff: ${closure.id}`);
        if (handoff && closure.status !== 'stale') {
            if (closure.definitionDigest !== handoff.contractDigest || handoff.status === 'stale')
                issues.push(`closure definition is stale: ${closure.id}`);
            issues.push(...closureCoverage(closure, requireModule(snapshot, handoff.moduleId).contract, closure.status === 'accepted'));
        }
        if (closure.status === 'accepted' && (closure.deviations.some(value => value.requiresProductDecision) || closure.newProductQuestions.length))
            issues.push(`accepted closure needs Product reconciliation: ${closure.id}`);
        if (closure.status === 'submitted' && (realization?.closureId !== closure.id || realization.status !== 'closure_submitted'))
            issues.push(`submitted closure is not active: ${closure.id}`);
        if (['accepted', 'rejected'].includes(closure.status) && (!closure.verifier?.trim() || !closure.decidedAt || closure.verifier === realization?.agent))
            issues.push(`invalid closure verification identity/state: ${closure.id}`);
    }
    for (const handoff of snapshot.handoffs)
        if (handoff.status === 'closed' && !snapshot.realizations.some(value => value.handoffId === handoff.id && value.status === 'closed' && snapshot.closures.some(closure => closure.id === value.closureId && closure.status === 'accepted')))
            issues.push(`closed handoff lacks accepted realization: ${handoff.id}`);
    for (const proposal of snapshot.proposals) {
        if (proposal.baseRevision > snapshot.revision)
            issues.push(`future proposal baseline: ${proposal.id}`);
        if (proposal.status !== 'pending' && !proposal.decidedAt)
            issues.push(`decided proposal lacks decision timestamp: ${proposal.id}`);
    }
    const moduleIds = new Set(snapshot.modules.map(value => value.id));
    for (const module of snapshot.modules)
        for (const dependency of module.dependencies)
            if (!moduleIds.has(dependency))
                issues.push(`unknown module dependency: ${module.id} -> ${dependency}`);
    for (const decision of snapshot.decisions) {
        unique(decision.prerequisites, `decision prerequisite: ${decision.id}`);
        if (decision.supersedes && !snapshot.decisions.some(value => value.id === decision.supersedes && value.moduleId === decision.moduleId && value.status === 'superseded'))
            issues.push(`invalid superseded decision link: ${decision.id}`);
    }
    if (issues.length)
        return issues;
    const graph = moduleGraph(snapshot, false);
    if (hasCycle(graph))
        issues.push('module dependency graph contains a cycle');
    if (hasCycle(decisionGraph(snapshot)))
        issues.push('decision prerequisite graph contains a cycle');
    for (const decision of snapshot.decisions) {
        if (!moduleIds.has(decision.moduleId))
            issues.push(`decision references unknown module: ${decision.id}`);
        for (const prerequisite of decision.prerequisites)
            if (!snapshot.decisions.some(value => value.id === prerequisite))
                issues.push(`unknown decision prerequisite: ${decision.id} -> ${prerequisite}`);
    }
    for (const module of snapshot.modules)
        if (snapshot.handoffs.filter(value => value.moduleId === module.id && ['current', 'in_delivery'].includes(value.status)).length > 1)
            issues.push(`module has multiple active handoffs: ${module.id}`);
    return issues;
}
export function moduleTopologicalOrder(snapshot) {
    return topologicalSort(moduleGraph(snapshot));
}
function moduleGraph(snapshot, strict = true) {
    const graph = new DirectedGraph();
    for (const module of snapshot.modules)
        graph.addNode(module.id);
    for (const module of snapshot.modules)
        for (const dependency of module.dependencies) {
            if (!graph.hasNode(dependency)) {
                if (strict)
                    throw new Error(`unknown module dependency: ${dependency}`);
                else
                    continue;
            }
            graph.addEdge(dependency, module.id);
        }
    return graph;
}
function decisionGraph(snapshot) {
    const graph = new DirectedGraph();
    for (const decision of snapshot.decisions)
        graph.addNode(decision.id);
    for (const decision of snapshot.decisions)
        for (const prerequisite of decision.prerequisites)
            if (graph.hasNode(prerequisite))
                graph.addEdge(prerequisite, decision.id);
    return graph;
}
export function proseText(value) {
    return typeof value === 'string' ? value : value.content;
}
export function reconcileImportedAuthority(snapshot) {
    const next = structuredClone(snapshot);
    const changedModules = new Set(next.handoffs
        .filter(value => value.status !== 'stale')
        .filter(value => value.contractDigest !== handoffDefinitionDigest(next, requireModule(next, value.moduleId)))
        .map(value => value.moduleId));
    for (const moduleId of changedModules) {
        invalidateModuleAndDownstream(next, moduleId);
        const module = requireModule(next, moduleId);
        if (module.definitionStatus === 'frozen')
            module.definitionStatus = 'shaping';
    }
    return next;
}
function proseDigestValue(value) {
    return typeof value === 'string' ? value : { path: value.path, digest: value.digest };
}
function contractGaps(contract) {
    const gaps = [];
    if (!proseText(contract.objective).trim())
        gaps.push('objective');
    if (!contract.frozenBehavior.length)
        gaps.push('frozenBehavior');
    if (!contract.scope.length)
        gaps.push('scope');
    if (!contract.nonGoals.length)
        gaps.push('nonGoals');
    if (!contract.acceptance.length)
        gaps.push('acceptance');
    if (contract.requiredChecks === null || !contract.checkRationale?.trim())
        gaps.push('required check policy');
    return gaps;
}
function createCurrentHandoff(snapshot, module, timestamp) {
    const handoff = {
        id: `handoff:${module.id}`, moduleId: module.id, status: 'current',
        decisionIds: snapshot.decisions.filter(value => value.moduleId === module.id && ['approved', 'deferred'].includes(value.status)).map(value => value.id).sort(),
        contractDigest: handoffDefinitionDigest(snapshot, module), createdAt: timestamp,
    };
    snapshot.handoffs = snapshot.handoffs.filter(value => value.moduleId !== module.id);
    snapshot.handoffs.push(handoff);
    return handoff;
}
function invalidateModuleAndDownstream(snapshot, moduleId) {
    for (const affected of [moduleId, ...downstream(snapshot, moduleId)]) {
        for (const handoff of snapshot.handoffs.filter(value => value.moduleId === affected))
            handoff.status = 'stale';
        for (const realization of snapshot.realizations.filter(value => value.moduleId === affected))
            realization.status = 'stale';
        for (const closure of snapshot.closures.filter(value => snapshot.realizations.some(realization => realization.id === value.realizationId && realization.moduleId === affected)))
            closure.status = 'stale';
        const module = requireModule(snapshot, affected);
        if (module.definitionStatus === 'frozen')
            module.definitionStatus = 'shaping';
    }
}
export function handoffDefinitionDigest(snapshot, module) {
    // Include transitive prerequisites so evidence cannot survive a dependency edit.
    // Iteration is cycle-safe; the invariant checker rejects cycles independently.
    const ids = new Set(), queue = [module.id];
    while (queue.length) {
        const id = queue.shift();
        if (ids.has(id))
            continue;
        ids.add(id);
        queue.push(...(snapshot.modules.find(value => value.id === id)?.dependencies ?? []));
        for (const decision of snapshot.decisions.filter(value => value.moduleId === id && value.status !== 'superseded')) {
            for (const prerequisite of decision.prerequisites) {
                const source = snapshot.decisions.find(value => value.id === prerequisite);
                if (source)
                    queue.push(source.moduleId);
            }
        }
    }
    const definitions = [...ids].sort().map(id => {
        const value = snapshot.modules.find(item => item.id === id);
        if (!value)
            return { id, missing: true };
        return { id, dependencies: [...value.dependencies].sort(),
            contract: { ...value.contract, objective: proseDigestValue(value.contract.objective) },
            decisions: snapshot.decisions.filter(item => item.moduleId === id && item.status !== 'superseded')
                .sort((a, b) => a.id.localeCompare(b.id)).map(({ createdAt, updatedAt, ...decision }) => ({ ...decision, prerequisites: [...decision.prerequisites].sort(), evidenceRefs: [...decision.evidenceRefs].sort() })),
        };
    });
    return createHash('sha256').update(canonicalJson(definitions)).digest('hex');
}
function downstream(snapshot, moduleId) {
    const result = new Set();
    const queue = [moduleId];
    while (queue.length) {
        const current = queue.shift();
        for (const module of snapshot.modules.filter(value => value.id !== moduleId && (value.dependencies.includes(current) || snapshot.decisions.some(decision => decision.moduleId === value.id && decision.prerequisites.some(id => snapshot.decisions.some(source => source.id === id && source.moduleId === current))))))
            if (!result.has(module.id)) {
                result.add(module.id);
                queue.push(module.id);
            }
    }
    return [...result].sort();
}
function unlockCount(snapshot, moduleId) { return downstream(snapshot, moduleId).length; }
/** Only bounded edits to existing modules can commute. Structural operations keep
 * the global guard. Include relationships and lifecycle evidence conservatively. */
function proposalScopeDigest(snapshot, operations) {
    const ids = new Set();
    for (const operation of operations) {
        if (operation.type === 'update_module')
            ids.add(operation.moduleId);
        else if (['update_decision', 'approve_decision', 'defer_decision'].includes(operation.type) && 'decisionId' in operation) {
            const decision = snapshot.decisions.find(value => value.id === operation.decisionId);
            if (!decision)
                return undefined;
            ids.add(decision.moduleId);
        }
        else
            return undefined;
    }
    if (!ids.size || [...ids].some(id => !snapshot.modules.some(value => value.id === id)))
        return undefined;
    // Any dependency connection to these modules retains the global guard.
    if (snapshot.modules.some(value => ids.has(value.id) ? value.dependencies.length > 0 : value.dependencies.some(id => ids.has(id))))
        return undefined;
    if (snapshot.decisions.some(value => value.prerequisites.some(prerequisite => {
        const dependency = snapshot.decisions.find(item => item.id === prerequisite);
        return !dependency || ids.has(value.moduleId) !== ids.has(dependency.moduleId);
    })))
        return undefined;
    return createHash('sha256').update(canonicalJson({
        product: { ...snapshot.product, updatedAt: undefined },
        modules: snapshot.modules.filter(value => ids.has(value.id)),
        decisions: snapshot.decisions.filter(value => ids.has(value.moduleId)),
        handoffs: snapshot.handoffs.filter(value => ids.has(value.moduleId)),
        realizations: snapshot.realizations.filter(value => ids.has(value.moduleId)),
        // Cross-module decision prerequisites can affect readiness.
        prerequisites: snapshot.decisions.map(value => [value.id, value.prerequisites]),
    })).digest('hex');
}
function definitionDigest(snapshot) {
    return createHash('sha256').update(canonicalJson({
        product: {
            id: snapshot.product.id,
            title: snapshot.product.title,
            initialIdea: snapshot.product.initialIdea,
            activeSlice: snapshot.product.activeSlice,
            profile: snapshot.product.profile,
        },
        modules: snapshot.modules,
        decisions: snapshot.decisions,
    })).digest('hex');
}
function applyProductOperation(snapshot, operation, timestamp) {
    const options = { now: timestamp };
    switch (operation.type) {
        case 'create_module': return createModule(snapshot, operation.module, options);
        case 'update_module': return updateModule(snapshot, operation.moduleId, operation.patch, options);
        case 'delete_module': return deleteDraftModule(snapshot, operation.moduleId, options);
        case 'retire_module': return retireModule(snapshot, operation.moduleId, options);
        case 'connect_modules': return connectModules(snapshot, operation.moduleId, operation.dependencyId, options);
        case 'disconnect_modules': return disconnectModules(snapshot, operation.moduleId, operation.dependencyId, options);
        case 'record_decision': {
            const input = operation.decision;
            let next = proposeDecision(snapshot, {
                id: input.id,
                moduleId: input.moduleId,
                question: input.question,
                alternatives: structuredClone(input.alternatives),
                ...(input.recommendation ? { recommendation: input.recommendation } : {}),
                prerequisites: [...input.prerequisites],
                evidenceRefs: [...input.evidenceRefs],
            }, options);
            next = approveDecision(next, input.id, {
                choice: input.choice,
                rationale: input.rationale,
                evidenceRefs: [...input.evidenceRefs],
            }, options);
            return next;
        }
        case 'update_decision': return updateDecisionProposal(snapshot, operation.decisionId, operation.patch, options);
        case 'delete_decision': return deleteDraftDecision(snapshot, operation.decisionId, options);
        case 'approve_decision': return approveDecision(snapshot, operation.decisionId, {
            choice: operation.choice,
            rationale: operation.rationale,
            ...(operation.evidenceRefs ? { evidenceRefs: operation.evidenceRefs } : {}),
        }, options);
        case 'defer_decision': return deferDecision(snapshot, operation.decisionId, operation.rationale, options);
        case 'reopen_decision': return reopenDecision(snapshot, operation.decisionId, {
            ...(operation.successorId ? { id: operation.successorId } : {}),
            now: timestamp,
        });
        case 'freeze_module': {
            if (operation.expectedAssignee !== undefined && (typeof operation.expectedAssignee !== 'string' || !operation.expectedAssignee.trim()))
                throw new Error('expected assignee must be nonempty');
            const next = freezeModule(snapshot, operation.moduleId, options);
            const handoff = next.handoffs.find(value => value.moduleId === operation.moduleId && value.status === 'current');
            if (operation.expectedAssignee !== undefined && handoff)
                handoff.expectedAssignee = operation.expectedAssignee.trim();
            return next;
        }
        case 'reopen_closure': return reopenClosure(snapshot, operation.realizationId, operation.reason, {
            ...(operation.decisionId ? { id: operation.decisionId } : {}),
            now: timestamp,
        });
        default: {
            const unreachable = operation;
            throw new Error(`unsupported Product operation: ${JSON.stringify(unreachable)}`);
        }
    }
}
function requireModule(snapshot, moduleId) { const value = snapshot.modules.find(item => item.id === moduleId); if (!value)
    throw new Error(`unknown module: ${moduleId}`); return value; }
function requireDecision(snapshot, decisionId) { const value = snapshot.decisions.find(item => item.id === decisionId); if (!value)
    throw new Error(`unknown decision: ${decisionId}`); return value; }
function requireProposal(snapshot, proposalId) { const value = snapshot.proposals.find(item => item.id === proposalId); if (!value)
    throw new Error(`unknown proposal: ${proposalId}`); return value; }
function requireHandoff(snapshot, handoffId) { const value = snapshot.handoffs.find(item => item.id === handoffId); if (!value)
    throw new Error(`unknown handoff: ${handoffId}`); return value; }
function requireRealization(snapshot, realizationId) { const value = snapshot.realizations.find(item => item.id === realizationId); if (!value)
    throw new Error(`unknown realization: ${realizationId}`); return value; }
function requireClosure(snapshot, closureId) { const value = snapshot.closures.find(item => item.id === closureId); if (!value)
    throw new Error(`unknown closure: ${closureId}`); return value; }
function closureCoverage(closure, contract, requirePass = false) {
    const issues = evidenceIssues(closure);
    if (contract.requiredChecks === null || !contract.checkRationale?.trim())
        issues.push('required check policy is undecided');
    const exact = (actual, expected, label) => {
        if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id)))
            issues.push(`${label} must exactly cover frozen contract without duplicate or unknown IDs`);
    };
    exact(closure.acceptanceEvidence.map(value => value.acceptanceId), contract.acceptance.map(value => value.id), 'acceptance evidence');
    exact(closure.checks.map(value => value.id), (contract.requiredChecks ?? []).map(value => value.id), 'required checks');
    if (requirePass && (closure.acceptanceEvidence.some(value => value.result !== 'pass') || closure.checks.some(value => value.result !== 'pass')))
        issues.push('acceptance evidence or required checks did not pass');
    return issues;
}
function evidenceIssues(closure) {
    const issues = [];
    for (const [label, ids] of [['acceptance', closure.acceptanceEvidence.map(item => item.acceptanceId)], ['checks', closure.checks.map(item => item.id)]]) {
        if (new Set(ids).size !== ids.length)
            issues.push(`duplicate ${label} evidence IDs`);
    }
    for (const item of closure.acceptanceEvidence)
        if (item.result === 'pass' && (!item.evidence.length || item.evidence.some(value => !value.trim())))
            issues.push(`empty acceptance evidence: ${item.acceptanceId}`);
    for (const check of closure.checks) {
        if (!closure.implementationRefs.some(value => value.revision === check.revision))
            issues.push(`check revision is not an implementation revision: ${check.id}`);
        if (check.result === 'pass' && !check.evidenceRef?.trim())
            issues.push(`empty check evidence: ${check.id}`);
    }
    return issues;
}
//# sourceMappingURL=core.js.map