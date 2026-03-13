import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

const repoRoot = process.cwd();
const srcPath = path.join(repoRoot, "packages/activemodel/src/activemodel.test.ts");
const src = fs.readFileSync(srcPath, "utf8");

function kebabCase(s: string): string {
  return s
    .replace(/::/g, "/")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function targetForDescribeTitle(title: string): string | null {
  if (title === "Access") return "access.test.ts";

  if (title === "ErrorsTest") return "errors.test.ts";
  if (title === "ErrorTest") return "error.test.ts";
  if (title === "NestedErrorTest") return "nested-error.test.ts";

  if (title.startsWith("Naming")) return "naming.test.ts";
  if (title === "OverridingAccessorsTest") return "naming.test.ts";

  if (title === "DirtyTest") return "dirty.test.ts";

  if (title === "SerializationTest") return "serialization.test.ts";
  if (title === "JsonSerializationTest")
    return path.join("serializers", "json-serialization.test.ts");

  if (title === "ModelTest") return "model.test.ts";

  if (title === "ValidationsTest") return "validations.test.ts";

  if (title === "CallbacksTest") return "callbacks.test.ts";
  if (title === "TranslationTest") return "translation.test.ts";
  if (title === "ConversionTest") return "conversion.test.ts";

  if (title === "AttributeMethodsTest") return "attribute-methods.test.ts";
  if (title === "AttributeRegistrationTest") return "attribute-registration.test.ts";
  if (title === "AttributeAssignmentTest") return "attribute-assignment.test.ts";
  if (title === "AttributesDirtyTest") return "attributes-dirty.test.ts";
  if (title === "AttributeTest") return "attribute.test.ts";
  if (title === "AttributesTest") return "attributes.test.ts";

  if (title === "APITest") return "api.test.ts";

  if (title === "DecimalTest") return path.join("type", "decimal.test.ts");
  if (title === "FloatTest") return path.join("type", "float.test.ts");
  if (title === "RegistryTest") return path.join("type", "registry.test.ts");

  if (title === "ValidatesTest") return path.join("validations", "validates.test.ts");
  if (title === "ValidatesWithTest") return path.join("validations", "with-validation.test.ts");

  if (title.endsWith("ValidationTest")) {
    const base = title.replace(/ValidationTest$/, "");
    return path.join("validations", `${kebabCase(base)}-validation.test.ts`);
  }

  return null;
}

type DescribeCall = { title: string; node: ts.CallExpression };

function findDescribeCalls(sourceFile: ts.SourceFile): DescribeCall[] {
  const describes: DescribeCall[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const isDescribe = ts.isIdentifier(expr)
        ? expr.text === "describe"
        : ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)
          ? expr.expression.text === "describe"
          : false;

      if (isDescribe && node.arguments.length >= 2) {
        const [a0, a1] = node.arguments;
        if (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0)) {
          const title = a0.text;
          if (ts.isArrowFunction(a1) || ts.isFunctionExpression(a1)) {
            describes.push({ title, node });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return describes;
}

const sf = ts.createSourceFile(srcPath, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const describes = findDescribeCalls(sf);

const outer = describes.find((d) => d.title === "ActiveModel");
if (!outer) throw new Error('Could not find outer describe("ActiveModel")');

const outerFn = outer.node.arguments[1];
if (!(ts.isArrowFunction(outerFn) || ts.isFunctionExpression(outerFn))) {
  throw new Error('Outer describe("ActiveModel") second argument is not a function');
}

const outerBlock = ts.isBlock(outerFn.body) ? outerFn.body : null;
if (!outerBlock) throw new Error('Outer describe("ActiveModel") function body is not a block');

const outerStatements = new Set(outerBlock.statements);

function findContainingStatement(node: ts.Node): ts.Statement | null {
  let cur: ts.Node | undefined = node;
  while (cur && !ts.isStatement(cur)) cur = cur.parent;
  return cur && ts.isStatement(cur) ? cur : null;
}

function isDirectChildDescribe(d: DescribeCall): boolean {
  const stmt = findContainingStatement(d.node);
  if (!stmt) return false;
  return outerStatements.has(stmt);
}

type Extracted = { title: string; target: string; start: number; end: number; text: string };

const extracted: Extracted[] = [];
for (const d of describes) {
  if (d === outer) continue;
  const target = targetForDescribeTitle(d.title);
  if (!target) continue;
  if (!isDirectChildDescribe(d)) continue;

  const stmt = findContainingStatement(d.node);
  if (!stmt) continue;

  extracted.push({
    title: d.title,
    target,
    start: stmt.getFullStart(),
    end: stmt.getEnd(),
    text: src.slice(stmt.getFullStart(), stmt.getEnd()).trimEnd() + "\n\n",
  });
}

if (extracted.length === 0) throw new Error("No describe blocks extracted");

extracted.sort((a, b) => a.start - b.start);

const byTarget = new Map<string, string[]>();
for (const ex of extracted) {
  const list = byTarget.get(ex.target) ?? [];
  list.push(ex.text);
  byTarget.set(ex.target, list);
}

function importPrefixForTarget(target: string): string {
  const depth = target.split(path.sep).length - 1;
  return "../".repeat(depth);
}

function fileHeaderForTarget(target: string): string {
  const prefix = importPrefixForTarget(target);
  return [
    'import { describe, it, expect } from "vitest";',
    `import { Model, Errors, Types, NestedError } from "${prefix}index.js";`,
    `import { ModelName } from "${prefix}naming.js";`,
    `import { CallbackChain } from "${prefix}callbacks.js";`,
    "",
    'describe("ActiveModel", () => {',
  ].join("\n");
}

function fileFooter(): string {
  return "});\n";
}

for (const [target, chunks] of byTarget.entries()) {
  const outPath = path.join(repoRoot, "packages/activemodel/src", target);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const content = fileHeaderForTarget(target) + "\n" + chunks.join("") + fileFooter();
  fs.writeFileSync(outPath, content);
}

let leftover = src;
for (const ex of [...extracted].sort((a, b) => b.start - a.start)) {
  leftover = leftover.slice(0, ex.start) + leftover.slice(ex.end);
}

const miscPath = path.join(repoRoot, "packages/activemodel/src/misc.test.ts");
fs.writeFileSync(miscPath, leftover);
fs.unlinkSync(srcPath);

console.log(
  `Extracted ${extracted.length} blocks into ${byTarget.size} files; wrote leftover to misc.test.ts`,
);
