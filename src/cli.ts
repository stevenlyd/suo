#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  acceptClosure,
  approveProposal,
  createProduct,
  findProjectRoot,
  generateArtifacts,
  loadSnapshot,
  nextAction,
  rejectClosure,
  rejectProposal,
  renderNext,
  saveSnapshot,
  stageProposal,
  submitClosureEnvelope,
  validateSnapshot,
} from './index.js'
import type { SubmissionEnvelope, SuoSnapshot } from './model.js'

const argv = process.argv.slice(2)
const command = argv.shift()

try {
  switch (command) {
    case 'init': await initCommand(); break
    case 'next': await nextCommand(); break
    case 'submit': await submitCommand(); break
    case 'approve': await approveCommand(); break
    case 'reject': await rejectCommand(); break
    case 'inspect': await inspectCommand(); break
    case 'check': await checkCommand(); break
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(helpText())
      break
    default: throw new Error(`unknown command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function initCommand(): Promise<void> {
  const flaggedIdea = flag('--idea')
  const explicitRoot = flag('--root')
  const positionals = positionalArgs(argv)
  const requestedRoot = explicitRoot ?? (flaggedIdea && positionals[0] ? positionals[0] : undefined)
  const root = requestedRoot ? resolve(requestedRoot) : await findProjectRoot('.', true)
  const idea = flaggedIdea ?? positionals[0]
  if (!idea?.trim()) throw new Error('usage: suo init [project-directory] --idea "I have an idea..." [--title <title>]')
  await mkdir(root, { recursive: true })
  if (await pathExists(resolve(root, 'suo', 'product.suo.ts'))) throw new Error(`Suo is already initialized at ${root}`)
  const title = flag('--title')?.trim() || idea.trim().split(/\s+/).slice(0, 8).join(' ')
  const productId = flag('--id')
  const activeSlice = flag('--slice')
  const profile = flag('--profile')
  const snapshot = createProduct({
    title,
    idea,
    ...(productId ? { id: productId } : {}),
    ...(activeSlice ? { activeSlice } : {}),
    ...(profile ? { profile } : {}),
  })
  await saveSnapshot(snapshot, root, { initialize: true })
  await ensureSuoIgnored(root)
  await generateArtifacts(snapshot, root)
  print({ root, authority: 'suo/product.suo.ts', documents: 'docs/suo', revision: snapshot.revision, next: nextAction(snapshot) })
}

async function nextCommand(): Promise<void> {
  const action = nextAction(await loadSnapshot())
  if (hasFlag('--json')) print(action, true)
  else console.log(renderNext(action).replace(/^<!--[^\n]*-->\n?/, '').trim())
}

async function submitCommand(): Promise<void> {
  const source = requiredArg('submission file or -')
  const envelope = await readSubmission(source)
  await mutate(snapshot => envelope.kind === 'proposal'
    ? stageProposal(snapshot, envelope)
    : submitClosureEnvelope(snapshot, envelope))
}

async function approveCommand(): Promise<void> {
  const targetId = requiredArg('proposal or closure id')
  if (!hasFlag('--yes')) throw new Error('approval requires --yes after explicit owner or verifier approval')
  const verifier = flag('--verifier')
  await mutate(snapshot => {
    if (snapshot.proposals.some(value => value.id === targetId)) return approveProposal(snapshot, targetId)
    if (snapshot.closures.some(value => value.id === targetId)) {
      if (!verifier) throw new Error('closure approval requires --verifier <identity>')
      return acceptClosure(snapshot, targetId, verifier)
    }
    throw new Error(`unknown proposal or closure: ${targetId}`)
  })
}

async function rejectCommand(): Promise<void> {
  const targetId = requiredArg('proposal or closure id')
  const reason = requiredFlag('--reason')
  const verifier = flag('--verifier')
  await mutate(snapshot => {
    if (snapshot.proposals.some(value => value.id === targetId)) return rejectProposal(snapshot, targetId, reason)
    if (snapshot.closures.some(value => value.id === targetId)) {
      if (!verifier) throw new Error('closure rejection requires --verifier <identity>')
      return rejectClosure(snapshot, targetId, verifier, reason)
    }
    throw new Error(`unknown proposal or closure: ${targetId}`)
  })
}

async function inspectCommand(): Promise<void> {
  const snapshot = await loadSnapshot()
  const targetId = argv.find(value => !value.startsWith('--'))
  if (!targetId) {
    print({
      revision: snapshot.revision,
      product: snapshot.product,
      modules: snapshot.modules.map(value => ({ id: value.id, title: value.title, status: value.definitionStatus })),
      pendingProposals: snapshot.proposals.filter(value => value.status === 'pending').map(value => ({ id: value.id, summary: value.summary })),
      handoffs: snapshot.handoffs.map(value => ({ id: value.id, status: value.status })),
      closures: snapshot.closures.map(value => ({ id: value.id, status: value.status })),
      next: nextAction(snapshot),
    })
    return
  }
  const record = findRecord(snapshot, targetId)
  if (!record) throw new Error(`unknown record: ${targetId}`)
  print(record, hasFlag('--json'))
}

async function checkCommand(): Promise<void> {
  const snapshot = await loadSnapshot()
  const issues = validateSnapshot(snapshot)
  if (issues.length) throw new Error(issues.join('\n'))
  const generated = await generateArtifacts(snapshot)
  print({ valid: true, revision: snapshot.revision, generated })
}

async function mutate(operation: (snapshot: SuoSnapshot) => SuoSnapshot): Promise<void> {
  const current = await loadSnapshot()
  const next = operation(current)
  await saveSnapshot(next)
  await generateArtifacts(next)
  print({ revision: next.revision, next: nextAction(next) })
}

function findRecord(snapshot: SuoSnapshot, targetId: string): unknown {
  if (snapshot.product.id === targetId) return snapshot.product
  for (const values of [snapshot.modules, snapshot.decisions, snapshot.proposals, snapshot.handoffs, snapshot.realizations, snapshot.closures]) {
    const value = values.find(item => item.id === targetId)
    if (value) return value
  }
  return undefined
}

function flag(name: string): string | undefined {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${name}`)
  argv.splice(index, 2)
  return value
}
function hasFlag(name: string): boolean { return argv.includes(name) }
function positionalArgs(values: string[]): string[] {
  const valued = new Set(['--idea', '--root', '--title', '--id', '--slice', '--profile', '--reason', '--verifier'])
  const output: string[] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!
    if (valued.has(value)) { index += 1; continue }
    if (!value.startsWith('--')) output.push(value)
  }
  return output
}
function requiredFlag(name: string): string { const value = flag(name); if (!value) throw new Error(`missing ${name}`); return value }
function requiredArg(label: string): string { const value = argv.shift(); if (!value || value.startsWith('--')) throw new Error(`missing ${label}`); return value }
async function readSubmission(path: string): Promise<SubmissionEnvelope> {
  const text = path === '-' ? await readStdin() : await readFile(path, 'utf8')
  const value = JSON.parse(text) as Partial<SubmissionEnvelope>
  if (value.kind !== 'proposal' && value.kind !== 'closure') throw new Error('submission kind must be proposal or closure')
  return value as SubmissionEnvelope
}
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
function print(value: unknown, compact = false): void { console.log(JSON.stringify(value, null, compact ? 0 : 2)) }
async function pathExists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
async function ensureSuoIgnored(root: string): Promise<void> {
  const path = resolve(root, '.gitignore')
  const current = await pathExists(path) ? await readFile(path, 'utf8') : ''
  if (current.split(/\r?\n/).includes('.suo/')) return
  const prefix = current.length && !current.endsWith('\n') ? `${current}\n` : current
  await writeFile(path, `${prefix}.suo/\n`, 'utf8')
}

function helpText(): string { return `Suo 梭 — A shuttle for thought.

Human interaction happens through the Suo Agent Skill. This CLI is the deterministic local protocol used by agents and CI.

Usage:
  suo init [project-directory] --idea "I have an idea..." [--title <title>]
  suo next [--json]
  suo submit <submission.json|->
  suo approve <proposal-id> --yes
  suo approve <closure-id> --yes --verifier <identity>
  suo reject <proposal-id> --reason <reason>
  suo reject <closure-id> --reason <reason> --verifier <identity>
  suo inspect [record-id] [--json]
  suo check
` }
