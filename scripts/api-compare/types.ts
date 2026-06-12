// Shared types for API comparison pipeline

// --- Extracted API manifest ---

export interface ParamInfo {
  name: string;
  kind: "required" | "optional" | "rest" | "keyword" | "keyword_rest" | "block";
  default?: string;
  /**
   * TS-side declared type text (e.g. `"Base"`), when available — lets a
   * consumer recognize a leading receiver/host param on standalone mixin
   * functions (the arity check, in a follow-up). Absent on the Ruby side.
   */
  type?: string;
}

export interface MethodInfo {
  name: string;
  visibility: "public" | "protected" | "private";
  params: ParamInfo[];
  line?: number;
  file?: string;
  isStatic?: boolean;
  deps?: string[];
  depRefs?: Record<string, string[]>;
  calls?: string[];
  /**
   * True when the method is not part of the public API surface:
   * Ruby `private`/`protected`, TS `private`/`protected`, or
   * TS `#`-prefixed private fields. Consumers should filter these
   * out of normal coverage and only include them behind an opt-in flag.
   */
  internal?: boolean;
  /** Ruby-side option symbols consumed from an `options`/`opts`/`**kwargs`
   *  param (raw snake_case); advisory under-approximation. See options-keys.ts. */
  option_keys?: string[];
  /** TS-side property names of the trailing options-object param; `null` when
   *  uncheckable (`any`/`Record<string, unknown>`), absent when not an object. */
  optionKeys?: string[] | null;
}

export interface ClassInfo {
  name: string;
  superclass?: string;
  file?: string;
  includes: string[];
  extends: string[];
  instanceMethods: MethodInfo[];
  classMethods: MethodInfo[];
}

export interface PackageInfo {
  classes: Record<string, ClassInfo>;
  modules: Record<string, ClassInfo>;
  fileFunctions?: Record<string, MethodInfo[]>;
}

export interface ApiManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  packages: Record<string, PackageInfo>;
}
