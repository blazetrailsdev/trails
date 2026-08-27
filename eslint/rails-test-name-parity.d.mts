export const MANIFEST_PATH: string;
export const MARK_PATH: string;

export function isManifestAvailable(): boolean;

export function repoRel(filename: string): string | null;

export function normalizeTestName(s: string): string;

declare const rule: unknown;
export default rule;
