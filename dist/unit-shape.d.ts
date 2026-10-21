/** One runtime shape definition also supplies TypeScript input types. */
export interface Shape<T> {
    kind: 'string' | 'boolean' | 'number' | 'literal' | 'array' | 'object' | 'nullable';
    values?: readonly unknown[];
    item?: Shape<unknown>;
    fields?: Record<string, Shape<unknown>>;
    readonly type?: T;
}
export type Value<S> = S extends Shape<infer T> ? T : never;
export declare const string: () => Shape<string>;
export declare const boolean: () => Shape<boolean>;
export declare const number: () => Shape<number>;
export declare const literals: <const T extends readonly (string | number)[]>(...values: T) => Shape<T[number]>;
export declare const array: <T>(item: Shape<T>) => Shape<T[]>;
export declare const nullable: <T>(item: Shape<T>) => Shape<T | null>;
export declare const object: <T extends Record<string, Shape<unknown>>>(fields: T) => Shape<{ [K in keyof T]: Value<T[K]>; }>;
export declare function assertShape<T>(shape: Shape<T>, input: unknown): asserts input is T;
