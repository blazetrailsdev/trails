import type { Rule } from "eslint";

declare const rule: Rule.RuleModule;
export default rule;

export const DIRECTIVE_RE: RegExp;
export function keptLineLeadingTag(line: string): { name: string; text: string } | null;
