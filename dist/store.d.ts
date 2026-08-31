import type { SuoSnapshot } from './model.js';
export declare const workspaceDir: (root: string) => string;
export declare function loadSnapshot(start?: string): Promise<SuoSnapshot>;
export declare function saveSnapshot(snapshot: SuoSnapshot, start?: string, options?: {
    initialize?: boolean;
}): Promise<void>;
export declare function projectRoot(start?: string): Promise<string>;
