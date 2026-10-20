import type { ClosureEnvelope, ClosureSubmission, Decision, ModuleContract, NextProductAction, ProposalSubmission, Prose, SuoSnapshot, ProductModule } from './model.js';
export interface MutationOptions {
    now?: string;
    id?: string;
}
export declare function createProduct(input: {
    id?: string;
    title: string;
    idea: string;
    activeSlice?: string;
    profile?: string;
}, options?: MutationOptions): SuoSnapshot;
export declare function createModule(snapshot: SuoSnapshot, input: {
    id: string;
    title: string;
    phase?: string;
    contract?: ModuleContract;
}, options?: MutationOptions): SuoSnapshot;
export declare function updateModule(snapshot: SuoSnapshot, moduleId: string, patch: {
    title?: string;
    phase?: string;
    contract?: ModuleContract;
}, options?: MutationOptions): SuoSnapshot;
export declare function deleteDraftModule(snapshot: SuoSnapshot, moduleId: string, options?: MutationOptions): SuoSnapshot;
export declare function retireModule(snapshot: SuoSnapshot, moduleId: string, options?: MutationOptions): SuoSnapshot;
export declare function connectModules(snapshot: SuoSnapshot, moduleId: string, dependencyId: string, options?: MutationOptions): SuoSnapshot;
export declare function disconnectModules(snapshot: SuoSnapshot, moduleId: string, dependencyId: string, options?: MutationOptions): SuoSnapshot;
export declare function proposeDecision(snapshot: SuoSnapshot, input: Omit<Decision, 'status' | 'ownerChoice' | 'rationale' | 'createdAt' | 'updatedAt'> & {
    status?: 'open' | 'proposed';
}, options?: MutationOptions): SuoSnapshot;
export declare function updateDecisionProposal(snapshot: SuoSnapshot, decisionId: string, patch: Partial<Pick<Decision, 'question' | 'alternatives' | 'recommendation' | 'prerequisites' | 'evidenceRefs'>>, options?: MutationOptions): SuoSnapshot;
export declare function deleteDraftDecision(snapshot: SuoSnapshot, decisionId: string, options?: MutationOptions): SuoSnapshot;
export declare function approveDecision(snapshot: SuoSnapshot, decisionId: string, input: {
    choice: string;
    rationale: string;
    evidenceRefs?: string[];
}, options?: MutationOptions): SuoSnapshot;
export declare function deferDecision(snapshot: SuoSnapshot, decisionId: string, rationale: string, options?: MutationOptions): SuoSnapshot;
export declare function reopenDecision(snapshot: SuoSnapshot, decisionId: string, options?: MutationOptions): SuoSnapshot;
export declare function freezeModule(snapshot: SuoSnapshot, moduleId: string, options?: MutationOptions): SuoSnapshot;
export declare function startRealization(snapshot: SuoSnapshot, handoffId: string, input: {
    id?: string;
    agent: string;
}, options?: MutationOptions): SuoSnapshot;
export declare function submitClosure(snapshot: SuoSnapshot, realizationId: string, submission: ClosureSubmission, options?: MutationOptions): SuoSnapshot;
export declare function acceptClosure(snapshot: SuoSnapshot, closureId: string, verifier: string, options?: MutationOptions): SuoSnapshot;
export declare function rejectClosure(snapshot: SuoSnapshot, closureId: string, verifier: string, reason: string, options?: MutationOptions): SuoSnapshot;
export declare function reopenClosure(snapshot: SuoSnapshot, realizationId: string, reason: string, options?: MutationOptions): SuoSnapshot;
export declare function stageProposal(snapshot: SuoSnapshot, input: ProposalSubmission, options?: MutationOptions): SuoSnapshot;
export declare function approveProposal(snapshot: SuoSnapshot, proposalId: string, options?: MutationOptions): SuoSnapshot;
export declare function rejectProposal(snapshot: SuoSnapshot, proposalId: string, reason: string, options?: MutationOptions): SuoSnapshot;
export declare function submitClosureEnvelope(snapshot: SuoSnapshot, envelope: ClosureEnvelope, options?: MutationOptions): SuoSnapshot;
export declare function nextAction(snapshot: SuoSnapshot): NextProductAction;
export declare function validateInvariants(snapshot: SuoSnapshot): string[];
export declare function moduleTopologicalOrder(snapshot: SuoSnapshot): string[];
export declare function proseText(value: Prose): string;
export declare function reconcileImportedAuthority(snapshot: SuoSnapshot): SuoSnapshot;
export declare function handoffDefinitionDigest(snapshot: SuoSnapshot, module: ProductModule): string;
