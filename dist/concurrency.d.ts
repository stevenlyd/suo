import type { SuoSnapshot } from './model.js';
export declare function contentIdentity(snapshot: SuoSnapshot): string;
export declare function observe(snapshot: SuoSnapshot, authority?: SuoSnapshot): SuoSnapshot;
export declare function inheritObservation(before: SuoSnapshot, after: SuoSnapshot): SuoSnapshot;
export declare function observedIdentity(snapshot: SuoSnapshot): string | undefined;
export declare function canonicalJson(value: unknown): string;
