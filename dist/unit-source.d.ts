import { type UnitSnapshot, type Unit, type UnitDecision } from './unit-model.js';
export interface SourceDecision extends Omit<UnitDecision, 'unitId' | 'prerequisites'> {
    unit: Unit;
    prerequisites: SourceDecision[];
}
export interface SourceUnits extends Omit<UnitSnapshot, 'decisions' | 'containment' | 'dependencies'> {
    decisions: SourceDecision[];
    containment: Array<{
        parent: Unit;
        child: Unit;
    }>;
    dependencies: Array<{
        consumer: Unit;
        prerequisite: Unit;
        require: 'contract' | 'implementation' | 'verification';
        at: 'start' | 'verify' | 'accept';
    }>;
}
export declare const unitOntology: string;
export declare function sourceFiles(root: string): Promise<string[]>;
export declare function loadUnits(root: string): Promise<UnitSnapshot>;
export declare function unitSourceContents(s: UnitSnapshot): Map<string, string>;
