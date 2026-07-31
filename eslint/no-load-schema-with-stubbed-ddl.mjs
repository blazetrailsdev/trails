/**
 * ESLint rule: no-load-schema-with-stubbed-ddl
 *
 * `loadSchema` (support/load-schema-helper.ts) runs the canonical half first
 * and then the adapter-specific arm. A cover that intercepts a DDL emitter to
 * capture the SQL it would have run never lays anything on the shared per-worker
 * database, so the canonical half queries tables that were never created and
 * dies with
 * `StatementInvalid: relation "…" does not exist`. Such covers must call
 * `loadAdapterSpecificSchema` directly — the carve-out its docstring already
 * describes in prose.
 *
 * PR #5676 rerouted `load-schema-helper-uuid-default.trails.test.ts` through
 * `loadSchema` exactly that way. Nothing caught it: the file is
 * `describeIfPg`-gated, so the break was PG-lane-only and surfaced only in a
 * ~500s CI shard, and the file is allowlisted out of
 * `no-internal-canonical-loaders` (it is one of load-schema-helper's own
 * self-tests, so importing `loadSchema` there is not banned outright).
 *
 * This rule closes that hole lexically, in the unit lane: in a test file that
 * stubs any of `STUBBED_DDL_METHODS`, any reference to `loadSchema` is an
 * error.
 *
 * It also carries the one interception shape the runtime guard cannot see at
 * all — a cover that defines the emitter in a *class body*, either as a
 * subclass override (`class Probe extends BetterSQLite3Adapter { override async
 * createTable() {} }`) or as a standalone fake. The guard walks the prototype
 * chain and finds that definition as the class's own, indistinguishable from
 * PostgreSQLAdapter overriding AbstractAdapter's; see `assertNotStubbed`'s
 * docstring. Lexically the shape is plain, so it is caught here instead.
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** The one declaration site of the guarded set, read below. */
const DECLARATION_SITE = "packages/activerecord/src/support/stubbed-ddl-methods.ts";

/**
 * The adapter members whose interception makes the canonical half unsafe, read
 * out of {@link DECLARATION_SITE} — the module the runtime guard in
 * `load-schema-helper.ts` imports, and where the reasoning for reaching past
 * `createTable` lives.
 *
 * It is read rather than imported because this is a plain-Node module that
 * ESLint loads without a TypeScript pipeline, and the declaration site sits
 * inside `packages/activerecord`'s `rootDir` where it must stay to be importable
 * by the guard. A second hand-maintained copy here is what the widening was
 * supposed to end, so the file is parsed instead — a shape it is kept trivial
 * for, and a parse that yields nothing is a hard failure rather than a rule that
 * silently stops firing.
 */
function readStubbedDdlMethods() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", DECLARATION_SITE);
  const source = readFileSync(file, "utf8");
  const array = /STUBBED_DDL_METHODS[^=]*=\s*\[([^\]]*)\]/.exec(source);
  const methods = array ? [...array[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  if (methods.length === 0) {
    throw new Error(
      `no-load-schema-with-stubbed-ddl: found no STUBBED_DDL_METHODS in ${DECLARATION_SITE}. ` +
        "The rule is derived from that array; keep it a flat list of double-quoted names.",
    );
  }
  return new Set(methods);
}

export const STUBBED_DDL_METHODS = readStubbedDdlMethods();

/** The loader that must not be reached for once a DDL emitter is stubbed. */
export const BANNED_LOADER = "loadSchema";

/**
 * True when `node` names a stubbed DDL emitter: a string literal or a
 * non-computed object property key.
 */
export function namesStubbedDdlMethod(node) {
  if (node.type === "Literal") return STUBBED_DDL_METHODS.has(node.value);
  if (node.type === "Identifier") return STUBBED_DDL_METHODS.has(node.name);
  return false;
}

/**
 * True when a stubbed-DDL-method literal sits in an *interception* position — the
 * Proxy-trap dispatch shapes `prop === "createTable"`, `case "createTable":`,
 * and `["createTable"].includes(prop)`.
 *
 * Merely mentioning the name (`migration.methodMissing("createTable")`, a test
 * title, an SQL assertion) does not arm the rule: it would make an unrelated
 * `loadSchema` in the same file a spurious error, and the detection here is
 * file-scoped, so a loose match is expensive.
 */
export function isInterceptionPosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "BinaryExpression") return COMPARISONS.has(parent.operator);
  if (parent.type === "SwitchCase") return parent.test === node;
  if (parent.type === "ArrayExpression") return true;
  return false;
}

const COMPARISONS = new Set(["===", "==", "!==", "!="]);

/**
 * True when `node` is a class-body definition of a stubbed DDL emitter — the
 * `class Probe extends BetterSQLite3Adapter { override async createTable() {} }`
 * cover, its `createTable = async () => {}` field form, and the `get
 * schemaCreation()` accessor form. A standalone fake adapter class counts too:
 * it lays nothing either.
 *
 * Unlike the literal shapes above there is no "interception position" to
 * qualify — a class body that defines `createTable` at all is defining the
 * emitter `runTable` will call.
 */
export function definesStubbedDdlMember(node) {
  if (node.computed) return false;
  return namesStubbedDdlMethod(node.key);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `loadSchema` in a test file that stubs a DDL emitter; such arm-content covers must call `loadAdapterSpecificSchema` directly.",
    },
    schema: [],
    messages: {
      misrouted:
        'This file stubs `{{method}}`, so nothing is really laid on the database — `loadSchema` would run the canonical half first and fail with `relation "…" does not exist` (PR #5676). Call `loadAdapterSpecificSchema` directly instead.',
    },
  },

  create(context) {
    let stubbedMethod = null;
    const loaderRefs = [];
    const seen = new Set();

    return {
      Literal(node) {
        if (stubbedMethod === null && namesStubbedDdlMethod(node) && isInterceptionPosition(node)) {
          stubbedMethod = node.value;
        }
      },
      Property(node) {
        if (node.computed) return;
        if (stubbedMethod === null && namesStubbedDdlMethod(node.key)) {
          stubbedMethod = node.key.name ?? node.key.value;
        }
      },
      "MethodDefinition, PropertyDefinition"(node) {
        if (stubbedMethod === null && definesStubbedDdlMember(node)) {
          stubbedMethod = node.key.name ?? node.key.value;
        }
      },
      Identifier(node) {
        if (node.name !== BANNED_LOADER) return;
        // `Model.loadSchema()` is ActiveRecord's own per-model reflection load,
        // not the test-infra helper — only bare references to the helper count.
        const parent = node.parent;
        if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) {
          return;
        }
        if (parent?.type === "Property" && parent.key === node && !parent.computed) return;
        // A shorthand import specifier (`import { loadSchema }`) has the same
        // Identifier node visited twice, as `imported` and as `local`.
        const at = `${node.range[0]}:${node.range[1]}`;
        if (seen.has(at)) return;
        seen.add(at);
        loaderRefs.push(node);
      },
      "Program:exit"() {
        if (stubbedMethod === null) return;
        for (const node of loaderRefs) {
          context.report({
            node,
            messageId: "misrouted",
            data: { method: stubbedMethod },
          });
        }
      },
    };
  },
};

export default rule;
