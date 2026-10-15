import { Document } from 'yaml';
import type { Decision, ProductModule, SuoSnapshot } from './model.js';
export declare const begin = "<!-- suo:content -->";
export declare const end = "<!-- /suo:content -->";
export interface VaultNote {
    path: string;
    raw: string;
    document: Document;
    body: string;
    id: string;
    kind: 'product' | 'module' | 'decision';
}
export declare const hash: (value: string) => string;
export declare const equal: (a: unknown, b: unknown) => boolean;
export declare function parseNote(path: string, raw: string): VaultNote | undefined;
export declare function noteContent(note: VaultNote): string;
export declare function stringField(note: VaultNote, key: string, fallback?: string): string;
export declare function arrayField<T>(note: VaultNote, key: string): T[];
export declare function readNotes(root: string): Promise<VaultNote[]>;
export declare function resolveLink(notes: VaultNote[], from: VaultNote, value: unknown, kind: VaultNote['kind']): string;
export declare function authored(snapshot: SuoSnapshot): unknown;
export declare function renderNote(note: VaultNote | undefined, kind: VaultNote['kind'], value: SuoSnapshot['product'] | ProductModule | Decision, paths: Map<string, string>): string;
export declare function enrollNote(raw: string, id: string, kind: 'module' | 'decision', title: string, moduleLink?: string): string;
