/** Iterative graph algorithms. Edges point prerequisite -> consumer. */
export declare function topological(ids: readonly string[], edges: ReadonlyArray<readonly [string, string]>): string[];
export declare function affected(ids: readonly string[], oldEdges: ReadonlyArray<readonly [string, string]>, newEdges: ReadonlyArray<readonly [string, string]>): Set<string>;
