import type { SubmissionEnvelope, ClosureSubmission, ProductOperation } from './model.js';
export declare function assertSubmission(value: unknown): asserts value is SubmissionEnvelope;
export declare function assertClosureSubmission(value: unknown): asserts value is ClosureSubmission;
export declare function assertOperation(value: unknown): asserts value is ProductOperation;
export declare function assertDecisionProposal(value: unknown): void;
