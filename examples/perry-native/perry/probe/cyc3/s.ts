// s.ts starts initialising, and pulls in x.ts BEFORE finishing.
import "./x.js";
export function search(): string { return "search"; }
export const tag = "s";
