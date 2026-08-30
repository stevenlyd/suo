import { Ajv2020 } from 'ajv/dist/2020.js'
import schema from '../schemas/suo.schema.json' with { type: 'json' }
import type { SuoSnapshot } from './model.js'
import { validateInvariants } from './core.js'

const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) })
const validateSchema = ajv.compile<SuoSnapshot>(schema)

export function validateSnapshot(value: unknown): string[] {
  const valid = validateSchema(value)
  const issues = valid ? [] : (validateSchema.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
  if (!issues.length) issues.push(...validateInvariants(value as SuoSnapshot))
  return issues
}

export function assertValidSnapshot(value: unknown): asserts value is SuoSnapshot {
  const issues = validateSnapshot(value)
  if (issues.length) throw new Error(`invalid Suo snapshot:\n- ${issues.join('\n- ')}`)
}
