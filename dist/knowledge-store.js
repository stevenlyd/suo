import { loadAuthority, saveAuthority } from './source.js';
import { isVault, loadVaultAuthority, saveVaultAuthority } from './vault.js';
export async function knowledgeStore(root) {
    return await isVault(root)
        ? { kind: 'obsidian', root, load: () => loadVaultAuthority(root), save: snapshot => saveVaultAuthority(snapshot, root) }
        : { kind: 'repo-ts', root, load: () => loadAuthority(root), save: snapshot => saveAuthority(snapshot, root) };
}
//# sourceMappingURL=knowledge-store.js.map