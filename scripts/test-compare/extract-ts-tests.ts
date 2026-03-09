#!/usr/bin/env npx tsx
/**
 * Extracts test metadata from our TypeScript test files.
 * Uses the TypeScript Compiler API to parse describe/it blocks.
 * Outputs output/ts-tests.json
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import type { TestManifest, TestPackageInfo, TestFileInfo, TestCaseInfo } from "./types.js";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

/** Maps package names to their test files */
const PACKAGE_TEST_FILES: Record<string, string[]> = {
  arel: ["packages/arel/src/arel.test.ts"],
  activemodel: ["packages/activemodel/src/activemodel.test.ts"],
  activesupport: [
    "packages/activesupport/src/activesupport.test.ts",
    "packages/activesupport/src/callbacks.test.ts",
    "packages/activesupport/src/concern.test.ts",
    "packages/activesupport/src/class-attribute.test.ts",
    "packages/activesupport/src/collections.test.ts",
    "packages/activesupport/src/logger.test.ts",
    "packages/activesupport/src/cache.test.ts",
    "packages/activesupport/src/deprecation.test.ts",
    "packages/activesupport/src/time-ext.test.ts",
    "packages/activesupport/src/time-date-ext.test.ts",
    "packages/activesupport/src/security.test.ts",
    "packages/activesupport/src/hwia-extended.test.ts",
    "packages/activesupport/src/enumerable-extended.test.ts",
    "packages/activesupport/src/module-ext.test.ts",
    "packages/activesupport/src/hash-ext.test.ts",
    "packages/activesupport/src/duration.test.ts",
    "packages/activesupport/src/hwia-module-string.test.ts",
    "packages/activesupport/src/multibyte-assertions.test.ts",
    "packages/activesupport/src/notifications.test.ts",
    "packages/activesupport/src/string-inquirer.test.ts",
    "packages/activesupport/src/array-inquirer.test.ts",
    "packages/activesupport/src/try.test.ts",
    "packages/activesupport/src/ordered-options.test.ts",
    "packages/activesupport/src/number-helper.test.ts",
    "packages/activesupport/src/lazy-load-hooks.test.ts",
    "packages/activesupport/src/module-ext.test.ts",
    "packages/activesupport/src/parameter-filter.test.ts",
    "packages/activesupport/src/safe-buffer.test.ts",
    "packages/activesupport/src/key-generator.test.ts",
    "packages/activesupport/src/ordered-hash.test.ts",
    "packages/activesupport/src/error-reporter.test.ts",
    "packages/activesupport/src/testing-helpers.test.ts",
    "packages/activesupport/src/range-ext.test.ts",
    "packages/activesupport/src/json-encoding.test.ts",
  ],
  activerecord: [
    "packages/activerecord/src/encryption.test.ts",
    "packages/activerecord/src/secure-password.test.ts",
    "packages/activerecord/src/delegate.test.ts",
    "packages/activerecord/src/validations/validations.test.ts",
    "packages/activerecord/src/aggregations.test.ts",
    "packages/activerecord/src/associations/belongs-to.test.ts",
    "packages/activerecord/src/associations/bidirectional-destroy.test.ts",
    "packages/activerecord/src/associations/callbacks.test.ts",
    "packages/activerecord/src/associations/cascaded-eager-loading.test.ts",
    "packages/activerecord/src/associations/eager.test.ts",
    "packages/activerecord/src/associations/extensions.test.ts",
    "packages/activerecord/src/associations/habtm.test.ts",
    "packages/activerecord/src/associations/has-many.test.ts",
    "packages/activerecord/src/associations/has-many-through.test.ts",
    "packages/activerecord/src/associations/has-one-async.test.ts",
    "packages/activerecord/src/associations/inner-join.test.ts",
    "packages/activerecord/src/associations/inverse-automatic.test.ts",
    "packages/activerecord/src/associations/inverse-belongs-to.test.ts",
    "packages/activerecord/src/associations/inverse-has-many.test.ts",
    "packages/activerecord/src/associations/inverse-has-one.test.ts",
    "packages/activerecord/src/associations/inverse-polymorphic-belongs-to.test.ts",
    "packages/activerecord/src/associations/inverse.test.ts",
    "packages/activerecord/src/associations/left-outer-join.test.ts",
    "packages/activerecord/src/associations/overriding.test.ts",
    "packages/activerecord/src/associations/proxy.test.ts",
    "packages/activerecord/src/associations/reload-cache.test.ts",
    "packages/activerecord/src/associations/required.test.ts",
    "packages/activerecord/src/associations-extra.test.ts",
    "packages/activerecord/src/attribute-methods.test.ts",
    "packages/activerecord/src/autosave-association.test.ts",
    "packages/activerecord/src/base.test.ts",
    "packages/activerecord/src/batches.test.ts",
    "packages/activerecord/src/boolean.test.ts",
    "packages/activerecord/src/cache-key.test.ts",
    "packages/activerecord/src/calculations.test.ts",
    "packages/activerecord/src/callbacks.test.ts",
    "packages/activerecord/src/clone.test.ts",
    "packages/activerecord/src/comment.test.ts",
    "packages/activerecord/src/composite-primary-key.test.ts",
    "packages/activerecord/src/core.test.ts",
    "packages/activerecord/src/counter-cache.test.ts",
    "packages/activerecord/src/custom-properties.test.ts",
    "packages/activerecord/src/defaults.test.ts",
    "packages/activerecord/src/delegated-type.test.ts",
    "packages/activerecord/src/delegation-caching.test.ts",
    "packages/activerecord/src/dirty.test.ts",
    "packages/activerecord/src/dup.test.ts",
    "packages/activerecord/src/enum.test.ts",
    "packages/activerecord/src/errors.test.ts",
    "packages/activerecord/src/excluding.test.ts",
    "packages/activerecord/src/explain.test.ts",
    "packages/activerecord/src/finder.test.ts",
    "packages/activerecord/src/generated-methods.test.ts",
    "packages/activerecord/src/inheritance.test.ts",
    "packages/activerecord/src/insert-all.test.ts",
    "packages/activerecord/src/instrumentation.test.ts",
    "packages/activerecord/src/json-serialization.test.ts",
    "packages/activerecord/src/locking/custom.test.ts",
    "packages/activerecord/src/locking/optimistic.test.ts",
    "packages/activerecord/src/locking/pessimistic.test.ts",
    "packages/activerecord/src/migration/bulk-alter-table.test.ts",
    "packages/activerecord/src/migration/copy.test.ts",
    "packages/activerecord/src/migration/index.test.ts",
    "packages/activerecord/src/migration/invertible.test.ts",
    "packages/activerecord/src/migration/reserved-words.test.ts",
    "packages/activerecord/src/modules.test.ts",
    "packages/activerecord/src/nested-attributes.test.ts",
    "packages/activerecord/src/normalized-attribute.test.ts",
    "packages/activerecord/src/null-relation.test.ts",
    "packages/activerecord/src/ordered-options.test.ts",
    "packages/activerecord/src/persistence.test.ts",
    "packages/activerecord/src/preloader.test.ts",
    "packages/activerecord/src/primary-keys.test.ts",
    "packages/activerecord/src/query-constraints.test.ts",
    "packages/activerecord/src/querying-methods-delegation.test.ts",
    "packages/activerecord/src/readonly.test.ts",
    "packages/activerecord/src/reflection.test.ts",
    "packages/activerecord/src/relation.test.ts",
    "packages/activerecord/src/relation/and.test.ts",
    "packages/activerecord/src/relation/annotations.test.ts",
    "packages/activerecord/src/relation/delete-all.test.ts",
    "packages/activerecord/src/relation/field-ordered-values.test.ts",
    "packages/activerecord/src/relation/merging.test.ts",
    "packages/activerecord/src/relation/mutation.test.ts",
    "packages/activerecord/src/relation/or.test.ts",
    "packages/activerecord/src/relation/order.test.ts",
    "packages/activerecord/src/relation/select.test.ts",
    "packages/activerecord/src/relation/structural-compatibility.test.ts",
    "packages/activerecord/src/relation/update-all.test.ts",
    "packages/activerecord/src/relation/where-chain.test.ts",
    "packages/activerecord/src/relation/where-clause.test.ts",
    "packages/activerecord/src/relation/where.test.ts",
    "packages/activerecord/src/relation/with.test.ts",
    "packages/activerecord/src/relations-extra.test.ts",
    "packages/activerecord/src/sanitize.test.ts",
    "packages/activerecord/src/schema.test.ts",
    "packages/activerecord/src/scoping/default-scoping.test.ts",
    "packages/activerecord/src/scoping/habtm-scoping.test.ts",
    "packages/activerecord/src/scoping/has-many-scoping.test.ts",
    "packages/activerecord/src/scoping/named-scoping.test.ts",
    "packages/activerecord/src/scoping/relation-scoping.test.ts",
    "packages/activerecord/src/secure-token.test.ts",
    "packages/activerecord/src/serialization.test.ts",
    "packages/activerecord/src/serialized-attribute.test.ts",
    "packages/activerecord/src/signed-id.test.ts",
    "packages/activerecord/src/store.test.ts",
    "packages/activerecord/src/strict-loading.test.ts",
    "packages/activerecord/src/suppressor.test.ts",
    "packages/activerecord/src/time-travel.test.ts",
    "packages/activerecord/src/timestamp.test.ts",
    "packages/activerecord/src/token-for.test.ts",
    "packages/activerecord/src/touch-later.test.ts",
    "packages/activerecord/src/transaction-callbacks.test.ts",
    "packages/activerecord/src/transactions.test.ts",
    "packages/activerecord/src/validations.test.ts",
    "packages/activerecord/src/validations/absence.test.ts",
    "packages/activerecord/src/validations/association.test.ts",
    "packages/activerecord/src/validations/length.test.ts",
    "packages/activerecord/src/validations/numericality.test.ts",
    "packages/activerecord/src/validations/presence.test.ts",
    "packages/activerecord/src/validations/uniqueness.test.ts",
    "packages/activerecord/src/associations.test.ts",
    "packages/activerecord/src/relations.test.ts",
    "packages/activerecord/src/base-extended.test.ts",
    "packages/activerecord/src/sti.test.ts",
    "packages/activerecord/src/autosave.test.ts",
    "packages/activerecord/src/migration.test.ts",
    "packages/activerecord/src/serialized-extended.test.ts",
    "packages/activerecord/src/eager-hmthrough.test.ts",
    "packages/activerecord/src/has-many-extended.test.ts",
    "packages/activerecord/src/has-one-habtm.test.ts",
    "packages/activerecord/src/belongs-to-extended.test.ts",
    "packages/activerecord/src/calculations-finder-basics.test.ts",
    "packages/activerecord/src/reflection-migration.test.ts",
    "packages/activerecord/src/adapters/sqlite-adapter.test.ts",
    "packages/activerecord/src/adapters/postgres-adapter.test.ts",
    "packages/activerecord/src/adapters/mysql-adapter.test.ts",
  ],
  rack: [
    "packages/rack/src/auth_basic.test.ts",
    "packages/rack/src/body_proxy.test.ts",
    "packages/rack/src/builder.test.ts",
    "packages/rack/src/cascade.test.ts",
    "packages/rack/src/common_logger.test.ts",
    "packages/rack/src/conditional_get.test.ts",
    "packages/rack/src/config.test.ts",
    "packages/rack/src/content_length.test.ts",
    "packages/rack/src/content_type.test.ts",
    "packages/rack/src/deflater.test.ts",
    "packages/rack/src/directory.test.ts",
    "packages/rack/src/etag.test.ts",
    "packages/rack/src/files.test.ts",
    "packages/rack/src/head.test.ts",
    "packages/rack/src/lint.test.ts",
    "packages/rack/src/lock.test.ts",
    "packages/rack/src/media_type.test.ts",
    "packages/rack/src/method_override.test.ts",
    "packages/rack/src/mime.test.ts",
    "packages/rack/src/mock_request.test.ts",
    "packages/rack/src/mock_response.test.ts",
    "packages/rack/src/multipart.test.ts",
    "packages/rack/src/null_logger.test.ts",
    "packages/rack/src/query_parser.test.ts",
    "packages/rack/src/recursive.test.ts",
    "packages/rack/src/request.test.ts",
    "packages/rack/src/response.test.ts",
    "packages/rack/src/rewindable_input.test.ts",
    "packages/rack/src/runtime.test.ts",
    "packages/rack/src/sendfile.test.ts",
    "packages/rack/src/show_exceptions.test.ts",
    "packages/rack/src/show_status.test.ts",
    "packages/rack/src/static.test.ts",
    "packages/rack/src/tempfile_reaper.test.ts",
    "packages/rack/src/urlmap.test.ts",
    "packages/rack/src/utils.test.ts",
    "packages/rack/src/version.test.ts",
    "packages/rack/src/headers.test.ts",
    "packages/rack/src/events.test.ts",
    "packages/rack/src/logger.test.ts",
  ],
  actiondispatch: [
    "packages/actionpack/src/actiondispatch/routing/routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/resource-routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/controller-routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/route-helpers.test.ts",
    "packages/actionpack/src/actiondispatch/request.test.ts",
    "packages/actionpack/src/actiondispatch/response.test.ts",
    "packages/actionpack/src/actiondispatch/parameters.test.ts",
    "packages/actionpack/src/actiondispatch/url-for.test.ts",
    "packages/actionpack/src/actiondispatch/cookies.test.ts",
    "packages/actionpack/src/actiondispatch/middleware/ssl.test.ts",
    "packages/actionpack/src/actiondispatch/middleware/host-authorization.test.ts",
    "packages/actionpack/src/actiondispatch/middleware/stack.test.ts",
    "packages/actionpack/src/actiondispatch/mime-type.test.ts",
    "packages/actionpack/src/actiondispatch/content-security-policy.test.ts",
    "packages/actionpack/src/actiondispatch/redirect.test.ts",
    "packages/actionpack/src/actiondispatch/flash.test.ts",
    "packages/actionpack/src/actiondispatch/middleware/static.test.ts",
    "packages/actionpack/src/actiondispatch/request-forgery-protection.test.ts",
    "packages/actionpack/src/actiondispatch/respond-to.test.ts",
    "packages/actionpack/src/actiondispatch/permissions-policy.test.ts",
    "packages/actionpack/src/actiondispatch/uploaded-file.test.ts",
    "packages/actionpack/src/actiondispatch/middleware/request-id.test.ts",
    "packages/actionpack/src/actiondispatch/http-authentication.test.ts",
    "packages/actionpack/src/actiondispatch/exception-wrapper.test.ts",
  ],
  actioncontroller: [
    "packages/actionpack/src/actioncontroller/abstract-controller.test.ts",
    "packages/actionpack/src/actioncontroller/metal.test.ts",
    "packages/actionpack/src/actioncontroller/base.test.ts",
    "packages/actionpack/src/actioncontroller/filters.test.ts",
    "packages/actionpack/src/actioncontroller/rendering.test.ts",
    "packages/actionpack/src/actioncontroller/redirect.test.ts",
    "packages/actionpack/src/actioncontroller/caching.test.ts",
    "packages/actionpack/src/actioncontroller/rescue.test.ts",
    "packages/actionpack/src/actioncontroller/test-case.test.ts",
    "packages/actionpack/src/actioncontroller/integration-test.test.ts",
    "packages/actionpack/src/actioncontroller/params-wrapper.test.ts",
    "packages/actionpack/src/actioncontroller/template-rendering.test.ts",
    "packages/actionpack/src/actionview/actionview.test.ts",
    // Shared test files also relevant to controller/ Ruby tests
    "packages/actionpack/src/actiondispatch/parameters.test.ts",
    "packages/actionpack/src/actiondispatch/routing/routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/resource-routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/controller-routing.test.ts",
    "packages/actionpack/src/actiondispatch/routing/route-helpers.test.ts",
    "packages/actionpack/src/actiondispatch/url-for.test.ts",
    "packages/actionpack/src/actiondispatch/flash.test.ts",
    "packages/actionpack/src/actiondispatch/redirect.test.ts",
    "packages/actionpack/src/actiondispatch/request-forgery-protection.test.ts",
    "packages/actionpack/src/actiondispatch/respond-to.test.ts",
    "packages/actionpack/src/actiondispatch/http-authentication.test.ts",
  ],
};

function main() {
  const manifest: TestManifest = {
    source: "typescript",
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  for (const [pkg, files] of Object.entries(PACKAGE_TEST_FILES)) {
    const absoluteFiles = files.map((f) => path.join(ROOT_DIR, f));
    manifest.packages[pkg] = extractPackageTests(pkg, absoluteFiles);
  }

  // Print summary
  for (const [pkg, data] of Object.entries(manifest.packages)) {
    console.log(`  ${pkg}: ${data.files.length} files, ${data.totalTests} tests`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "ts-tests.json");
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWritten to ${outputPath}`);
}

function extractPackageTests(pkgName: string, files: string[]): TestPackageInfo {
  const testFiles: TestFileInfo[] = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  Warning: ${filePath} not found, skipping`);
      continue;
    }

    const sourceText = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );

    const relPath = path.relative(ROOT_DIR, filePath);
    const testCases: TestCaseInfo[] = [];
    const describeStack: string[] = [];

    visitNode(sourceFile, sourceFile, describeStack, testCases, relPath);

    if (testCases.length > 0) {
      const className = path.basename(filePath, ".test.ts");
      testFiles.push({
        file: relPath,
        className,
        testCases,
        testCount: testCases.length,
      });
    }
  }

  const totalTests = testFiles.reduce((sum, f) => sum + f.testCount, 0);

  return {
    files: testFiles,
    totalTests,
  };
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  describeStack: string[],
  testCases: TestCaseInfo[],
  relPath: string,
) {
  if (ts.isCallExpression(node)) {
    const callInfo = parseTestCall(node, sourceFile);

    if (callInfo) {
      if (callInfo.type === "describe") {
        describeStack.push(callInfo.description);

        // Visit children inside the describe block
        const callback = getCallbackArg(node);
        if (callback) {
          ts.forEachChild(callback, (child) => {
            visitNode(child, sourceFile, describeStack, testCases, relPath);
          });
        }

        describeStack.pop();
        return; // Don't visit children again
      }

      if (callInfo.type === "it" || callInfo.type === "it.skip") {
        const ancestors = [...describeStack];
        const testPath = [...ancestors, callInfo.description].join(" > ");
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const assertions = extractExpectMatchers(node, sourceFile);

        testCases.push({
          path: testPath,
          description: callInfo.description,
          ancestors,
          file: relPath,
          line,
          style: "it",
          assertions,
          pending: callInfo.type === "it.skip",
        });
        return;
      }
    }
  }

  // For ExpressionStatements, check the inner expression
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
    visitNode(node.expression, sourceFile, describeStack, testCases, relPath);
    return;
  }

  ts.forEachChild(node, (child) => {
    visitNode(child, sourceFile, describeStack, testCases, relPath);
  });
}

interface TestCallInfo {
  type: "describe" | "it" | "it.skip";
  description: string;
}

function parseTestCall(node: ts.CallExpression, sourceFile: ts.SourceFile): TestCallInfo | null {
  const expr = node.expression;

  // describe("...", () => {})
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (name === "describe" || name === "describeIfPg" || name === "describeIfMysql") {
      const desc = getFirstStringArg(node);
      if (desc) return { type: "describe", description: desc };
    }
    if (name === "it" || name === "test") {
      const desc = getFirstStringArg(node);
      if (desc) return { type: "it", description: desc };
    }
  }

  // it.skip("...", () => {}) or describe.skip(...)
  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression;
    const prop = expr.name.text;

    if (ts.isIdentifier(obj)) {
      if (obj.text === "it" && prop === "skip") {
        const desc = getFirstStringArg(node);
        if (desc) return { type: "it.skip", description: desc };
      }
      if (obj.text === "describe" && prop === "skip") {
        const desc = getFirstStringArg(node);
        if (desc) return { type: "describe", description: desc };
      }
      if (obj.text === "it" && prop === "todo") {
        const desc = getFirstStringArg(node);
        if (desc) return { type: "it.skip", description: desc };
      }
    }
  }

  return null;
}

function getFirstStringArg(node: ts.CallExpression): string | null {
  if (node.arguments.length === 0) return null;
  const first = node.arguments[0];

  if (ts.isStringLiteral(first)) return first.text;
  if (ts.isNoSubstitutionTemplateLiteral(first)) return first.text;
  if (ts.isTemplateExpression(first)) {
    // For template literals, just use the head text
    return first.head.text + "...";
  }

  return null;
}

function getCallbackArg(node: ts.CallExpression): ts.Node | null {
  for (const arg of node.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      return arg.body;
    }
  }
  return null;
}

function extractExpectMatchers(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const matchers: string[] = [];
  findExpectMatchers(node, matchers);
  return [...new Set(matchers)];
}

function findExpectMatchers(node: ts.Node, results: string[]) {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    // expect(...).toXxx()
    if (ts.isPropertyAccessExpression(expr)) {
      const matcherName = expr.name.text;
      if (matcherName.startsWith("to") || matcherName.startsWith("not")) {
        // Check if the object is an expect() call or chained .not
        if (isExpectChain(expr.expression)) {
          results.push(matcherName);
        }
      }
    }
  }

  ts.forEachChild(node, (child) => findExpectMatchers(child, results));
}

function isExpectChain(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.text === "expect") return true;
    if (ts.isPropertyAccessExpression(expr)) {
      return isExpectChain(expr.expression);
    }
  }
  if (ts.isPropertyAccessExpression(node)) {
    // .not, .resolves, .rejects
    if (node.name.text === "not" || node.name.text === "resolves" || node.name.text === "rejects") {
      return isExpectChain(node.expression);
    }
  }
  return false;
}

main();
