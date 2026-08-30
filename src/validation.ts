import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject } from 'ajv'
import schema from '../schemas/intent-loop.schema.json' with { type: 'json' }
import type { IntentLoopSnapshot } from './model.js'
import { validateInvariants } from './core.js'

const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) })
const validateSchema = ajv.compile<IntentLoopSnapshot>(schema)

export function validateSnapshot(value: unknown): string[] {
  const issues: string[] = []
  if (!validateSchema(value)) issues.push(...(validateSchema.errors ?? []).map((error: ErrorObject) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`))
  if (!issues.length) issues.push(...validateInvariants(value as IntentLoopSnapshot))
  return issues
}

export function assertValidSnapshot(value: unknown): asserts value is IntentLoopSnapshot {
  const issues = validateSnapshot(value)
  if (issues.length) throw new Error(`invalid IntentLoop snapshot:\n- ${issues.join('\n- ')}`)
}
