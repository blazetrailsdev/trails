import { Type } from "./value.js";

const DASHED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DASHLESS_RE = /^[0-9a-f]{32}$/i;
const BRACED_RE = /^\{([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}$/i;
const BRACED_DASHLESS_RE = /^\{([0-9a-f]{32})\}$/i;

function formatUuid(hex: string): string {
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class UuidType extends Type<string> {
  readonly name = "uuid";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();

    if (DASHED_RE.test(str)) return str.toLowerCase();

    if (DASHLESS_RE.test(str)) return formatUuid(str);

    const bracedMatch = str.match(BRACED_RE);
    if (bracedMatch) return bracedMatch[1].toLowerCase();

    const bracedDashlessMatch = str.match(BRACED_DASHLESS_RE);
    if (bracedDashlessMatch) return formatUuid(bracedDashlessMatch[1]);

    return null;
  }
}
