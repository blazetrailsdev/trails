/**
 * Entries scoped to `package: "mysql2"`. The denominator is what activerecord
 * calls (RFC 0254 § "The measured split"); a gem file with no member in the
 * RFC's surface table is listed here. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_CALLED = "not called by activerecord";

export const MYSQL2_UNPORTED_FILES: UnportedFile[] = [
  { pattern: "/em.rb", package: "mysql2", reason: NOT_CALLED },
  { pattern: "/field.rb", package: "mysql2", reason: NOT_CALLED },
  { pattern: "mysql2.rb", package: "mysql2", reason: NOT_CALLED },
];
