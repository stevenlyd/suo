import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schemas/compiled-snapshot.schema.json' with { type: 'json' };
import { validateInvariants } from './core.js';
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) });
const validateSchema = ajv.compile(schema);
export function validateSnapshot(value) {
    const valid = validateSchema(value);
    const issues = valid ? [] : (validateSchema.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
    if (!issues.length)
        issues.push(...validateInvariants(value));
    return issues;
}
export function assertValidSnapshot(value) {
    const issues = validateSnapshot(value);
    if (issues.length)
        throw new Error(`invalid Suo snapshot:\n- ${issues.join('\n- ')}`);
}
//# sourceMappingURL=validation.js.map