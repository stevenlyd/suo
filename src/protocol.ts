import { Ajv2020 } from 'ajv/dist/2020.js'
import schema from '../schemas/compiled-snapshot.schema.json' with { type: 'json' }
import type { SubmissionEnvelope, ClosureSubmission, ProductOperation } from './model.js'
const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) })
ajv.addSchema(schema)
const validator = (name: string) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` })
const envelope = validator('envelope'), closure = validator('closureSubmission'), operation = validator('operation')
function assert(value: unknown, check: ReturnType<typeof validator>, label: string): void {
  if (!check(value)) throw new Error(`invalid ${label}: ${ajv.errorsText(check.errors, { separator: '; ', dataVar: label })}`)
}
export function assertSubmission(value: unknown): asserts value is SubmissionEnvelope { assert(value, envelope, 'submission') }
export function assertClosureSubmission(value: unknown): asserts value is ClosureSubmission { assert(value, closure, 'closure') }
export function assertOperation(value: unknown): asserts value is ProductOperation { assert(value, operation, 'operation') }

const decisionProposal = validator('decisionProposal')
export function assertDecisionProposal(value: unknown): void { assert(value, decisionProposal, 'decision proposal') }
