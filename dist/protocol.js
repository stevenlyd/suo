import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schemas/compiled-snapshot.schema.json' with { type: 'json' };
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) });
ajv.addSchema(schema);
const validator = (name) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
const envelope = validator('envelope'), closure = validator('closureSubmission'), operation = validator('operation');
function assert(value, check, label) {
    if (!check(value))
        throw new Error(`invalid ${label}: ${ajv.errorsText(check.errors, { separator: '; ', dataVar: label })}`);
}
export function assertSubmission(value) { assert(value, envelope, 'submission'); }
export function assertClosureSubmission(value) { assert(value, closure, 'closure'); }
export function assertOperation(value) { assert(value, operation, 'operation'); }
const decisionProposal = validator('decisionProposal');
export function assertDecisionProposal(value) { assert(value, decisionProposal, 'decision proposal'); }
//# sourceMappingURL=protocol.js.map