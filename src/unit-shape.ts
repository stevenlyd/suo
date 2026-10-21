/** One runtime shape definition also supplies TypeScript input types. */
export interface Shape<T> { kind: 'string' | 'boolean' | 'number' | 'literal' | 'array' | 'object' | 'nullable'; values?: readonly unknown[]; item?: Shape<unknown>; fields?: Record<string, Shape<unknown>>; readonly type?: T }
export type Value<S> = S extends Shape<infer T> ? T : never
export const string = (): Shape<string> => ({ kind: 'string' })
export const boolean = (): Shape<boolean> => ({ kind: 'boolean' })
export const number = (): Shape<number> => ({ kind: 'number' })
export const literals = <const T extends readonly (string | number)[]>(...values: T): Shape<T[number]> => ({ kind: 'literal', values })
export const array = <T>(item: Shape<T>): Shape<T[]> => ({ kind: 'array', item })
export const nullable = <T>(item: Shape<T>): Shape<T | null> => ({ kind: 'nullable', item })
export const object = <T extends Record<string, Shape<unknown>>>(fields: T): Shape<{ [K in keyof T]: Value<T[K]> }> => ({ kind: 'object', fields })
export function assertShape<T>(shape: Shape<T>, input: unknown): asserts input is T {
  const stack: Array<{ shape: Shape<unknown>; value: unknown; path: string }> = [{ shape, value: input, path: '$' }]
  let visited = 0
  while (stack.length) {
    if (++visited > 5_000_000) throw new Error('Input exceeds validation budget')
    const { shape: s, value: v, path } = stack.pop()!
    const fail = (reason: string): never => { throw new Error(`${path}: ${reason}`) }
    if (s.kind === 'nullable') { if (v !== null) stack.push({ shape: s.item!, value: v, path }); continue }
    if (s.kind === 'string') { if (typeof v !== 'string' || !v.trim()) fail('expected nonempty string'); continue }
    if (s.kind === 'boolean') { if (typeof v !== 'boolean') fail('expected boolean'); continue }
    if (s.kind === 'number') { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) fail('expected nonnegative safe integer'); continue }
    if (s.kind === 'literal') { if (!s.values!.includes(v)) fail(`expected ${s.values!.join(' | ')}`); continue }
    if (s.kind === 'array') {
      if (!Array.isArray(v)) fail('expected array')
      if ((v as unknown[]).length + stack.length + visited > 5_000_000) fail('array exceeds validation budget')
      if (Object.getPrototypeOf(v) !== Array.prototype) fail('expected plain array')
      for (const key of Reflect.ownKeys(v as object)) if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (v as unknown[]).length)) fail('extraneous array field')
      for (let i = (v as unknown[]).length - 1; i >= 0; i--) { const property = Object.getOwnPropertyDescriptor(v,i); if (!property || !Object.hasOwn(property,'value')) fail('array holes/accessors are forbidden'); stack.push({ shape: s.item!, value: property!.value, path: `${path}[${i}]` }) }
      continue
    }
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('expected plain object')
    const record = v as Record<string, unknown>, fields = s.fields!
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(record))) if (descriptor.get || descriptor.set) fail('accessor properties are forbidden')
    for (const key of Reflect.ownKeys(record)) if (typeof key !== 'string' || !Object.hasOwn(fields, key)) fail(`unknown field ${String(key)}`)
    for (const [key, field] of Object.entries(fields)) {
      if (!Object.hasOwn(record, key)) fail(`missing field ${key}`)
      stack.push({ shape: field, value: record[key], path: `${path}.${key}` })
    }
  }
}
