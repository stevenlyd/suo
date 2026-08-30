export type DefinitionStatus = 'candidate' | 'shaping' | 'frozen' | 'deferred' | 'superseded' | 'retired'
export type DecisionStatus = 'open' | 'proposed' | 'approved' | 'deferred' | 'superseded'
export type HandoffStatus = 'current' | 'in_delivery' | 'stale' | 'closed'
export type RealizationStatus = 'in_progress' | 'closure_submitted' | 'closed' | 'reopened'
export type ClosureStatus = 'submitted' | 'accepted' | 'rejected'

export interface AcceptanceCriterion { id: string; text: string }
export interface ModuleContract {
  objective: string
  frozenBehavior: string[]
  scope: string[]
  nonGoals: string[]
  acceptance: AcceptanceCriterion[]
}
export interface ProductModule {
  id: string
  title: string
  phase: string
  definitionStatus: DefinitionStatus
  dependencies: string[]
  contract: ModuleContract
  createdAt: string
  updatedAt: string
}
export interface Alternative { id: string; label: string; tradeoffs?: string }
export interface Decision {
  id: string
  moduleId: string
  question: string
  status: DecisionStatus
  alternatives: Alternative[]
  recommendation?: string
  ownerChoice?: string
  rationale?: string
  prerequisites: string[]
  evidenceRefs: string[]
  supersedes?: string
  createdAt: string
  updatedAt: string
}
export interface Handoff {
  id: string
  moduleId: string
  revision: number
  productRevision: number
  status: HandoffStatus
  decisionIds: string[]
  contractDigest: string
  createdAt: string
}
export interface ImplementationRef {
  kind: 'commit' | 'pull_request' | 'file' | 'release' | 'deployment'
  uri: string
  revision?: string
}
export interface Realization {
  id: string
  moduleId: string
  handoffId: string
  handoffRevision: number
  status: RealizationStatus
  agent?: string
  implementationRefs: ImplementationRef[]
  closureId?: string
  startedAt: string
  updatedAt: string
}
export interface AcceptanceEvidence {
  acceptanceId: string
  evidence: string[]
  result: 'pass' | 'partial' | 'not_met'
}
export interface ClosureDeviation {
  description: string
  consequence: string
  requiresProductDecision: boolean
}
export interface ClosureSubmission {
  implementationRefs: ImplementationRef[]
  deliveredBehavior: string[]
  acceptanceEvidence: AcceptanceEvidence[]
  checks: Array<{ command?: string; system?: string; result: 'pass' | 'fail' | 'not_run'; evidenceRef?: string }>
  deviations: ClosureDeviation[]
  residualRisks: string[]
  newProductQuestions: string[]
  deployment?: { environment: string; revision: string; evidenceRef: string }
  migrations?: string[]
  cleanup?: string[]
}
export interface Closure extends ClosureSubmission {
  id: string
  realizationId: string
  handoffId: string
  handoffRevision: number
  status: ClosureStatus
  submittedAt: string
  decidedAt?: string
  verifier?: string
  rejectionReason?: string
}
export interface IntentLoopSnapshot {
  schemaVersion: 1
  revision: number
  product: { id: string; title: string; initialIdea: string; activeSlice: string; profile: string; createdAt: string; updatedAt: string }
  modules: ProductModule[]
  decisions: Decision[]
  handoffs: Handoff[]
  realizations: Realization[]
  closures: Closure[]
}
export type NextProductAction =
  | { type: 'clarify_idea'; title: string; whyNow: string; expectedOutcome: string }
  | { type: 'define_module'; moduleId: string; title: string; whyNow: string; whatItUnlocks: string[]; expectedOutcome: string }
  | { type: 'answer_decision'; moduleId: string; decisionId: string; title: string; whyNow: string; whatItUnlocks: string[]; expectedOutcome: string; recommendation?: string }
  | { type: 'approve_decision'; moduleId: string; decisionId: string; title: string; whyNow: string; whatItUnlocks: string[]; expectedOutcome: string; recommendation?: string }
  | { type: 'freeze_module'; moduleId: string; title: string; whyNow: string; whatItUnlocks: string[]; expectedOutcome: string }
  | { type: 'start_delivery'; moduleId: string; handoffId: string; title: string; whyNow: string; expectedOutcome: string }
  | { type: 'review_closure'; moduleId: string; closureId: string; title: string; whyNow: string; expectedOutcome: string }
  | { type: 'await_delivery'; moduleId: string; realizationId: string; title: string; whyNow: string; expectedOutcome: string }
  | { type: 'definition_complete'; title: string; whyNow: string; expectedOutcome: string }
