import * as ts from "typescript/unstable/ast";
import { ScriptKind } from "typescript/unstable/sync";
import { tsApi } from "@blazetrails/activerecord/type-virtualization/ts-api.js";

const AR_REQUIRED_OPTIONS: ReadonlyArray<readonly [string, unknown]> = [
  ["target", "ES2022"],
  ["module", "Node16"],
  ["moduleResolution", "Node16"],
  ["strict", true],
  ["esModuleInterop", true],
  ["skipLibCheck", true],
];

const AR_REQUIRED_INCLUDES = ["app/models/**/*.ts", "db/migrate/**/*.ts"] as const;

const TRAILS_TSC_PLUGIN = "@blazetrails/trails-tsc/ts-plugin";

export const FRESH_TSCONFIG =
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "dist",
        rootDir: ".",
        plugins: [{ name: TRAILS_TSC_PLUGIN }],
      },
      include: ["./**/*.ts", "app/models/**/*.ts", "db/migrate/**/*.ts"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2,
  ) + "\n";

export interface TsconfigConflict {
  key: string;
  existing: unknown;
  required: unknown;
}

export interface TsconfigMergeResult {
  content: string;
  added: string[];
  conflicts: TsconfigConflict[];
  pluginAdded: boolean;
  includesAppended: string[];
  changed: boolean;
}

function parseJsonc(text: string): unknown {
  const sf = tsApi().createSourceFile("/tsconfig.json", text, { scriptKind: ScriptKind.JSON });
  const [stmt, ...rest] = sf.statements;
  if (!stmt || rest.length > 0 || !ts.isExpressionStatement(stmt)) {
    throw new SyntaxError("tsconfig.json parse error: expected a single JSON value");
  }
  return convertToObject(stmt.expression);
}

function convertToObject(node: ts.Expression): unknown {
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(convertToObject);
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.name)) {
        throw new SyntaxError("tsconfig.json parse error: property name must be a string");
      }
      result[prop.name.text] = convertToObject(prop.initializer);
    }
    return result;
  }
  throw new SyntaxError(
    `tsconfig.json parse error: unexpected ${ts.SyntaxKind[node.kind]} at position ${node.pos}`,
  );
}

export function mergeTsconfig(existingText: string): TsconfigMergeResult {
  const cfg = parseJsonc(existingText) as {
    compilerOptions?: Record<string, unknown>;
    include?: string[];
    exclude?: string[];
    [k: string]: unknown;
  };

  if (!cfg.compilerOptions) cfg.compilerOptions = {};

  const added: string[] = [];
  const conflicts: TsconfigConflict[] = [];

  for (const [key, required] of AR_REQUIRED_OPTIONS) {
    if (!Object.prototype.hasOwnProperty.call(cfg.compilerOptions, key)) {
      cfg.compilerOptions[key] = required;
      added.push(key);
    } else if (cfg.compilerOptions[key] !== required) {
      conflicts.push({ key, existing: cfg.compilerOptions[key], required });
    }
  }

  let pluginAdded = false;
  const plugins = cfg.compilerOptions["plugins"];
  if (!Array.isArray(plugins)) {
    cfg.compilerOptions["plugins"] = [{ name: TRAILS_TSC_PLUGIN }];
    pluginAdded = true;
  } else {
    const hasPlugin = (plugins as { name?: unknown }[]).some((p) => p.name === TRAILS_TSC_PLUGIN);
    if (!hasPlugin) {
      (plugins as { name: string }[]).push({ name: TRAILS_TSC_PLUGIN });
      pluginAdded = true;
    }
  }

  const includesAppended: string[] = [];
  if (!Array.isArray(cfg.include)) {
    cfg.include = [...AR_REQUIRED_INCLUDES];
    includesAppended.push(...AR_REQUIRED_INCLUDES);
  } else {
    for (const glob of AR_REQUIRED_INCLUDES) {
      if (!cfg.include.includes(glob)) {
        cfg.include.push(glob);
        includesAppended.push(glob);
      }
    }
  }

  const changed = added.length > 0 || pluginAdded || includesAppended.length > 0;
  const content = changed ? JSON.stringify(cfg, null, 2) + "\n" : existingText;
  return { content, added, conflicts, pluginAdded, includesAppended, changed };
}
