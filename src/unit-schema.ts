import { unitSnapshotShape } from './unit-model.js'
import type { Shape } from './unit-shape.js'
/** Export format only; runtime validation and generated TS use the same shapes. */
export function unitJsonSchema(): Record<string,unknown> {
 const root:Record<string,unknown>={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://stevenlyd.github.io/suo/unit-v5.schema.json'}
 const stack:Array<{shape:Shape<unknown>;out:Record<string,unknown>}>=[{shape:unitSnapshotShape,out:root}]
 while(stack.length){const {shape:s,out}=stack.pop()!;switch(s.kind){
 case 'string':Object.assign(out,{type:'string',minLength:1,pattern:'\\S'});break
 case 'boolean':out.type='boolean';break
 case 'number':Object.assign(out,{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER});break
 case 'literal':out.enum=s.values;break
 case 'nullable':{const child={};out.anyOf=[{type:'null'},child];stack.push({shape:s.item!,out:child});break}
 case 'array':{const child={};Object.assign(out,{type:'array',items:child});stack.push({shape:s.item!,out:child});break}
 case 'object':{const properties:Record<string,unknown>={};Object.assign(out,{type:'object',additionalProperties:false,required:Object.keys(s.fields!),properties});for(const [key,shape]of Object.entries(s.fields!)){const child={};properties[key]=child;stack.push({shape,out:child})}break}
 }}return root
}
