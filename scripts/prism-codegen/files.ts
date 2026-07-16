/**
 * The top-10 ActiveRecord files targeted by the spike, ranked by dependency
 * centrality, plus a tractability tag per file.
 *
 * Ranking signal: **membership in `ActiveRecord::Base`'s include/extend list**
 * (base.rb:283-332) — every module mixed into `Base` is, by construction,
 * depended on by every model, so it sits at the center of the dependency
 * graph. The Relation query core (relation.rb + its query_methods /
 * finder_methods / calculations mixins) is the other hub: every lazy query
 * path flows through it. We rank by that centrality, then pick the deepest
 * drill targets by *tractability* (metaprogramming density), so the verdict
 * reflects what deterministic codegen can do, not just how it drowns on the
 * macro-DSL files.
 *
 * Tractability: `pathological` files are dominated by class-macro DSLs and
 * metaprogramming (define_method / class-level macros / Builder dispatch) that
 * has no faithful deterministic JS shape; `tractable` files are method-body
 * heavy with ordinary control flow.
 */
import * as path from "node:path";
import { resolvePath } from "../../vendor/sources.js";

export interface TargetFile {
  ruby: string; // path under activerecord/lib/
  centralityRank: number;
  tractability: "tractable" | "pathological";
  deepDrill?: boolean;
  rationale: string;
}

/**
 * Vendored-source location comes from the single source of truth,
 * `resolvePath("activerecord")` (vendor/sources.ts) → `.../active_record`, not a
 * parallel hard-coded path constant, so this tool follows the same contract as
 * api-compare and never drifts if the vendor layout changes.
 */
const AR_ROOT = resolvePath("activerecord"); // .../vendor/rails/activerecord/lib/active_record

export const TARGET_FILES: TargetFile[] = [
  {
    ruby: "active_record/base.rb",
    centralityRank: 1,
    tractability: "pathological",
    rationale:
      "The class every model subclasses; body is pure macro composition (include/extend of 40+ modules).",
  },
  {
    ruby: "active_record/relation.rb",
    centralityRank: 2,
    tractability: "pathological",
    rationale: "Query-object core; delegation macros + Arel construction dominate.",
  },
  {
    ruby: "active_record/persistence.rb",
    centralityRank: 3,
    tractability: "tractable",
    deepDrill: true,
    rationale:
      "CRUD instance methods (save/update/destroy) — plain control flow, low metaprogramming.",
  },
  {
    ruby: "active_record/associations.rb",
    centralityRank: 4,
    tractability: "pathological",
    rationale: "has_many/has_one/belongs_to macro DSL delegating to Builder classes.",
  },
  {
    ruby: "active_record/relation/query_methods.rb",
    centralityRank: 5,
    tractability: "pathological",
    rationale: "where/joins/select builders; heavy Arel + define_method-style dispatch.",
  },
  {
    ruby: "active_record/core.rb",
    centralityRank: 6,
    tractability: "pathological",
    rationale: "Connection/config class macros + method-generating configuration hooks.",
  },
  {
    ruby: "active_record/relation/finder_methods.rb",
    centralityRank: 7,
    tractability: "tractable",
    deepDrill: true,
    rationale: "find/find_by/exists? — argument-shaping + query dispatch, ordinary bodies.",
  },
  {
    ruby: "active_record/relation/calculations.rb",
    centralityRank: 8,
    tractability: "tractable",
    deepDrill: true,
    rationale: "count/sum/average/pluck — numeric aggregation logic, zero metaprogramming.",
  },
  {
    ruby: "active_record/inheritance.rb",
    centralityRank: 9,
    tractability: "pathological",
    rationale: "STI class resolution; relies on const_get/descendants reflection.",
  },
  {
    ruby: "active_record/model_schema.rb",
    centralityRank: 10,
    tractability: "pathological",
    rationale: "Schema reflection via class_attribute macros generating accessors.",
  },
];

export function rubyAbsPath(f: TargetFile): string {
  // f.ruby is `active_record/…`; AR_ROOT already ends in `active_record`.
  return path.join(AR_ROOT, f.ruby.replace(/^active_record\//, ""));
}

/** Ruby paths relative to the active_record lib root (for rubyFileToTs). */
export function railsLibRelPaths(): string[] {
  return TARGET_FILES.map((f) => f.ruby);
}
