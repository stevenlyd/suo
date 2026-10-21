import type { UnitSnapshot } from './unit-model.js';
/** Called explicitly after a crash; a lock never silently expires. */
export declare function recoverUnits(root: string): Promise<void>;
/** All-or-nothing logical authority replacement; never commits Git or writes external facts. */
export declare function saveUnits(root: string, snapshot: UnitSnapshot, expectedToken: string): Promise<void>;
/** Initial authority creation is staged as one directory, never partial file writes. */
export declare function createUnitTemplate(root: string, snapshot: UnitSnapshot): Promise<void>;
