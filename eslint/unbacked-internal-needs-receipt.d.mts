import type { Rule } from "eslint";

declare const rule: Rule.RuleModule;
export default rule;

export function hasReceipt(commentValue: string): boolean;
