// Shared types for test comparison pipeline

// --- Test gating (adapter / feature conditionals) ---

/** Normalized adapter family a gate restricts a test to. */
export type GateAdapter = "postgresql" | "mysql" | "sqlite";

/**
 * A test's gating condition — the static answer to "under which adapters /
 * DB features does this test run?". Extracted from both Rails
 * (`current_adapter?` / `skip unless supports_X?` / directory layout) and TS
 * (`describeIfPg` / `describeIfSupports` / `it.skipIf`). Absent (`undefined`)
 * means the test runs unconditionally on every adapter.
 *
 * `pending` (it.skip/it.todo) is deliberately NOT a gate — it is the TODO
 * signal. A gate says "Rails itself only runs this conditionally"; pending
 * says "we haven't implemented this yet."
 */
export interface TestGate {
  /**
   * Positive adapter set: the test runs only on these adapters. Absent means
   * not adapter-restricted. Sorted, de-duplicated.
   */
  adapters?: GateAdapter[];
  /**
   * Required DB-feature keys (Rails `supports_X?` → `"X"`). The test runs only
   * when every listed feature is supported. Sorted, de-duplicated.
   */
  features?: string[];
  /**
   * Other runtime guards we recognize but don't resolve to an adapter/feature
   * set: `"mariadb"`, `"in_memory_db"`, `"version"`, or `"unknown"` for an
   * unrecognized `skipIf`/`runIf` expression. Informational only.
   */
  guards?: string[];
  /** Where each part of the gate came from (for diagnostics). */
  source: ("dir" | "class" | "test" | "body-skip" | "wrapper")[];
}

// --- Extracted test manifest ---

export interface TestCaseInfo {
  /** Hierarchical path: "Describe > Nested > test name" */
  path: string;
  /** The test description text */
  description: string;
  /** Ancestor describe blocks from outermost to innermost */
  ancestors: string[];
  /** Source file */
  file: string;
  /** Line number in source */
  line: number;
  /** Test definition style */
  style: "it" | "test" | "def_test" | "describe";
  /** Assertion method names used in the test body */
  assertions: string[];
  /** Whether the test is pending/skipped */
  pending?: boolean;
  /**
   * Adapter/feature gating condition, if the test runs conditionally. Absent
   * means unconditional. See {@link TestGate}.
   */
  gate?: TestGate;
}

export interface TestFileInfo {
  /** Relative file path */
  file: string;
  /** Top-level class or describe block name */
  className: string;
  /** Individual test cases */
  testCases: TestCaseInfo[];
  /** Total test count */
  testCount: number;
}

export interface TestPackageInfo {
  files: TestFileInfo[];
  totalTests: number;
}

export interface TestManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  packages: Record<string, TestPackageInfo>;
}

// --- Comparison results ---

/** matched = real passing TS test; stub = it.skip placeholder; skipped = null override; missing = no TS test */
export type TestStatus = "matched" | "stub" | "missing" | "skipped" | "extra";

export interface TestComparison {
  rubyPath: string;
  tsPath: string | null;
  status: TestStatus;
  matchConfidence: "exact" | "normalized" | "fuzzy" | "override" | "none";
  rubyFile?: string;
  tsFile?: string;
  notes?: string;
}

export interface FileComparison {
  rubyFile: string;
  tsFile: string | null;
  tsDescribeBlock: string | null;
  matched: number;
  stub: number;
  skipped: number;
  missing: number;
  extra: number;
  tests: TestComparison[];
}

export interface PackageComparison {
  package: string;
  files: FileComparison[];
  matched: number;
  stub: number;
  skipped: number;
  missing: number;
  extra: number;
  coveragePercent: number;
}

export interface TestComparisonResult {
  generatedAt: string;
  railsVersion: string;
  summary: {
    totalRubyTests: number;
    matched: number;
    stub: number;
    skipped: number;
    missing: number;
    extra: number;
    coveragePercent: number;
  };
  packages: Record<string, PackageComparison>;
}
