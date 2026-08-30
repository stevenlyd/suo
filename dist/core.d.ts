import type { ClosureSubmission, Decision, ModuleContract, NextProductAction, IntentLoopSnapshot } from './model.js';
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
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function createModule(snapshot: IntentLoopSnapshot, input: {
    id: string;
    title: string;
    phase?: string;
    contract?: ModuleContract;
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function updateModule(snapshot: IntentLoopSnapshot, moduleId: string, patch: {
    title?: string;
    phase?: string;
    contract?: ModuleContract;
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function deleteDraftModule(snapshot: IntentLoopSnapshot, moduleId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function retireModule(snapshot: IntentLoopSnapshot, moduleId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function connectModules(snapshot: IntentLoopSnapshot, moduleId: string, dependencyId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function disconnectModules(snapshot: IntentLoopSnapshot, moduleId: string, dependencyId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function proposeDecision(snapshot: IntentLoopSnapshot, input: Omit<Decision, 'status' | 'ownerChoice' | 'rationale' | 'createdAt' | 'updatedAt'> & {
    status?: 'open' | 'proposed';
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function updateDecisionProposal(snapshot: IntentLoopSnapshot, decisionId: string, patch: Partial<Pick<Decision, 'question' | 'alternatives' | 'recommendation' | 'prerequisites' | 'evidenceRefs'>>, options?: MutationOptions): IntentLoopSnapshot;
export declare function deleteDraftDecision(snapshot: IntentLoopSnapshot, decisionId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function approveDecision(snapshot: IntentLoopSnapshot, decisionId: string, input: {
    choice: string;
    rationale: string;
    evidenceRefs?: string[];
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function deferDecision(snapshot: IntentLoopSnapshot, decisionId: string, rationale: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function reopenDecision(snapshot: IntentLoopSnapshot, decisionId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function freezeModule(snapshot: IntentLoopSnapshot, moduleId: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function startRealization(snapshot: IntentLoopSnapshot, handoffId: string, input: {
    id?: string;
    agent?: string;
}, options?: MutationOptions): IntentLoopSnapshot;
export declare function submitClosure(snapshot: IntentLoopSnapshot, realizationId: string, submission: ClosureSubmission, options?: MutationOptions): IntentLoopSnapshot;
export declare function acceptClosure(snapshot: IntentLoopSnapshot, closureId: string, verifier: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function rejectClosure(snapshot: IntentLoopSnapshot, closureId: string, verifier: string, reason: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function reopenClosure(snapshot: IntentLoopSnapshot, realizationId: string, reason: string, options?: MutationOptions): IntentLoopSnapshot;
export declare function nextAction(snapshot: IntentLoopSnapshot): NextProductAction;
export declare function validateInvariants(snapshot: IntentLoopSnapshot): string[];
export declare function moduleTopologicalOrder(snapshot: IntentLoopSnapshot): string[];
