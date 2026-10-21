import { type UnitSnapshot, type CheckoutContext, type UnitProjection } from './unit-model.js';
export declare function repositoryPath(path: string): void;
export declare function validateUnits(value: unknown): asserts value is UnitSnapshot;
export declare function phaseOrder(s: UnitSnapshot): string[];
export declare function inputIdentity(s: UnitSnapshot, context: CheckoutContext): string;
/** Pure projection: no clock, network, provider status or mutation. */
export declare function inspectUnits(s: UnitSnapshot, context: CheckoutContext): {
    schemaVersion: 5;
    target: CheckoutContext['target'];
    identity: string;
    inputDigest: string;
    units: UnitProjection[];
    verification: string;
};
