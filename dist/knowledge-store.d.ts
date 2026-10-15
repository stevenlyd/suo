import type { SuoSnapshot } from './model.js';
/** A per-invocation adapter. No singleton, account, daemon or active-project state.
 * The caller holds the project writer lock. Revisions are checked before commit;
 * Obsidian additionally checks source content and journals multi-note writes.
 */
export interface KnowledgeStore {
    readonly kind: 'repo-ts' | 'obsidian';
    readonly root: string;
    load(): Promise<SuoSnapshot>;
    save(snapshot: SuoSnapshot): Promise<void>;
}
export declare function knowledgeStore(root: string): Promise<KnowledgeStore>;
