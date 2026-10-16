import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, posix } from 'node:path'
import { parseDocument, Document } from 'yaml'
import type { Decision, ProductModule, SuoSnapshot } from './model.js'
import { proseText } from './core.js'

export const begin = '<!-- suo:content -->'
export const end = '<!-- /suo:content -->'
export interface VaultNote {
  path: string
  raw: string
  document: Document
  body: string
  id: string
  kind: 'product' | 'module' | 'decision'
}
const common = ['suo_id', 'suo_kind', 'suo_title']
const fields = {
  product: [...common, 'suo_slice', 'suo_profile'],
  module: [...common, 'suo_phase', 'suo_dependencies', 'suo_frozen_behavior', 'suo_scope', 'suo_non_goals', 'suo_acceptance'],
  decision: [...common, 'suo_module', 'suo_alternatives', 'suo_recommendation', 'suo_prerequisites', 'suo_evidence'],
}
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
export const equal = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b)

export function parseNote(path: string, raw: string): VaultNote | undefined {
  const parts = splitFrontmatter(raw)
  if (!parts) return undefined
  // Unenrolled notes are not subject to Suo's schema or YAML restrictions.
  if (!/^suo_(?:id|kind)\s*:/m.test(parts.yaml)) return undefined
  const document = parseDocument(parts.yaml, { uniqueKeys: true })
  if (document.errors.length) throw new Error(`${path}: ${document.errors.map(e => e.message).join('; ')}`)
  const data = document.toJS({ maxAliasCount: 0 }) as Record<string, unknown>
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${path}: frontmatter must be a mapping`)
  const id = data.suo_id
  const kind = data.suo_kind
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) throw new Error(`${path}: invalid suo_id`)
  if (kind !== 'product' && kind !== 'module' && kind !== 'decision') throw new Error(`${path}: unsupported suo_kind`)
  for (const key of Object.keys(data)) if (key.startsWith('suo_') && !fields[kind].includes(key)) throw new Error(`${path}: unsupported or lifecycle-controlled property ${key}`)
  return { path, raw, document, body: parts.body, id, kind }
}
function splitFrontmatter(raw: string): { yaml: string; body: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  return match ? { yaml: match[1]!, body: raw.slice(match[0].length) } : undefined
}
export function noteContent(note: VaultNote): string {
  const first = note.body.indexOf(begin)
  const last = note.body.indexOf(end)
  if (first < 0 || last < first || note.body.indexOf(begin, first + begin.length) >= 0 || note.body.indexOf(end, last + end.length) >= 0) throw new Error(`${note.path}: requires exactly one ${begin} ... ${end} region`)
  return note.body.slice(first + begin.length, last).replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}
export function stringField(note: VaultNote, key: string, fallback?: string): string {
  const value = note.document.get(key)
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${note.path}: ${key} must be a non-empty string`)
  return value
}
export function arrayField<T>(note: VaultNote, key: string): T[] {
  const value: unknown = note.document.toJS({ maxAliasCount: 0 })[key] ?? []
  if (!Array.isArray(value)) throw new Error(`${note.path}: ${key} must be a list`)
  return value as T[]
}
export async function readNotes(root: string): Promise<VaultNote[]> {
  const notes: VaultNote[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(`${root}/${directory}`, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !['node_modules', 'suo-history'].includes(entry.name) && path !== 'docs/suo') await visit(path)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const note = parseNote(path, await readFile(`${root}/${path}`, 'utf8'))
        if (note) notes.push(note)
      }
    }
  }
  await visit('')
  const ids = new Set<string>()
  for (const note of notes) {
    if (ids.has(note.id)) throw new Error(`duplicate suo_id: ${note.id}`)
    ids.add(note.id)
  }
  return notes.sort((a, b) => a.id.localeCompare(b.id))
}
export function resolveLink(notes: VaultNote[], from: VaultNote, value: unknown, kind: VaultNote['kind']): string {
  if (typeof value !== 'string') throw new Error(`${from.path}: relationship must be a quoted wikilink`)
  const match = /^\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]$/.exec(value)
  if (!match) throw new Error(`${from.path}: invalid whole-note relationship ${value}`)
  const target = match[1]!.replace(/\.md$/, '')
  if (target.startsWith('/') || target.includes('\\')) throw new Error(`${from.path}: invalid link ${value}`)
  const path = target.startsWith('.') ? posix.normalize(posix.join(dirname(from.path), target)) : target
  const candidates = notes.filter(n => n.path.slice(0, -3) === path || (!target.includes('/') && basename(n.path, '.md') === target))
  if (candidates.length !== 1) throw new Error(`${from.path}: ${candidates.length ? 'ambiguous' : 'unresolved'} link ${value}`)
  if (candidates[0]!.kind !== kind) throw new Error(`${from.path}: ${value} must reference a ${kind}`)
  return candidates[0]!.id
}
export function authored(snapshot: SuoSnapshot): unknown {
  return {
    product: { id: snapshot.product.id, title: snapshot.product.title, initialIdea: snapshot.product.initialIdea, activeSlice: snapshot.product.activeSlice, profile: snapshot.product.profile },
    modules: [...snapshot.modules].sort(byId).map(m => ({ id: m.id, title: m.title, phase: m.phase, dependencies: m.dependencies, contract: { ...m.contract, objective: proseText(m.contract.objective) } })),
    decisions: [...snapshot.decisions].sort(byId).map(d => ({ id: d.id, moduleId: d.moduleId, question: d.question, alternatives: d.alternatives, ...(d.recommendation !== undefined ? { recommendation: d.recommendation } : {}), prerequisites: d.prerequisites, evidenceRefs: d.evidenceRefs })),
  }
}
const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id)
export function renderNote(note: VaultNote | undefined, kind: VaultNote['kind'], value: SuoSnapshot['product'] | ProductModule | Decision, paths: Map<string, string>): string {
  const document = note?.document.clone() ?? new Document()
  const set = (key: string, data: unknown): void => { if (data === undefined) document.delete(key); else document.set(key, data) }
  const link = (id: string): string => {
    const path = paths.get(id)
    if (!path) throw new Error(`missing note path for ${id}`)
    if (/[#\[\]|]/.test(path)) throw new Error(`note path cannot be represented as a whole-note wikilink: ${path}`)
    const from = paths.get(value.id)
    if (!from) throw new Error(`missing source note path for ${value.id}`)
    const target = posix.relative(dirname(from), path.slice(0, -3))
    return `[[${target.startsWith('.') ? target : `./${target}`}]]`
  }
  set('suo_id', value.id); set('suo_kind', kind)
  let content: string
  if (kind === 'product') {
    const p = value as SuoSnapshot['product']
    set('suo_title', p.title); set('suo_slice', p.activeSlice); set('suo_profile', p.profile); content = p.initialIdea
  } else if (kind === 'module') {
    const m = value as ProductModule
    set('suo_title', m.title); set('suo_phase', m.phase); set('suo_dependencies', m.dependencies.map(link))
    set('suo_frozen_behavior', m.contract.frozenBehavior); set('suo_scope', m.contract.scope); set('suo_non_goals', m.contract.nonGoals); set('suo_acceptance', m.contract.acceptance)
    content = proseText(m.contract.objective)
  } else {
    const d = value as Decision
    set('suo_module', link(d.moduleId)); set('suo_alternatives', d.alternatives); set('suo_recommendation', d.recommendation)
    set('suo_prerequisites', d.prerequisites.map(link)); set('suo_evidence', d.evidenceRefs); content = d.question
  }
  if (content.includes(begin) || content.includes(end)) throw new Error('content cannot contain reserved Suo delimiters')
  let body = note?.body ?? `\n# ${'title' in value ? value.title : value.question}\n\n${begin}\n\n${end}\n`
  if (note) noteContent(note)
  const start = body.indexOf(begin) + begin.length
  body = `${body.slice(0, start)}\n${content}\n${body.slice(body.indexOf(end))}`
  return `---\n${document.toString()}---\n${body}`
}
export function enrollNote(raw: string, id: string, kind: 'module' | 'decision', title: string, moduleLink?: string): string {
  const parts = splitFrontmatter(raw)
  const document = parts ? parseDocument(parts.yaml) : new Document()
  if (document.errors.length) throw new Error('cannot enroll invalid YAML')
  if (document.has('suo_id') || document.has('suo_kind')) throw new Error('note is already enrolled')
  const data = document.toJS({ maxAliasCount: 0 })
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw new Error('frontmatter must be a mapping')
  document.set('suo_id', id); document.set('suo_kind', kind)
  if (kind === 'module') document.set('suo_title', title)
  else {
    if (!moduleLink) throw new Error('decision enrollment requires --module "[[Module note]]"')
    document.set('suo_module', moduleLink)
  }
  const body = parts?.body ?? raw
  if (body.includes(begin) || body.includes(end)) throw new Error('note already contains Suo content delimiters')
  // The existing text stays byte-for-byte intact; the selected definition is explicit.
  return `---\n${document.toString()}---\n${body}${body.endsWith('\n') ? '' : '\n'}\n${begin}\n${kind === 'decision' ? title : ''}\n${end}\n`
}
