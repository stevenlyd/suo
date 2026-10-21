import type { UnitSnapshot, CheckoutContext } from './unit-model.js';
/** Flat output stays stack-safe even for a deeply nested logical forest. */
export declare function renderUnits(snapshot: UnitSnapshot, context: CheckoutContext): string;
