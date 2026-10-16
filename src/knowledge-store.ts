import type { SuoSnapshot } from './model.js'
import { loadAuthority, saveAuthority } from './source.js'
import { isVault, loadVaultAuthority, saveVaultAuthority } from './vault.js'

/** A per-invocation adapter. No singleton, account, daemon or active-project state.
 * The caller holds the project writer lock. Revisions are checked before commit;
 * Obsidian additionally checks source content and journals multi-note writes.
 */
export interface KnowledgeStore {
  readonly kind: 'repo-ts' | 'obsidian'
  readonly root: string
  load(): Promise<SuoSnapshot>
  save(snapshot: SuoSnapshot): Promise<void>
}
export async function knowledgeStore(root: string): Promise<KnowledgeStore> {
  return await isVault(root)
    ? { kind: 'obsidian', root, load: () => loadVaultAuthority(root), save: snapshot => saveVaultAuthority(snapshot, root) }
    : { kind: 'repo-ts', root, load: () => loadAuthority(root), save: snapshot => saveAuthority(snapshot, root) }
}
