import { createHash } from 'node:crypto'
/** Canonical serialization with explicit frames, no recursive object copying. */
export function canonical(value: unknown): string {
  type Task = { value: unknown } | { token: string } | { leave: object }
  const stack: Task[] = [{ value }], parts: string[] = [], active = new Set<object>()
  while (stack.length) {
    const task = stack.pop()!
    if ('token' in task) { parts.push(task.token); continue }
    if ('leave' in task) { active.delete(task.leave); continue }
    const v = task.value
    if (v === null || typeof v !== 'object') {
      if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) throw new Error('canonical data must be JSON')
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('nonfinite number')
      parts.push(JSON.stringify(v)); continue
    }
    if (active.has(v)) throw new Error('cyclic JSON input')
    active.add(v); stack.push({ leave: v })
    const isArray = Array.isArray(v), keys = isArray ? Array.from({ length: v.length }, (_, i) => String(i)) : Object.keys(v).sort()
    parts.push(isArray ? '[' : '{'); stack.push({ token: isArray ? ']' : '}' })
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i]!
      stack.push({ value: (v as Record<string, unknown>)[key] })
      if (!isArray) stack.push({ token: `${JSON.stringify(key)}:` })
      if (i > 0) stack.push({ token: ',' })
    }
  }
  return parts.join('')
}
export const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex')
