import type { Closure, Handoff, NextProductAction, IntentLoopSnapshot } from './model.js';
export declare function renderNext(action: NextProductAction): string;
export declare function renderMap(snapshot: IntentLoopSnapshot): string;
export declare function renderDag(snapshot: IntentLoopSnapshot): string;
export declare function renderHandoff(snapshot: IntentLoopSnapshot, handoff: Handoff): string;
export declare function renderClosure(snapshot: IntentLoopSnapshot, closure: Closure): string;
export declare function generateArtifacts(snapshot: IntentLoopSnapshot, root?: string): Promise<string[]>;
