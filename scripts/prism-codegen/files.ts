import * as path from "node:path";
import { resolvePath } from "../../vendor/sources.js";
export interface TargetFile {
  ruby: string;
  centralityRank: number;
  tractability: "tractable" | "pathological";
  deepDrill?: boolean;
  rationale: string;
}
const AR_ROOT = resolvePath("activerecord");
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
  return path.join(AR_ROOT, f.ruby.replace(/^active_record\//, ""));
}
export function railsLibRelPaths(): string[] {
  return TARGET_FILES.map((f) => f.ruby);
}
