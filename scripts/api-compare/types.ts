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
   * Normalized digest of the Ruby method BODY (source-hash pinning, RFC 0025).
   * Whitespace/comment-insensitive, body-only; changes when the ported code
   * changes upstream. Ruby-side only (the TS extractor does not emit it); used
   * by body-pins.ts / lint-body-pins.ts to detect vendored-Rails body drift on
   * matched pairs. See extract-ruby-api.rb#body_digest.
   */
  bodyDigest?: string;
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
  /**
   * True when this method was harvested from a top-level umbrella file's
   * module-level singleton config (e.g. `singleton_class.attr_accessor` in
   * `active_record.rb`) and redirected onto `<Module>::Base`. trails ports this
   * config inconsistently — some flags as Base statics, others in their feature
   * files (schema-cache.ts, database-tasks.ts, …) — so compare credits the port
   * wherever it lands in the package, treating it as a move rather than a
   * false-missing pinned to base.ts. See extract-ruby-api.rb#scan_umbrella_file.
   */
  umbrellaConfig?: boolean;
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
