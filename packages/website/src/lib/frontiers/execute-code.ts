/**
 * Code execution for the sandbox — transforms user TS code and runs it
 * via new Function() with injected @blazetrails globals.
 *
 * Extracted from sandbox-sw.ts so it can be tested without SW globals.
 */

import { stripTypes } from "./transpiler.js";
import type { MigrationProxy } from "@blazetrails/activerecord/migration";
import type { DatabaseAdapter } from "@blazetrails/activerecord/adapter";

/**
 * Strip import/export declarations so code can run inside new Function().
 * The imports are unnecessary because all @blazetrails globals are injected
 * as function parameters. Exports are converted to plain declarations.
 */
export function prepareCodeForEval(code: string): string {
  // Remove import statements including multi-line named imports
  code = code.replace(
    /^\s*import\s+(?:type\s+)?(?:\{[\s\S]*?\}|[\w*]+(?:\s*,\s*\{[\s\S]*?\})?)\s+from\s+["'][^"']+["']\s*;?\s*$/gm,
    "",
  );
  code = code.replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "");

  // Remove export lists and re-exports
  code = code.replace(/^\s*export\s+\{[\s\S]*?\}\s*(?:from\s+["'][^"']+["'])?\s*;?\s*$/gm, "");
  code = code.replace(/^\s*export\s+\*\s+from\s+["'][^"']+["']\s*;?\s*$/gm, "");

  // Convert `export class` / `export function` / `export const` to plain declarations
  code = code.replace(
    /^\s*export\s+(default\s+)?(class|function|const|let|var|async\s+function)\s/gm,
    "$2 ",
  );
  return code;
}

export interface ExecuteCodeDeps {
  Base: unknown;
  Migration: unknown;
  MigrationRunner: unknown;
  Migrator: unknown;
  Schema: unknown;
  ActionController: unknown;
  adapter: DatabaseAdapter;
  appServer: unknown;
  registerMigration: (proxy: MigrationProxy) => void;
}

/**
 * Execute user code in a sandboxed new Function() with injected globals.
 * Strips TypeScript types and import/export statements.
 * Auto-registers Migration subclasses found in the code.
 */
export async function executeCode(code: string, deps: ExecuteCodeDeps): Promise<unknown> {
  let prepared = prepareCodeForEval(stripTypes(code));

  // Auto-register Migration subclasses defined in the code.
  const migrationClasses = [...prepared.matchAll(/class\s+(\w+)\s+extends\s+Migration\b/g)];
  for (const match of migrationClasses) {
    const className = match[1];
    prepared += `\nif (typeof ${className} !== "undefined" && ${className}.version) {
      registerMigration({
        version: ${className}.version,
        name: ${className}.name,
        filename: "",
        migration: () => { const m = new ${className}(); m.adapter = adapter; return m; },
      });
    }\n`;
  }

  const fn = new Function(
    "Base",
    "Migration",
    "MigrationRunner",
    "Migrator",
    "Schema",
    "ActionController",
    "adapter",
    "app",
    "registerMigration",
    `return (async () => { ${prepared} })();`,
  );
  return fn(
    deps.Base,
    deps.Migration,
    deps.MigrationRunner,
    deps.Migrator,
    deps.Schema,
    deps.ActionController,
    deps.adapter,
    deps.appServer,
    deps.registerMigration,
  );
}
