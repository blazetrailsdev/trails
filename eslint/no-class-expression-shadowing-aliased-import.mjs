/**
 * ESLint rule: no-class-expression-shadowing-aliased-import
 *
 * Reports a class expression whose name equals the original name of an import
 * aliased in the same module:
 *
 *   import { BacktraceCleaner as ActiveSupportBacktraceCleaner } from "...";
 *   static BacktraceCleaner = class BacktraceCleaner extends ActiveSupportBacktraceCleaner {};
 *
 * esbuild renames a bundled aliased import back to its original name, which
 * then collides with the class expression's inner binding, and the module
 * throws a TDZ `ReferenceError` at load. Drop the inner name: a static field's
 * NamedEvaluation still sets `.name`.
 */

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow a class expression named like the original name of an aliased import",
    },
    schema: [],
    messages: {
      shadowsAliasedImport:
        "Class expression `{{name}}` shares the original name of the aliased import `{{name}} as {{local}}`; esbuild renames the import back and the module throws a TDZ ReferenceError at load. Drop the class expression's name.",
    },
  },
  create(context) {
    const aliased = new Map();
    const classExpressions = [];
    return {
      ImportSpecifier(node) {
        const imported =
          node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
        if (imported !== node.local.name) aliased.set(imported, node.local.name);
      },
      ClassExpression(node) {
        if (node.id) classExpressions.push(node);
      },
      "Program:exit"() {
        for (const node of classExpressions) {
          const local = aliased.get(node.id.name);
          if (local === undefined) continue;
          context.report({
            node: node.id,
            messageId: "shadowsAliasedImport",
            data: { name: node.id.name, local },
          });
        }
      },
    };
  },
};
