#!/usr/bin/env npx tsx
/**
 * Compares Ruby Rails tests with our TypeScript tests.
 *
 * File mapping is convention-based:
 *   finder_test.rb → finder.test.ts (snake_case → kebab-case)
 *
 * A small override table handles cases where the convention doesn't hold
 * (e.g. belongs_to_associations_test.rb → belongs-to.test.ts).
 *
 * Test matching: for each Ruby test, search ALL tests in the mapped TS file(s)
 * by normalized description. No need to specify describe blocks.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  TestManifest,
  TestCaseInfo,
  TestFileInfo,
  TestComparisonResult,
  PackageComparison,
  FileComparison,
  TestComparison,
  TestStatus,
} from "./types.js";
import {
  TEST_OVERRIDES,
  normalizeTestDescription,
  matchDescriptions,
  shouldSkipFile,
} from "./test-naming-map.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

// ---------------------------------------------------------------------------
// Convention-based file mapping
// ---------------------------------------------------------------------------

/**
 * Convert a Ruby test filename to the expected TS filename by convention.
 * Per-package rules:
 *   activerecord: snake_case → kebab-case (finder_test.rb → finder.test.ts)
 *   rack: keep underscores, strip spec_ prefix (spec_request.rb → request.test.ts)
 *   arel: everything → arel.test.ts (single file)
 *   activemodel: everything → activemodel.test.ts (single file)
 *   actiondispatch/actioncontroller: snake_case → kebab-case
 */
function rubyFileToConventionTs(rubyFile: string, pkg: string): string {
  // Single-file packages
  if (pkg === "arel") return "arel.test.ts";
  if (pkg === "activemodel") return "activemodel.test.ts";

  // Rack: spec_foo.rb → foo.test.ts (keep underscores in basename)
  if (pkg === "rack") {
    const base = path.basename(rubyFile, ".rb");
    const name = base.replace(/^spec_/, "");
    return name + ".test.ts";
  }

  // Default: snake_case → kebab-case
  return rubyFile
    .replace(/_test\.rb$/, ".test.ts")
    .replace(/_/g, "-");
}

/**
 * File-level overrides for when the convention doesn't hold.
 * Key: ruby file path, Value: array of TS file basenames to search.
 * These are keyed per-package in FILE_OVERRIDES below.
 */
const FILE_OVERRIDES: Record<string, Record<string, string[]>> = {
  activerecord: {
    // Associations: Ruby uses long names, TS uses short names
    "associations/belongs_to_associations_test.rb": ["belongs-to.test.ts"],
    "associations/has_many_associations_test.rb": ["has-many.test.ts"],
    "associations/has_one_associations_test.rb": ["has-one-habtm.test.ts", "has-one-async.test.ts"],
    "associations/has_many_through_associations_test.rb": ["has-many-through.test.ts", "eager-hmthrough.test.ts"],
    "associations/has_one_through_associations_test.rb": ["has-one-habtm.test.ts"],
    "associations/has_and_belongs_to_many_associations_test.rb": ["has-one-habtm.test.ts", "habtm.test.ts"],
    "associations/inverse_associations_test.rb": [
      "inverse.test.ts", "inverse-has-many.test.ts", "inverse-has-one.test.ts",
      "inverse-belongs-to.test.ts", "inverse-automatic.test.ts", "inverse-polymorphic-belongs-to.test.ts",
    ],
    "associations/join_model_test.rb": ["has-one-habtm.test.ts"],
    "associations/nested_through_associations_test.rb": ["has-one-habtm.test.ts"],
    "associations/inner_join_association_test.rb": ["inner-join.test.ts"],
    "associations/left_outer_join_association_test.rb": ["left-outer-join.test.ts"],
    "associations/extension_test.rb": ["extensions.test.ts"],
    "associations/bidirectional_destroy_dependencies_test.rb": ["bidirectional-destroy.test.ts"],
    "associations/nested_error_test.rb": ["nested-attributes.test.ts"],
    "associations/eager_load_includes_full_sti_class_test.rb": ["eager.test.ts"],
    "associations/eager_load_nested_include_test.rb": ["eager.test.ts"],
    "associations/eager_singularization_test.rb": ["eager.test.ts"],
    "associations/cascaded_eager_loading_test.rb": ["cascaded-eager-loading.test.ts"],
    "associations/callbacks_test.rb": ["callbacks.test.ts"],

    // Validations: Ruby uses long names, TS uses short
    "validations/uniqueness_validation_test.rb": ["uniqueness.test.ts"],
    "validations/presence_validation_test.rb": ["presence.test.ts"],
    "validations/absence_validation_test.rb": ["absence.test.ts"],
    "validations/length_validation_test.rb": ["length.test.ts"],
    "validations/numericality_validation_test.rb": ["numericality.test.ts"],
    "validations/association_validation_test.rb": ["association.test.ts"],

    // Locking: Ruby has one file, TS splits by type
    "locking_test.rb": ["optimistic.test.ts", "pessimistic.test.ts"],
    "custom_locking_test.rb": ["custom.test.ts"],

    // Eager loading: Ruby eager_test.rb also maps to eager-hmthrough.test.ts
    "associations/eager_test.rb": ["eager.test.ts", "eager-hmthrough.test.ts", "preloader.test.ts"],

    // Associations misc
    "associations/required_test.rb": ["required.test.ts"],
    "associations_test.rb": ["associations.test.ts", "proxy.test.ts", "overriding.test.ts", "generated-methods.test.ts"],

    // Other non-standard mappings
    "active_record_schema_test.rb": ["schema.test.ts"],
    "annotate_test.rb": ["annotations.test.ts"],
    "attributes_test.rb": ["custom-properties.test.ts"],
    "base_test.rb": ["base.test.ts", "core.test.ts", "persistence.test.ts", "finder.test.ts", "calculations.test.ts", "attribute-methods.test.ts", "enum.test.ts"],
    "calculations_test.rb": ["calculations.test.ts", "calculations-finder-basics.test.ts"],
    "finder_respond_to_test.rb": ["finder.test.ts"],
    "habtm_destroy_order_test.rb": ["habtm.test.ts"],
    "inheritance_test.rb": ["inheritance.test.ts", "sti.test.ts"],
    "primary_keys_test.rb": ["primary-keys.test.ts", "composite-primary-key.test.ts"],
    "inherited_test.rb": ["inheritance.test.ts"],
    "invertible_migration_test.rb": ["invertible.test.ts"],
    "migration_test.rb": ["migration.test.ts", "bulk-alter-table.test.ts", "copy.test.ts"],
    "nested_attributes_with_callbacks_test.rb": ["nested-attributes.test.ts"],
    "persistence/reload_association_cache_test.rb": ["reload-cache.test.ts"],
    "reflection_test.rb": ["reflection.test.ts", "reflection-migration.test.ts"],
    "relation/delegation_test.rb": ["querying-methods-delegation.test.ts", "delegation-caching.test.ts"],
    "scoping/relation_scoping_test.rb": ["relation-scoping.test.ts", "has-many-scoping.test.ts", "habtm-scoping.test.ts"],

    // Associations callback test lives in associations/callbacks.test.ts not top-level callbacks.test.ts
    "associations/callbacks_test.rb": ["callbacks.test.ts"],

    // PostgreSQL adapter tests
    "adapters/postgresql/active_schema_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/array_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/bind_parameter_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/bit_string_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/bytea_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/case_insensitive_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/change_schema_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/cidr_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/citext_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/collation_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/composite_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/connection_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/create_unlogged_tables_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/datatype_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/date_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/dbconsole_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/deferred_constraints_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/domain_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/enum_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/explain_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/extension_migration_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/foreign_table_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/full_text_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/geometric_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/hstore_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/infinity_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/integer_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/interval_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/invertible_migration_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/json_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/ltree_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/money_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/network_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/numbers_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/optimizer_hints_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/partitions_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/postgresql_adapter_prevent_writes_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/postgresql_adapter_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/postgresql_rake_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/prepared_statements_disabled_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/quoting_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/range_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/referential_integrity_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/rename_table_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/schema_authorization_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/schema_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/serial_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/statement_pool_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/timestamp_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/transaction_nested_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/transaction_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/type_lookup_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/utils_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/uuid_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/virtual_column_test.rb": ["postgres-adapter.test.ts"],
    "adapters/postgresql/xml_test.rb": ["postgres-adapter.test.ts"],
    // MySQL adapter tests
    "adapters/abstract_mysql_adapter/active_schema_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/auto_increment_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/bind_parameter_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/case_sensitivity_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/charset_collation_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/connection_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/mysql_boolean_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/mysql_enum_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/mysql_explain_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/nested_deadlock_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/optimizer_hints_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/quoting_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/schema_migrations_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/schema_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/set_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/sp_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/sql_types_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/table_options_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/transaction_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/unsigned_type_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/virtual_column_test.rb": ["mysql-adapter.test.ts"],
    "adapters/abstract_mysql_adapter/warnings_test.rb": ["mysql-adapter.test.ts"],
    "adapters/mysql2/check_constraint_quoting_test.rb": ["mysql-adapter.test.ts"],
    "adapters/mysql2/dbconsole_test.rb": ["mysql-adapter.test.ts"],
    "adapters/mysql2/mysql2_adapter_test.rb": ["mysql-adapter.test.ts"],
    "adapters/mysql2/mysql2_rake_test.rb": ["mysql-adapter.test.ts"],
    // SQLite adapter tests
    "adapters/sqlite3/bind_parameter_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/collation_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/copy_table_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/dbconsole_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/explain_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/json_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/quoting_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/sqlite3_adapter_prevent_writes_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/sqlite3_adapter_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/sqlite3_create_folder_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/sqlite_rake_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/statement_pool_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/transaction_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/virtual_column_test.rb": ["sqlite-adapter.test.ts"],
    "adapters/sqlite3/virtual_table_test.rb": ["sqlite-adapter.test.ts"],
  },
  activesupport: {
    "inflector_test.rb": ["inflector.test.ts", "hwia-module-string.test.ts"],
    "core_ext/string_ext_test.rb": [
      "string-ext.test.ts", "hwia-module-string.test.ts", "safe-buffer.test.ts",
      "hwia-extended.test.ts",
    ],
  },
  actiondispatch: {
    // Routing tests all map to routing.test.ts
    "dispatch/routing_test.rb": ["routing.test.ts"],
    "dispatch/routing/route_set_test.rb": ["routing.test.ts"],
    "dispatch/routing/inspector_test.rb": ["routing.test.ts"],
    "dispatch/routing_assertions_test.rb": ["routing.test.ts"],
    "journey/route_test.rb": ["routing.test.ts"],
    "journey/router_test.rb": ["routing.test.ts"],
    "journey/router/utils_test.rb": ["routing.test.ts"],
    // Middleware tests
    "dispatch/ssl_test.rb": ["ssl.test.ts"],
    "dispatch/host_authorization_test.rb": ["host-authorization.test.ts"],
    "dispatch/middleware_stack_test.rb": ["stack.test.ts"],
    "dispatch/static_test.rb": ["static.test.ts"],
    "dispatch/request_id_test.rb": ["request-id.test.ts"],
    "dispatch/debug_exceptions_test.rb": ["debug-exceptions.test.ts"],
    // Other non-standard
    "dispatch/request_test.rb": ["request.test.ts"],
    "dispatch/response_test.rb": ["response.test.ts"],
    "dispatch/cookies_test.rb": ["cookies.test.ts"],
    "dispatch/mime_type_test.rb": ["mime-type.test.ts"],
    "dispatch/content_security_policy_test.rb": ["content-security-policy.test.ts"],
    "dispatch/permissions_policy_test.rb": ["permissions-policy.test.ts"],
    "dispatch/uploaded_file_test.rb": ["uploaded-file.test.ts"],
    "dispatch/exception_wrapper_test.rb": ["exception-wrapper.test.ts"],
    "dispatch/session/cookie_store_test.rb": ["cookie-store.test.ts"],
  },
  actioncontroller: {
    "controller/parameters/accessors_test.rb": ["parameters.test.ts"],
    "controller/parameters/parameters_permit_test.rb": ["parameters.test.ts"],
    "controller/parameters/mutators_test.rb": ["parameters.test.ts"],
    "controller/routing_test.rb": ["routing.test.ts", "controller-routing.test.ts"],
    "controller/url_for_test.rb": ["url-for.test.ts"],
    "controller/redirect_test.rb": ["redirect.test.ts"],
    "controller/flash_hash_test.rb": ["flash.test.ts"],
    "controller/flash_test.rb": ["flash.test.ts"],
    "controller/request_forgery_protection_test.rb": ["request-forgery-protection.test.ts"],
    "controller/mime/respond_to_test.rb": ["respond-to.test.ts"],
    "controller/http_basic_authentication_test.rb": ["http-authentication.test.ts"],
    "controller/http_token_authentication_test.rb": ["http-authentication.test.ts"],
    "controller/http_digest_authentication_test.rb": ["http-authentication.test.ts"],
    "controller/test_case_test.rb": ["test-case.test.ts"],
    "controller/render_test.rb": ["rendering.test.ts", "template-rendering.test.ts"],
    "controller/renderers_test.rb": ["rendering.test.ts"],
    "controller/filters_test.rb": ["filters.test.ts"],
    "controller/resources_test.rb": ["resource-routing.test.ts", "controller-routing.test.ts"],
    "controller/rescue_test.rb": ["rescue.test.ts"],
    "controller/caching_test.rb": ["caching.test.ts"],
    "controller/metal_test.rb": ["metal.test.ts"],
    "controller/base_test.rb": ["base.test.ts"],
    "controller/integration_test.rb": ["integration-test.test.ts"],
    "controller/params_wrapper_test.rb": ["params-wrapper.test.ts"],
    "controller/send_file_test.rb": ["base.test.ts"],
    "controller/route_helpers_test.rb": ["route-helpers.test.ts"],
  },
};

/**
 * Given a Ruby test file path and package, return the TS file basenames to search.
 */
function findTsFiles(rubyFile: string, pkg: string): string[] {
  // Check overrides first
  const pkgOverrides = FILE_OVERRIDES[pkg];
  if (pkgOverrides) {
    if (pkgOverrides[rubyFile]) return pkgOverrides[rubyFile];
    // Try basename
    const basename = path.basename(rubyFile);
    if (pkgOverrides[basename]) return pkgOverrides[basename];
  }

  // Convention-based
  const conventionPath = rubyFileToConventionTs(rubyFile, pkg);
  return [path.basename(conventionPath)];
}

// ---------------------------------------------------------------------------
// TS test lookup
// ---------------------------------------------------------------------------

interface TsTestEntry {
  path: string;
  description: string;
  normalizedDesc: string;
  pending: boolean;
  matched: boolean;
}

/**
 * Build lookup: package → Map<tsFileBasename, TsTestEntry[]>
 * All tests in a file are collected together regardless of describe block.
 */
function buildTsLookup(ts: TestManifest): Map<string, Map<string, TsTestEntry[]>> {
  const lookup = new Map<string, Map<string, TsTestEntry[]>>();

  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const byFile = new Map<string, TsTestEntry[]>();

    for (const fileInfo of pkgInfo.files) {
      const basename = path.basename(fileInfo.file);
      if (!byFile.has(basename)) byFile.set(basename, []);
      const tests = byFile.get(basename)!;

      for (const tc of fileInfo.testCases) {
        tests.push({
          path: tc.path,
          description: tc.description,
          normalizedDesc: normalizeTestDescription(tc.description),
          pending: tc.pending ?? false,
          matched: false,
        });
      }
    }

    lookup.set(pkg, byFile);
  }

  return lookup;
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

function main() {
  const rubyPath = path.join(OUTPUT_DIR, "rails-tests.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-tests.json");

  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-tests.json — run extract-ruby-tests.rb first");
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error("Missing ts-tests.json — run extract-ts-tests.ts first");
    process.exit(1);
  }

  const ruby: TestManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: TestManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  const tsLookup = buildTsLookup(ts);

  const result: TestComparisonResult = {
    generatedAt: new Date().toISOString(),
    railsVersion: "8.0.2",
    summary: {
      totalRubyTests: 0,
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      coveragePercent: 0,
    },
    packages: {},
  };

  for (const pkg of Object.keys(ruby.packages)) {
    const rubyPkg = ruby.packages[pkg];

    const pkgComparison = comparePackage(pkg, rubyPkg, tsLookup);
    result.packages[pkg] = pkgComparison;

    result.summary.totalRubyTests += pkgComparison.matched + pkgComparison.stub + pkgComparison.skipped + pkgComparison.missing;
    result.summary.matched += pkgComparison.matched;
    result.summary.stub += pkgComparison.stub;
    result.summary.skipped += pkgComparison.skipped;
    result.summary.missing += pkgComparison.missing;
    result.summary.extra += pkgComparison.extra;
  }

  result.summary.coveragePercent = result.summary.totalRubyTests > 0
    ? Math.round((result.summary.matched / result.summary.totalRubyTests) * 1000) / 10
    : 0;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "test-comparison-report.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "test-comparison-report.md"), generateMarkdown(result));

  printSummary(result);
}

function comparePackage(
  pkg: string,
  rubyPkg: TestManifest["packages"][string],
  tsLookup: Map<string, Map<string, TsTestEntry[]>>,
): PackageComparison {
  const fileComparisons: FileComparison[] = [];
  let totalMatched = 0;
  let totalStub = 0;
  let totalSkipped = 0;
  let totalMissing = 0;
  let totalExtra = 0;

  if (!rubyPkg) {
    return {
      package: pkg,
      files: [],
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      coveragePercent: 0,
    };
  }

  const tsByFile = tsLookup.get(pkg) || new Map<string, TsTestEntry[]>();

  for (const rubyFile of rubyPkg.files) {
    if (shouldSkipFile(rubyFile.file)) continue;

    // Find TS files to search
    const tsFileNames = findTsFiles(rubyFile.file, pkg);
    const firstTsFile = tsFileNames[0] || null;

    const fileComp: FileComparison = {
      rubyFile: rubyFile.file,
      tsFile: firstTsFile,
      tsDescribeBlock: null,
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      tests: [],
    };

    // Collect ALL tests from all matched TS files
    const allTsTests: TsTestEntry[] = [];
    for (const tsFileName of tsFileNames) {
      const tests = tsByFile.get(tsFileName);
      if (tests) {
        allTsTests.push(...tests);
      }
    }

    // Compare each Ruby test against TS tests
    for (const rubyTest of rubyFile.testCases) {
      const comparison = matchRubyTest(rubyTest, allTsTests);
      fileComp.tests.push(comparison);

      if (comparison.status === "matched") {
        fileComp.matched++;
      } else if (comparison.status === "stub") {
        fileComp.stub = (fileComp.stub ?? 0) + 1;
      } else if (comparison.status === "skipped") {
        fileComp.skipped++;
      } else {
        fileComp.missing++;
      }
    }

    totalMatched += fileComp.matched;
    totalStub += fileComp.stub ?? 0;
    totalSkipped += fileComp.skipped;
    totalMissing += fileComp.missing;

    fileComparisons.push(fileComp);
  }

  // Count extra TS tests (not matched to any Ruby test)
  const seenPaths = new Set<string>();
  for (const tests of tsByFile.values()) {
    for (const test of tests) {
      if (!test.matched && !seenPaths.has(test.path)) {
        seenPaths.add(test.path);
        totalExtra++;
      }
    }
  }

  const totalRuby = totalMatched + totalStub + totalSkipped + totalMissing;
  const coverage = totalRuby > 0
    ? Math.round((totalMatched / totalRuby) * 1000) / 10
    : 0;

  return {
    package: pkg,
    files: fileComparisons,
    matched: totalMatched,
    stub: totalStub,
    skipped: totalSkipped,
    missing: totalMissing,
    extra: totalExtra,
    coveragePercent: coverage,
  };
}

function matchRubyTest(
  rubyTest: TestCaseInfo,
  tsTests: TsTestEntry[],
): TestComparison {
  // Check manual overrides first
  const overrideResult = TEST_OVERRIDES[rubyTest.path];
  if (overrideResult !== undefined) {
    if (overrideResult === null) {
      return {
        rubyPath: rubyTest.path,
        tsPath: null,
        status: "skipped",
        matchConfidence: "override",
        rubyFile: rubyTest.file,
        notes: "Null override — not yet implemented in TS",
      };
    }
    const tsMatch = tsTests.find((t) => t.path === overrideResult);
    if (tsMatch) {
      tsMatch.matched = true;
      return {
        rubyPath: rubyTest.path,
        tsPath: tsMatch.path,
        status: tsMatch.pending ? "stub" : "matched",
        matchConfidence: "override",
        rubyFile: rubyTest.file,
      };
    }
    return {
      rubyPath: rubyTest.path,
      tsPath: overrideResult,
      status: "stub",
      matchConfidence: "override",
      rubyFile: rubyTest.file,
      notes: "Override target not found in TS lookup",
    };
  }

  // Try matching by description normalization
  let bestMatch: TsTestEntry | null = null;
  let bestConfidence: "exact" | "normalized" | "fuzzy" | "none" = "none";

  for (const tsTest of tsTests) {
    if (tsTest.matched) continue;

    const confidence = matchDescriptions(rubyTest.description, tsTest.description);

    if (confidence === "exact") {
      bestMatch = tsTest;
      bestConfidence = confidence;
      break;
    }

    if (
      confidence !== "none" &&
      (bestConfidence === "none" ||
        confidenceRank(confidence) > confidenceRank(bestConfidence))
    ) {
      bestMatch = tsTest;
      bestConfidence = confidence;
    }
  }

  if (bestMatch && bestConfidence !== "none") {
    bestMatch.matched = true;
    return {
      rubyPath: rubyTest.path,
      tsPath: bestMatch.path,
      status: bestMatch.pending ? "stub" : "matched",
      matchConfidence: bestConfidence,
      rubyFile: rubyTest.file,
    };
  }

  return {
    rubyPath: rubyTest.path,
    tsPath: null,
    status: "missing",
    matchConfidence: "none",
    rubyFile: rubyTest.file,
  };
}

function confidenceRank(c: "exact" | "normalized" | "fuzzy" | "none"): number {
  switch (c) {
    case "exact": return 3;
    case "normalized": return 2;
    case "fuzzy": return 1;
    case "none": return 0;
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function generateMarkdown(result: TestComparisonResult): string {
  const lines: string[] = [];

  lines.push("# Rails Test Comparison Report");
  lines.push("");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Rails version: ${result.railsVersion}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Total Ruby tests | ${result.summary.totalRubyTests} |`);
  lines.push(`| Matched (real TS tests) | ${result.summary.matched} |`);
  lines.push(`| Stub (it.skip placeholders) | ${result.summary.stub} |`);
  lines.push(`| Skipped (null overrides) | ${result.summary.skipped} |`);
  lines.push(`| Missing | ${result.summary.missing} |`);
  lines.push(`| Extra (TS only) | ${result.summary.extra} |`);
  lines.push(`| **Real coverage** | **${result.summary.coveragePercent}%** |`);
  lines.push("");

  for (const [pkg, pkgComp] of Object.entries(result.packages)) {
    lines.push(`## ${pkg}`);
    lines.push("");
    lines.push(`Coverage: ${pkgComp.coveragePercent}% real (${pkgComp.matched} matched, ${pkgComp.stub} stub, ${pkgComp.skipped} skipped, ${pkgComp.missing} missing, ${pkgComp.extra} extra)`);
    lines.push("");

    for (const fileComp of pkgComp.files) {
      if (fileComp.tests.length === 0) continue;

      const total = fileComp.matched + fileComp.stub + fileComp.skipped + fileComp.missing;
      const coverage = total > 0 ? Math.round((fileComp.matched / total) * 100) : 0;
      lines.push(`### ${fileComp.rubyFile}`);
      lines.push(`TS target: ${fileComp.tsFile || "unmapped"}`);
      lines.push(`Coverage: ${coverage}% real (${fileComp.matched} matched, ${fileComp.stub} stub, ${fileComp.skipped} skipped, ${fileComp.missing} missing)`);
      lines.push("");

      const missing = fileComp.tests.filter((t) => t.status === "missing");
      const skipped = fileComp.tests.filter((t) => t.status === "skipped");
      const stubs = fileComp.tests.filter((t) => t.status === "stub");
      const matched = fileComp.tests.filter((t) => t.status === "matched");

      if (matched.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Matched (${matched.length})</summary>`);
        lines.push("");
        for (const t of matched) {
          lines.push(`- \`${t.rubyPath}\` → \`${t.tsPath}\` (${t.matchConfidence})`);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (stubs.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Stub / it.skip (${stubs.length})</summary>`);
        lines.push("");
        for (const t of stubs) {
          lines.push(`- \`${t.rubyPath}\` → \`${t.tsPath}\` (${t.matchConfidence})`);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (skipped.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Skipped / null override (${skipped.length})</summary>`);
        lines.push("");
        for (const t of skipped) {
          lines.push(`- \`${t.rubyPath}\``);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (missing.length > 0) {
        lines.push(`**Missing (${missing.length}):**`);
        for (const t of missing) {
          lines.push(`- \`${t.rubyPath}\``);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function printSummary(result: TestComparisonResult) {
  console.log("\n========================================");
  console.log("  Rails Test Comparison Report");
  console.log("========================================\n");

  console.log(`  Total Ruby tests:   ${result.summary.totalRubyTests}`);
  console.log(`  Matched (real):     ${result.summary.matched}`);
  console.log(`  Stub (it.skip):     ${result.summary.stub}`);
  console.log(`  Skipped (nulls):    ${result.summary.skipped}`);
  console.log(`  Missing:            ${result.summary.missing}`);
  console.log(`  Extra (TS only):    ${result.summary.extra}`);
  console.log(`  Real coverage:      ${result.summary.coveragePercent}%`);
  console.log("");

  for (const [pkg, pkgComp] of Object.entries(result.packages)) {
    const total = pkgComp.matched + pkgComp.stub + pkgComp.skipped + pkgComp.missing;
    console.log(`  ${pkg}: ${pkgComp.coveragePercent}% real (${pkgComp.matched} matched, ${pkgComp.stub} stub / ${total} total)`);

    // Per-file breakdown sorted by stub count (highest first)
    const filesWithTests = pkgComp.files
      .filter((f) => f.tests.length > 0)
      .sort((a, b) => (b.stub + b.missing) - (a.stub + a.missing));

    for (const f of filesWithTests) {
      const fTotal = f.matched + f.stub + f.skipped + f.missing;
      const fPct = fTotal > 0 ? Math.round((f.matched / fTotal) * 100) : 0;
      const parts: string[] = [];
      if (f.matched > 0) parts.push(`${f.matched} pass`);
      if (f.stub > 0) parts.push(`${f.stub} stub`);
      if (f.missing > 0) parts.push(`${f.missing} miss`);
      if (f.skipped > 0) parts.push(`${f.skipped} null`);
      const status = f.matched === 0 && f.stub === 0 ? " ✗" : fPct === 100 ? " ✓" : "";
      console.log(`    ${fPct.toString().padStart(3)}% ${f.rubyFile} (${parts.join(", ")})${status}`);
    }
  }

  console.log("\n========================================\n");
}

main();
