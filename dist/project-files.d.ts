export declare function withProjectLock<T>(root: string, operation: () => Promise<T>): Promise<T>;
export declare function safePath(root: string, path: string): Promise<string>;
