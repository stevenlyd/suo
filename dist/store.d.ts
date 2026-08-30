import type { IntentLoopSnapshot } from './model.js';
export declare const workspaceDir: (root?: string) => string;
export declare const snapshotPath: (root?: string) => string;
export declare function loadSnapshot(root?: string): Promise<IntentLoopSnapshot>;
export declare function saveSnapshot(snapshot: IntentLoopSnapshot, root?: string): Promise<void>;
