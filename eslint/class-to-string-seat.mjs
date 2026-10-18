/**
 * ESLint rule: class-to-string-seat
 *
 * Ruby interpolates a class as its name: `"#{klass}"` calls `Module#to_s`,
 * `rb_mod_to_s` (vendor/ruby/v3.3.11/object.c:1710-1742), which answers
 * `rb_class_name`. A JS template literal calls `ToString` on its operand, and
 * for a class that is `Function.prototype.toString`, the class's SOURCE TEXT.
 * So a port of `"#{klass}"` written `` `${klass}` `` prints the class body.
 *
 * The seat is a literal on the class itself:
 *
 *   static toString(): string {
 *     return "ActiveJob::Base";
 *   }
 *
 * and this rule writes and keeps that literal. The name is the Ruby constant
 * path the class was declared under, read from the `classPaths` table of
 * `eslint/rails-file-structure-method-order.json` (built from rails-api.json
 * by scripts/build-rails-file-structure-manifest.ts). It is not derived from
 * the trails file path: core_ext reopens (`Integer`), directories that are not
 * namespaces (`values/time_zone.rb` → `ActiveSupport::TimeZone`) and classes
 * nested in a class (`Fanout::Subscribers::Evented`) all break a path rule. A
 * class the Ruby extract has no declaration for gets no seat.
 *
 * In an enrolled file, for each top-level class named in that table:
 *   - a missing `static toString` is inserted as the class's first member;
 *   - a `static toString` whose body is `return "<string>";` with the wrong
 *     string is rewritten;
 *   - any other `static toString` body is reported and not fixed, since a
 *     hand-written port of a Ruby `def self.to_s` has to be read by a person.
 *
 * SUBCLASSES. A static method is inherited, so a subclass with no seat of its
 * own renders its parent's literal. Every class in an enrolled file gets its
 * own seat here, and the trailties job/model generators emit one for the
 * application classes they write. A subclass written by hand with no seat
 * renders its parent's name: a known gap.
 *
 * Scoped to Rails-matched source: test files are not enrolled, and a file
 * carrying a file-level `@noRailsEquivalent` receipt is skipped. Like
 * rails-file-structure-method-order, the rule is registered only when the
 * manifest holds data, i.e. after `pnpm parity:api`.
 *
 * ENROLLMENT is per package, in the `files` list of the rule's block in
 * eslint.config.mjs. That set is ONLY-GROW: a package joins with its own
 * `lint --fix` sweep, and no package is ever removed to turn a red run green.
 */
import * as path from "path";
import { fileURLToPath } from "url";
import { loadManifest } from "./rails-file-structure-method-order.mjs";
import { hasFileLevelReceipt } from "./unbacked-internal-needs-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isStaticToString(member) {
  return (
    member.type === "MethodDefinition" &&
    member.static &&
    !member.computed &&
    member.key.type === "Identifier" &&
    member.key.name === "toString"
  );
}

function returnedString(method) {
  const body = method.value.body?.body;
  if (!body || body.length !== 1) return undefined;
  const [stmt] = body;
  if (stmt.type !== "ReturnStatement" || stmt.argument?.type !== "Literal") return undefined;
  return typeof stmt.argument.value === "string" ? stmt.argument : undefined;
}

export default {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "A class answers JS ToString with its Ruby Module#to_s." },
    schema: [{ type: "object", properties: { manifest: { type: "object" } } }],
    messages: {
      missing: "`{{name}}` has no `static toString()` seat; Ruby renders it as `{{path}}`.",
      stale:
        "`{{name}}`'s `static toString()` answers `{{actual}}`; Ruby renders it as `{{path}}`.",
      handWritten:
        '`{{name}}`\'s `static toString()` is not `return "{{path}}";` — read it against the Ruby `to_s`.',
    },
  },
  create(context) {
    const manifest = context.options[0]?.manifest ?? loadManifest();
    const rel = path.relative(ROOT, context.filename).split(path.sep).join("/");
    const classPaths = manifest.files?.[rel]?.classPaths;
    if (!classPaths) return {};
    const sourceCode = context.sourceCode;
    if (hasFileLevelReceipt(sourceCode)) return {};

    const check = (node) => {
      const name = node.id?.name;
      if (!name || !Object.hasOwn(classPaths, name)) return;
      const rubyPath = classPaths[name];
      const seat = node.body.body.find(isStaticToString);
      const data = { name, path: rubyPath };
      if (!seat) {
        const statement = node.parent.type === "Program" ? node : node.parent;
        const indent = " ".repeat(statement.loc.start.column + 2);
        context.report({
          node: node.id,
          messageId: "missing",
          data,
          fix: (fixer) =>
            fixer.insertTextAfterRange(
              [node.body.range[0], node.body.range[0] + 1],
              `\n${indent}static toString(): string {\n${indent}  return ${JSON.stringify(rubyPath)};\n${indent}}\n`,
            ),
        });
        return;
      }
      const literal = returnedString(seat);
      if (!literal) {
        context.report({ node: seat, messageId: "handWritten", data });
        return;
      }
      if (literal.value === rubyPath) return;
      context.report({
        node: literal,
        messageId: "stale",
        data: { ...data, actual: literal.value },
        fix: (fixer) => fixer.replaceText(literal, JSON.stringify(rubyPath)),
      });
    };

    return {
      "Program > ClassDeclaration": check,
      "Program > ExportNamedDeclaration > ClassDeclaration": check,
      "Program > ExportDefaultDeclaration > ClassDeclaration": check,
    };
  },
};
