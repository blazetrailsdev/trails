/**
 * Entries scoped to `package: "pg"`. The denominator is what activerecord
 * calls (RFC 0186 § "Scoring"); a gem file with no member in the RFC's surface
 * tables is listed here. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const NOT_CALLED = "not called by activerecord";

export const PG_UNPORTED_FILES: UnportedFile[] = [
  { pattern: "/basic_type_map_based_on_result.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/basic_type_map_for_queries.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/basic_type_map_for_results.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/basic_type_registry.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "binary_decoder/", package: "pg", reason: NOT_CALLED },
  { pattern: "binary_encoder/", package: "pg", reason: NOT_CALLED },
  { pattern: "text_encoder/", package: "pg", reason: NOT_CALLED },
  { pattern: "/text_decoder/inet.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/text_decoder/json.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/text_decoder/numeric.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/tuple.rb", package: "pg", reason: NOT_CALLED },
  { pattern: "/type_map_by_column.rb", package: "pg", reason: NOT_CALLED },
];
