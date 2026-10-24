export declare const writerPath = "suo/writer.json";
export interface WriterIdentity {
    schemaVersion: 1;
    tool: 'suo';
    version: string;
    skillDigest: string;
    runtimeDigest: string;
}
export declare function compareWriterVersions(actual: string, recorded: string): number;
export declare function validateWriter(value: unknown): asserts value is WriterIdentity;
export declare function currentWriter(): Promise<WriterIdentity>;
export declare function readWriter(root: string, path?: string): Promise<WriterIdentity | null>;
export declare function requireCompatibleWriter(installed: WriterIdentity, recorded: WriterIdentity | null): 'unrecorded' | 'same' | 'newer';
export declare function checkWriter(root: string): Promise<{
    installed: WriterIdentity;
    recorded: WriterIdentity | null;
    compatibility: "unrecorded" | "same" | "newer";
    path: string;
    notice: string;
}>;
export declare const writerContents: (writer: WriterIdentity) => string;
/** For Skill edits or external renderers. No product replacement, Git commit or other tool record. */
export declare function recordWriter(root: string): Promise<void>;
