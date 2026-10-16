import type { SuoSnapshot } from './model.js';
import type { VaultNote } from './vault-notes.js';
export declare const vaultMarker = "suo.vault.json";
interface Revision {
    format: 1;
    previous: string | null;
    snapshot: SuoSnapshot;
    digest: string;
}
export interface VaultDraft {
    snapshot: SuoSnapshot;
    approved: SuoSnapshot;
    notes: VaultNote[];
    token: string;
    changed: boolean;
    before: unknown;
    after: unknown;
    head: Revision;
}
export declare function isVault(root: string): Promise<boolean>;
export declare function initVault(root: string, idea: string, title?: string): Promise<SuoSnapshot>;
export declare function adoptVaultNote(root: string, path: string, kind: 'module' | 'decision', moduleLink?: string): Promise<string>;
export declare function readVaultDraft(root: string): Promise<VaultDraft>;
export declare function loadVaultAuthority(root: string): Promise<SuoSnapshot>;
export declare function compileVault(root: string): Promise<{
    token: string;
    changed: boolean;
    generated: string;
}>;
export declare function approveVaultDraft(root: string, token: string): Promise<SuoSnapshot>;
export declare function saveVaultAuthority(snapshot: SuoSnapshot, root: string): Promise<void>;
export declare function readVaultHistory(root: string): Promise<Revision[]>;
export declare function recoverVault(root: string): Promise<string>;
export {};
