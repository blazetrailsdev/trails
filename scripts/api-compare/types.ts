// Shared types for API comparison pipeline

// --- Extracted API manifest ---

/** A recorded literal value — a parameter default or constant RHS. `expr` marks
 *  a non-literal (call/ref/lambda), recorded so the comparer skips it rather
 *  than confusing it with "no default". See literals.ts. */
export interface LiteralValue {
  kind: "int" | "float" | "string" | "symbol" | "bool" | "nil" | "array" | "hash" | "expr";
  value?: string | boolean; // int/float token (underscores kept), string/symbol text, or boolean
}

export interface ParamInfo {
  name: string;
  kind: "required" | "optional" | "rest" | "keyword" | "keyword_rest" | "block";
  default?: string;
  literal?: LiteralValue; // default value, when present; compared by literals.ts
  /**
   * TS-side declared type text (e.g. `"Base"`), when available — lets a
   * consumer recognize a leading receiver/host param on standalone mixin
   * functions (the arity check, in a follow-up). Absent on the Ruby side.
   */
  type?: string;
}

// When you add a field here that the extractor POPULATES, also add its emitted
// key to EXTRACTOR_OUTPUT_FIELDS in extractor-schema.ts so the ts-api cache
// token changes and stale entries missing the field are evicted (see PR #4020).
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
  fileConstants?: Record<string, Record<string, LiteralValue>>; // file → NAME → literal value
}

export interface ApiManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  /**
   * Content hash of the extractor that produced this manifest (Ruby:
   * `extract-ruby-api.rb`). Lets a cross-version diff detect when the pinned
   * base and the freshly-extracted target were built by DIFFERENT extractor
   * versions — which would conflate extractor-version drift with real Rails
   * drift. Optional for back-compat with manifests written before this field.
   */
  extractorHash?: string;
  packages: Record<string, PackageInfo>;
}
