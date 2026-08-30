import type { SuoSnapshot } from './model.js';
export declare const workspaceDir: (root?: string) => string;
export declare const snapshotPath: (root?: string) => string;
export declare function loadSnapshot(root?: string): Promise<SuoSnapshot>;
export declare function saveSnapshot(snapshot: SuoSnapshot, root?: string): Promise<void>;
