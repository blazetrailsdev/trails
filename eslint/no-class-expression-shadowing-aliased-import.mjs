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
 * throws a TDZ `ReferenceError` at load. esbuild also flattens a namespace
 * member read to the exported binding, so `class X extends NS.X` (NS a
 * namespace import) and `class X extends X` (X imported unaliased) collide the
 * same way. The fix that survives bundling is an anonymous class expression on
 * the static field: NamedEvaluation still names it after the field, and
 * `parity:api` credits it by that name.
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
        "Class expression `{{name}}` shares the original name of the aliased import `{{name}} as {{local}}`; esbuild renames the import back and the module throws a TDZ ReferenceError at load. Make it an anonymous class expression on the static field.",
      shadowsNamespaceImport:
        "Class expression `{{name}}` extends `{{heritage}}`, which esbuild flattens to the binding `{{name}}`; the inner name collides and the module throws a TDZ ReferenceError at load. Make it an anonymous class expression on the static field.",
    },
  },
  create(context) {
    const aliased = new Map();
    const namespaces = new Set();
    const unaliased = new Set();
    const classExpressions = [];
    return {
      ImportSpecifier(node) {
        if (node.importKind === "type" || node.parent.importKind === "type") return;
        const imported =
          node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
        if (imported !== node.local.name) aliased.set(imported, node.local.name);
        else unaliased.add(imported);
      },
      ImportNamespaceSpecifier(node) {
        if (node.parent.importKind === "type") return;
        namespaces.add(node.local.name);
      },
      ClassExpression(node) {
        if (node.id) classExpressions.push(node);
      },
      "Program:exit"() {
        for (const node of classExpressions) {
          const name = node.id.name;
          const sup = node.superClass;
          const flattened =
            sup &&
            ((sup.type === "Identifier" && sup.name === name && unaliased.has(name)) ||
              (sup.type === "MemberExpression" &&
                !sup.computed &&
                sup.object.type === "Identifier" &&
                namespaces.has(sup.object.name) &&
                sup.property.name === name));
          if (flattened) {
            context.report({
              node: node.id,
              messageId: "shadowsNamespaceImport",
              data: { name, heritage: context.sourceCode.getText(sup) },
            });
            continue;
          }
          const local = aliased.get(name);
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
