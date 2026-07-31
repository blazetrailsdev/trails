export function trailsToRailsRel(absOrRelPath: string): string | null;

export function railsToTrailsRel(railsRel: string): string;

export function requiredFixtureSets(entry: {
  fixtures?: string[];
  tests?: Record<string, { fixtures?: Record<string, unknown> }>;
}): string[];

export function collectUseFixturesKeys(programNode: unknown): {
  found: boolean;
  keys: Set<string>;
};

declare const rule: unknown;
export default rule;
