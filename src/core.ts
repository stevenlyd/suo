import { createHash, randomUUID } from 'node:crypto'
import { DirectedGraph } from 'graphology'
import { hasCycle, topologicalSort, willCreateCycle } from 'graphology-dag'
import type {
  Closure,
  ClosureSubmission,
  Decision,
  Handoff,
  ModuleContract,
  NextProductAction,
  ProductFrontierSnapshot,
  ProductModule,
  Realization,
} from './model.js'

export interface MutationOptions { now?: string; id?: string }

const now = (value?: string) => value ?? new Date().toISOString()
const id = (prefix: string, value?: string) => value ?? `${prefix}:${randomUUID()}`
const copy = (snapshot: ProductFrontierSnapshot): ProductFrontierSnapshot => structuredClone(snapshot)
const commit = (snapshot: ProductFrontierSnapshot, timestamp: string): ProductFrontierSnapshot => {
  snapshot.revision += 1
  snapshot.product.updatedAt = timestamp
  return snapshot
}

export function createProduct(input: { id?: string; title: string; idea: string; activeSlice?: string; profile?: string }, options: MutationOptions = {}): ProductFrontierSnapshot {
  const timestamp = now(options.now)
  if (!input.title.trim() || !input.idea.trim()) throw new Error('title and idea are required')
  return {
    schemaVersion: 1,
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
    modules: [], decisions: [], handoffs: [], realizations: [], closures: [],
  }
}

const emptyContract = (): ModuleContract => ({ objective: '', frozenBehavior: [], scope: [], nonGoals: [], acceptance: [] })

export function createModule(snapshot: ProductFrontierSnapshot, input: { id: string; title: string; phase?: string; contract?: ModuleContract }, options: MutationOptions = {}): ProductFrontierSnapshot {
  if (snapshot.modules.some(value => value.id === input.id)) throw new Error(`module already exists: ${input.id}`)
  const timestamp = now(options.now)
  const next = copy(snapshot)
  next.modules.push({
    id: input.id,
    title: input.title.trim(),
    phase: input.phase?.trim() || snapshot.product.activeSlice,
    definitionStatus: 'candidate',
    dependencies: [],
    contract: input.contract ? structuredClone(input.contract) : emptyContract(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return commit(next, timestamp)
}

export function updateModule(snapshot: ProductFrontierSnapshot, moduleId: string, patch: { title?: string; phase?: string; contract?: ModuleContract }, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const module = requireModule(next, moduleId)
  if (['superseded', 'retired'].includes(module.definitionStatus)) throw new Error(`cannot update ${module.definitionStatus} module: ${moduleId}`)
  if (patch.title !== undefined) module.title = patch.title.trim()
  if (patch.phase !== undefined) module.phase = patch.phase.trim()
  if (patch.contract !== undefined) module.contract = structuredClone(patch.contract)
  if (['candidate', 'frozen'].includes(module.definitionStatus)) module.definitionStatus = 'shaping'
  module.updatedAt = now(options.now)
  invalidateModuleAndDownstream(next, moduleId)
  return commit(next, module.updatedAt)
}

export function deleteDraftModule(snapshot: ProductFrontierSnapshot, moduleId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const module = requireModule(snapshot, moduleId)
  if (!['candidate', 'shaping'].includes(module.definitionStatus)) throw new Error('only candidate or shaping modules can be deleted')
  if (snapshot.modules.some(value => value.dependencies.includes(moduleId))) throw new Error('cannot delete a referenced module')
  if (snapshot.decisions.some(value => value.moduleId === moduleId) || snapshot.handoffs.some(value => value.moduleId === moduleId)) throw new Error('cannot delete a module with durable records')
  const next = copy(snapshot)
  next.modules = next.modules.filter(value => value.id !== moduleId)
  return commit(next, now(options.now))
}

export function retireModule(snapshot: ProductFrontierSnapshot, moduleId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const module = requireModule(next, moduleId)
  module.definitionStatus = 'retired'
  module.updatedAt = now(options.now)
  invalidateModuleAndDownstream(next, moduleId)
  return commit(next, module.updatedAt)
}

export function connectModules(snapshot: ProductFrontierSnapshot, moduleId: string, dependencyId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  if (moduleId === dependencyId) throw new Error('a module cannot depend on itself')
  const next = copy(snapshot)
  const module = requireModule(next, moduleId)
  requireModule(next, dependencyId)
  if (module.dependencies.includes(dependencyId)) return snapshot
  const graph = moduleGraph(next)
  // Edges point prerequisite -> dependent.
  if (willCreateCycle(graph, dependencyId, moduleId)) throw new Error(`dependency would create a cycle: ${dependencyId} -> ${moduleId}`)
  module.dependencies.push(dependencyId)
  module.dependencies.sort()
  if (module.definitionStatus === 'frozen') module.definitionStatus = 'shaping'
  module.updatedAt = now(options.now)
  invalidateModuleAndDownstream(next, moduleId)
  return commit(next, module.updatedAt)
}

export function disconnectModules(snapshot: ProductFrontierSnapshot, moduleId: string, dependencyId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const module = requireModule(next, moduleId)
  if (!module.dependencies.includes(dependencyId)) return snapshot
  module.dependencies = module.dependencies.filter(value => value !== dependencyId)
  if (module.definitionStatus === 'frozen') module.definitionStatus = 'shaping'
  module.updatedAt = now(options.now)
  invalidateModuleAndDownstream(next, moduleId)
  return commit(next, module.updatedAt)
}

export function proposeDecision(snapshot: ProductFrontierSnapshot, input: Omit<Decision, 'status' | 'ownerChoice' | 'rationale' | 'createdAt' | 'updatedAt'> & { status?: 'open' | 'proposed' }, options: MutationOptions = {}): ProductFrontierSnapshot {
  requireModule(snapshot, input.moduleId)
  if (snapshot.decisions.some(value => value.id === input.id)) throw new Error(`decision already exists: ${input.id}`)
  for (const prerequisite of input.prerequisites) requireDecision(snapshot, prerequisite)
  const timestamp = now(options.now)
  const next = copy(snapshot)
  next.decisions.push({ ...structuredClone(input), status: input.status ?? 'proposed', createdAt: timestamp, updatedAt: timestamp })
  const module = requireModule(next, input.moduleId)
  if (module.definitionStatus === 'candidate') module.definitionStatus = 'shaping'
  return commit(next, timestamp)
}

export function updateDecisionProposal(snapshot: ProductFrontierSnapshot, decisionId: string, patch: Partial<Pick<Decision, 'question' | 'alternatives' | 'recommendation' | 'prerequisites' | 'evidenceRefs'>>, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const decision = requireDecision(next, decisionId)
  if (!['open', 'proposed'].includes(decision.status)) throw new Error('only an open proposal can be updated')
  if (patch.prerequisites) for (const prerequisite of patch.prerequisites) requireDecision(next, prerequisite)
  if (patch.question !== undefined) decision.question = patch.question.trim()
  if (patch.alternatives !== undefined) decision.alternatives = structuredClone(patch.alternatives)
  if (patch.recommendation !== undefined) decision.recommendation = patch.recommendation
  if (patch.prerequisites !== undefined) decision.prerequisites = [...patch.prerequisites]
  if (patch.evidenceRefs !== undefined) decision.evidenceRefs = [...patch.evidenceRefs]
  if (hasCycle(decisionGraph(next))) throw new Error('decision prerequisites would create a cycle')
  const timestamp = now(options.now)
  decision.updatedAt = timestamp
  return commit(next, timestamp)
}

export function deleteDraftDecision(snapshot: ProductFrontierSnapshot, decisionId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const decision = requireDecision(snapshot, decisionId)
  if (!['open', 'proposed'].includes(decision.status)) throw new Error('only an open proposal can be deleted')
  if (snapshot.decisions.some(value => value.prerequisites.includes(decisionId))) throw new Error('cannot delete a referenced decision')
  const next = copy(snapshot)
  next.decisions = next.decisions.filter(value => value.id !== decisionId)
  return commit(next, now(options.now))
}

export function approveDecision(snapshot: ProductFrontierSnapshot, decisionId: string, input: { choice: string; rationale: string; evidenceRefs?: string[] }, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const decision = requireDecision(next, decisionId)
  if (!['open', 'proposed'].includes(decision.status)) throw new Error(`cannot approve ${decision.status} decision`)
  for (const prerequisite of decision.prerequisites) {
    const status = requireDecision(next, prerequisite).status
    if (!['approved', 'deferred'].includes(status)) throw new Error(`decision prerequisite is unresolved: ${prerequisite}`)
  }
  const timestamp = now(options.now)
  decision.status = 'approved'
  decision.ownerChoice = input.choice.trim()
  decision.rationale = input.rationale.trim()
  if (input.evidenceRefs) decision.evidenceRefs = [...input.evidenceRefs]
  decision.updatedAt = timestamp
  invalidateModuleAndDownstream(next, decision.moduleId)
  return commit(next, timestamp)
}

export function deferDecision(snapshot: ProductFrontierSnapshot, decisionId: string, rationale: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const decision = requireDecision(next, decisionId)
  if (!['open', 'proposed'].includes(decision.status)) throw new Error(`cannot defer ${decision.status} decision`)
  const timestamp = now(options.now)
  decision.status = 'deferred'
  decision.rationale = rationale.trim()
  decision.updatedAt = timestamp
  invalidateModuleAndDownstream(next, decision.moduleId)
  return commit(next, timestamp)
}

export function reopenDecision(snapshot: ProductFrontierSnapshot, decisionId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const decision = requireDecision(next, decisionId)
  if (!['approved', 'deferred'].includes(decision.status)) throw new Error(`cannot reopen ${decision.status} decision`)
  const timestamp = now(options.now)
  const successorId = id('decision', options.id)
  if (next.decisions.some(value => value.id === successorId)) throw new Error(`decision already exists: ${successorId}`)
  decision.status = 'superseded'
  decision.updatedAt = timestamp
  next.decisions.push({
    id: successorId,
    moduleId: decision.moduleId,
    question: decision.question,
    status: 'proposed',
    alternatives: structuredClone(decision.alternatives),
    ...(decision.recommendation ? { recommendation: decision.recommendation } : {}),
    prerequisites: [...decision.prerequisites],
    evidenceRefs: [...decision.evidenceRefs],
    supersedes: decision.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  for (const dependent of next.decisions) dependent.prerequisites = dependent.prerequisites.map(value => value === decisionId ? successorId : value)
  const module = requireModule(next, decision.moduleId)
  if (module.definitionStatus === 'frozen') module.definitionStatus = 'shaping'
  invalidateModuleAndDownstream(next, decision.moduleId)
  return commit(next, timestamp)
}

export function freezeModule(snapshot: ProductFrontierSnapshot, moduleId: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const module = requireModule(next, moduleId)
  for (const dependency of module.dependencies) {
    if (requireModule(next, dependency).definitionStatus !== 'frozen') throw new Error(`module dependency is not frozen: ${dependency}`)
  }
  const unresolved = next.decisions.filter(value => value.moduleId === moduleId && !['approved', 'deferred', 'superseded'].includes(value.status))
  if (unresolved.length) throw new Error(`module has unresolved decisions: ${unresolved.map(value => value.id).join(', ')}`)
  const gaps = contractGaps(module.contract)
  if (gaps.length) throw new Error(`module contract is incomplete: ${gaps.join(', ')}`)
  const timestamp = now(options.now)
  module.definitionStatus = 'frozen'
  module.updatedAt = timestamp
  invalidateModuleAndDownstream(next, moduleId)
  createCurrentHandoff(next, module, timestamp)
  return commit(next, timestamp)
}

export function startRealization(snapshot: ProductFrontierSnapshot, handoffId: string, input: { id?: string; agent?: string }, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const handoff = requireHandoff(next, handoffId)
  if (handoff.status !== 'current') throw new Error(`handoff is not current: ${handoff.status}`)
  if (next.realizations.some(value => value.handoffId === handoffId && ['in_progress', 'closure_submitted', 'reopened'].includes(value.status))) throw new Error('handoff already has an active realization')
  const timestamp = now(options.now)
  const realization: Realization = {
    id: id('realization', input.id), moduleId: handoff.moduleId, handoffId: handoff.id, handoffRevision: handoff.revision,
    status: 'in_progress', implementationRefs: [], startedAt: timestamp, updatedAt: timestamp,
    ...(input.agent ? { agent: input.agent } : {}),
  }
  next.realizations.push(realization)
  handoff.status = 'in_delivery'
  return commit(next, timestamp)
}

export function submitClosure(snapshot: ProductFrontierSnapshot, realizationId: string, submission: ClosureSubmission, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const realization = requireRealization(next, realizationId)
  if (!['in_progress', 'reopened'].includes(realization.status)) throw new Error(`cannot submit closure for ${realization.status} realization`)
  const handoff = requireHandoff(next, realization.handoffId)
  if (!['in_delivery', 'current'].includes(handoff.status) || handoff.revision !== realization.handoffRevision) throw new Error('realization targets a stale handoff')
  if (!submission.implementationRefs.length) throw new Error('closure requires at least one implementation reference')
  const timestamp = now(options.now)
  const closure: Closure = {
    ...structuredClone(submission), id: id('closure', options.id), realizationId, handoffId: handoff.id,
    handoffRevision: handoff.revision, status: 'submitted', submittedAt: timestamp,
  }
  next.closures.push(closure)
  realization.status = 'closure_submitted'
  realization.implementationRefs = structuredClone(submission.implementationRefs)
  realization.closureId = closure.id
  realization.updatedAt = timestamp
  return commit(next, timestamp)
}

export function acceptClosure(snapshot: ProductFrontierSnapshot, closureId: string, verifier: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const closure = requireClosure(next, closureId)
  if (closure.status !== 'submitted') throw new Error(`closure is ${closure.status}`)
  const realization = requireRealization(next, closure.realizationId)
  const handoff = requireHandoff(next, closure.handoffId)
  const module = requireModule(next, realization.moduleId)
  if (handoff.revision !== closure.handoffRevision || handoff.status === 'stale') throw new Error('closure targets a stale handoff')
  const expected = new Set(module.contract.acceptance.map(value => value.id))
  const results = new Map(closure.acceptanceEvidence.map(value => [value.acceptanceId, value]))
  const missing = [...expected].filter(value => !results.has(value))
  const failed = [...expected].filter(value => results.get(value)?.result !== 'pass')
  if (missing.length || failed.length) throw new Error(`acceptance evidence is incomplete: ${[...missing, ...failed].join(', ')}`)
  if (closure.checks.some(value => value.result !== 'pass')) throw new Error('closure contains checks that did not pass')
  if (closure.deviations.some(value => value.requiresProductDecision) || closure.newProductQuestions.length) throw new Error('closure requires Product reconciliation')
  const timestamp = now(options.now)
  closure.status = 'accepted'
  closure.verifier = verifier
  closure.decidedAt = timestamp
  realization.status = 'closed'
  realization.updatedAt = timestamp
  handoff.status = 'closed'
  return commit(next, timestamp)
}

export function rejectClosure(snapshot: ProductFrontierSnapshot, closureId: string, verifier: string, reason: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const closure = requireClosure(next, closureId)
  if (closure.status !== 'submitted') throw new Error(`closure is ${closure.status}`)
  const timestamp = now(options.now)
  closure.status = 'rejected'
  closure.verifier = verifier
  closure.rejectionReason = reason.trim()
  closure.decidedAt = timestamp
  const realization = requireRealization(next, closure.realizationId)
  realization.status = 'reopened'
  realization.updatedAt = timestamp
  return commit(next, timestamp)
}

export function reopenClosure(snapshot: ProductFrontierSnapshot, realizationId: string, reason: string, options: MutationOptions = {}): ProductFrontierSnapshot {
  const next = copy(snapshot)
  const realization = requireRealization(next, realizationId)
  if (realization.status !== 'closed') throw new Error('only a closed realization can be reopened')
  const timestamp = now(options.now)
  realization.status = 'reopened'
  realization.updatedAt = timestamp
  const handoff = requireHandoff(next, realization.handoffId)
  handoff.status = 'in_delivery'
  const module = requireModule(next, realization.moduleId)
  const decisionId = id('decision', options.id)
  next.decisions.push({
    id: decisionId, moduleId: module.id, question: `Closure reopened: ${reason.trim()}`, status: 'proposed', alternatives: [],
    recommendation: 'Reconcile observed behavior with the current Product handoff.', prerequisites: [], evidenceRefs: [], createdAt: timestamp, updatedAt: timestamp,
  })
  return commit(next, timestamp)
}

export function nextAction(snapshot: ProductFrontierSnapshot): NextProductAction {
  const submitted = snapshot.closures.find(value => value.status === 'submitted')
  if (submitted) {
    const realization = requireRealization(snapshot, submitted.realizationId)
    return { type: 'review_closure', moduleId: realization.moduleId, closureId: submitted.id, title: `Review closure for ${requireModule(snapshot, realization.moduleId).title}`, whyNow: 'An external agent has submitted implementation evidence.', expectedOutcome: 'Accept the closure, reject it with a concrete reason, or reopen Product definition.' }
  }
  const activeRealization = snapshot.realizations.find(value => ['in_progress', 'closure_submitted', 'reopened'].includes(value.status))
  if (activeRealization) return { type: 'await_delivery', moduleId: activeRealization.moduleId, realizationId: activeRealization.id, title: `Await closure for ${requireModule(snapshot, activeRealization.moduleId).title}`, whyNow: 'The current handoff is being realized externally.', expectedOutcome: 'Receive a closure submission tied to the exact handoff revision.' }

  const frozen = new Set(snapshot.modules.filter(value => value.definitionStatus === 'frozen').map(value => value.id))
  const eligible = snapshot.modules
    .filter(value => !['frozen', 'deferred', 'superseded', 'retired'].includes(value.definitionStatus))
    .filter(value => value.dependencies.every(dependency => frozen.has(dependency)))
    .sort((a, b) => unlockCount(snapshot, b.id) - unlockCount(snapshot, a.id) || a.phase.localeCompare(b.phase) || a.id.localeCompare(b.id))
  const module = eligible[0]
  if (module) {
    const decision = snapshot.decisions
      .filter(value => value.moduleId === module.id && ['open', 'proposed'].includes(value.status))
      .filter(value => value.prerequisites.every(prerequisite => ['approved', 'deferred'].includes(requireDecision(snapshot, prerequisite).status)))
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    const unlocks = downstream(snapshot, module.id).map(value => requireModule(snapshot, value).title)
    if (decision?.status === 'proposed') return { type: 'approve_decision', moduleId: module.id, decisionId: decision.id, title: decision.question, whyNow: `${module.title} is definition-ready and this proposal is awaiting owner authority.`, whatItUnlocks: unlocks, expectedOutcome: 'Approve, revise, or defer the proposal.', ...(decision.recommendation ? { recommendation: decision.recommendation } : {}) }
    if (decision) return { type: 'answer_decision', moduleId: module.id, decisionId: decision.id, title: decision.question, whyNow: `${module.title} is the highest-leverage unlocked module.`, whatItUnlocks: unlocks, expectedOutcome: 'Produce an owner-approved product decision.', ...(decision.recommendation ? { recommendation: decision.recommendation } : {}) }
    const gaps = contractGaps(module.contract)
    if (gaps.length) return { type: 'define_module', moduleId: module.id, title: `Define ${module.title}`, whyNow: `The module is unlocked but its contract is missing: ${gaps.join(', ')}.`, whatItUnlocks: unlocks, expectedOutcome: 'Complete the bounded Product contract without choosing implementation details.' }
    return { type: 'freeze_module', moduleId: module.id, title: `Freeze ${module.title}`, whyNow: 'All hard prerequisites and required Product decisions are resolved.', whatItUnlocks: unlocks, expectedOutcome: 'Create a versioned, agent-ready handoff.' }
  }

  const currentHandoff = snapshot.handoffs.find(value => value.status === 'current')
  if (currentHandoff) return { type: 'start_delivery', moduleId: currentHandoff.moduleId, handoffId: currentHandoff.id, title: `Hand off ${requireModule(snapshot, currentHandoff.moduleId).title}`, whyNow: 'Its Product contract is frozen and the handoff is current.', expectedOutcome: 'An external agent starts realization against this exact handoff revision.' }
  if (!snapshot.modules.length) return { type: 'clarify_idea', title: 'Identify the first product capability', whyNow: 'The idea exists but has not yet been decomposed into bounded product modules.', expectedOutcome: 'Create the smallest capability that can produce a user-observable outcome.' }
  return { type: 'definition_complete', title: 'Current product slice is complete', whyNow: 'No unresolved or deliverable module remains in the active graph.', expectedOutcome: 'Import new evidence, reopen a decision, or define the next product slice.' }
}

export function validateInvariants(snapshot: ProductFrontierSnapshot): string[] {
  const issues: string[] = []
  for (const [label, values] of [['module', snapshot.modules], ['decision', snapshot.decisions], ['handoff', snapshot.handoffs], ['realization', snapshot.realizations], ['closure', snapshot.closures]] as const) {
    const seen = new Set<string>()
    for (const value of values) seen.has(value.id) ? issues.push(`duplicate ${label} id: ${value.id}`) : seen.add(value.id)
  }
  const moduleIds = new Set(snapshot.modules.map(value => value.id))
  for (const module of snapshot.modules) for (const dependency of module.dependencies) if (!moduleIds.has(dependency)) issues.push(`unknown module dependency: ${module.id} -> ${dependency}`)
  const graph = moduleGraph(snapshot, false)
  if (hasCycle(graph)) issues.push('module dependency graph contains a cycle')
  if (hasCycle(decisionGraph(snapshot))) issues.push('decision prerequisite graph contains a cycle')
  for (const decision of snapshot.decisions) {
    if (!moduleIds.has(decision.moduleId)) issues.push(`decision references unknown module: ${decision.id}`)
    for (const prerequisite of decision.prerequisites) if (!snapshot.decisions.some(value => value.id === prerequisite)) issues.push(`unknown decision prerequisite: ${decision.id} -> ${prerequisite}`)
  }
  for (const module of snapshot.modules) if (snapshot.handoffs.filter(value => value.moduleId === module.id && ['current', 'in_delivery'].includes(value.status)).length > 1) issues.push(`module has multiple active handoffs: ${module.id}`)
  return issues
}

export function moduleTopologicalOrder(snapshot: ProductFrontierSnapshot): string[] {
  return topologicalSort(moduleGraph(snapshot))
}

function moduleGraph(snapshot: ProductFrontierSnapshot, strict = true): DirectedGraph {
  const graph = new DirectedGraph()
  for (const module of snapshot.modules) graph.addNode(module.id)
  for (const module of snapshot.modules) for (const dependency of module.dependencies) {
    if (!graph.hasNode(dependency)) { if (strict) throw new Error(`unknown module dependency: ${dependency}`); else continue }
    graph.addEdge(dependency, module.id)
  }
  return graph
}

function decisionGraph(snapshot: ProductFrontierSnapshot): DirectedGraph {
  const graph = new DirectedGraph()
  for (const decision of snapshot.decisions) graph.addNode(decision.id)
  for (const decision of snapshot.decisions) for (const prerequisite of decision.prerequisites) if (graph.hasNode(prerequisite)) graph.addEdge(prerequisite, decision.id)
  return graph
}

function contractGaps(contract: ModuleContract): string[] {
  const gaps: string[] = []
  if (!contract.objective.trim()) gaps.push('objective')
  if (!contract.frozenBehavior.length) gaps.push('frozenBehavior')
  if (!contract.scope.length) gaps.push('scope')
  if (!contract.nonGoals.length) gaps.push('nonGoals')
  if (!contract.acceptance.length) gaps.push('acceptance')
  return gaps
}

function createCurrentHandoff(snapshot: ProductFrontierSnapshot, module: ProductModule, timestamp: string): Handoff {
  for (const value of snapshot.handoffs.filter(value => value.moduleId === module.id && ['current', 'in_delivery'].includes(value.status))) value.status = 'stale'
  const revision = Math.max(0, ...snapshot.handoffs.filter(value => value.moduleId === module.id).map(value => value.revision)) + 1
  const handoff: Handoff = {
    id: `handoff:${module.id}:${revision}`, moduleId: module.id, revision, productRevision: snapshot.revision + 1, status: 'current',
    decisionIds: snapshot.decisions.filter(value => value.moduleId === module.id && ['approved', 'deferred'].includes(value.status)).map(value => value.id).sort(),
    contractDigest: createHash('sha256').update(JSON.stringify(module.contract)).digest('hex'), createdAt: timestamp,
  }
  snapshot.handoffs.push(handoff)
  return handoff
}

function invalidateModuleAndDownstream(snapshot: ProductFrontierSnapshot, moduleId: string): void {
  for (const affected of [moduleId, ...downstream(snapshot, moduleId)]) {
    for (const handoff of snapshot.handoffs.filter(value => value.moduleId === affected && value.status !== 'closed')) handoff.status = 'stale'
    const module = requireModule(snapshot, affected)
    if (affected !== moduleId && module.definitionStatus === 'frozen') module.definitionStatus = 'shaping'
  }
}

function downstream(snapshot: ProductFrontierSnapshot, moduleId: string): string[] {
  const result = new Set<string>()
  const queue = [moduleId]
  while (queue.length) {
    const current = queue.shift()!
    for (const module of snapshot.modules.filter(value => value.dependencies.includes(current))) if (!result.has(module.id)) { result.add(module.id); queue.push(module.id) }
  }
  return [...result].sort()
}

function unlockCount(snapshot: ProductFrontierSnapshot, moduleId: string): number { return downstream(snapshot, moduleId).length }
function requireModule(snapshot: ProductFrontierSnapshot, moduleId: string): ProductModule { const value = snapshot.modules.find(item => item.id === moduleId); if (!value) throw new Error(`unknown module: ${moduleId}`); return value }
function requireDecision(snapshot: ProductFrontierSnapshot, decisionId: string): Decision { const value = snapshot.decisions.find(item => item.id === decisionId); if (!value) throw new Error(`unknown decision: ${decisionId}`); return value }
function requireHandoff(snapshot: ProductFrontierSnapshot, handoffId: string): Handoff { const value = snapshot.handoffs.find(item => item.id === handoffId); if (!value) throw new Error(`unknown handoff: ${handoffId}`); return value }
function requireRealization(snapshot: ProductFrontierSnapshot, realizationId: string): Realization { const value = snapshot.realizations.find(item => item.id === realizationId); if (!value) throw new Error(`unknown realization: ${realizationId}`); return value }
function requireClosure(snapshot: ProductFrontierSnapshot, closureId: string): Closure { const value = snapshot.closures.find(item => item.id === closureId); if (!value) throw new Error(`unknown closure: ${closureId}`); return value }
