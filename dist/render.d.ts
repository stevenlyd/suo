import type { Closure, Handoff, NextProductAction, SuoSnapshot } from './model.js';
export declare function renderNext(action: NextProductAction): string;
export declare function renderMap(snapshot: SuoSnapshot): string;
export declare function renderDag(snapshot: SuoSnapshot): string;
export declare function renderHandoff(snapshot: SuoSnapshot, handoff: Handoff, historical?: SuoSnapshot): string;
export declare function renderClosure(snapshot: SuoSnapshot, closure: Closure): string;
export declare function generateArtifacts(snapshot: SuoSnapshot, root?: string): Promise<string[]>;
