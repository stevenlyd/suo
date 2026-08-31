import type { SuoSnapshot } from './model.js';
export declare const sourceDirectoryName = "suo";
export declare const sourceRootFileName = "product.suo.ts";
export declare function findProjectRoot(start?: string, allowUninitialized?: boolean): Promise<string>;
export declare function loadAuthority(root: string): Promise<SuoSnapshot>;
export declare function checkSource(root: string): Promise<void>;
export declare function saveAuthority(snapshot: SuoSnapshot, root: string): Promise<void>;
