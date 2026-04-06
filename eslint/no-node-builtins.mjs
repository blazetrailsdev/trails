/**
 * ESLint rule: no-node-builtins
 *
 * Disallows direct imports of Node.js built-in modules in browser-compatible
 * packages. Points to @blazetrails/activesupport adapters when available and
 * provides autofix that rewrites both the import and all usage sites.
 */

const ACTIVESUPPORT_REPLACEMENTS = {
  fs: {
    importSource: "@blazetrails/activesupport",
    importName: "getFs",
    message:
      'Use getFs() from @blazetrails/activesupport instead of importing "{{module}}" directly.',
  },
  path: {
    importSource: "@blazetrails/activesupport",
    importName: "getPath",
    message:
      'Use getPath() from @blazetrails/activesupport instead of importing "{{module}}" directly.',
  },
  crypto: {
    importSource: "@blazetrails/activesupport",
    importName: "getCrypto",
    message:
      'Use getCrypto() from @blazetrails/activesupport instead of importing "{{module}}" directly.',
  },
};

import { builtinModules } from "node:module";

// All Node.js built-in module names (without node: prefix), including underscored internals
const NODE_BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("_")));

function normalizeModule(source) {
  return source.replace(/^node:/, "");
}

function getBuiltinBase(normalized) {
  // Handle subpath imports like "fs/promises", "path/posix", "dns/promises"
  const slashIndex = normalized.indexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct imports of Node.js built-in modules for browser compatibility",
    },
    fixable: "code",
    messages: {
      useAdapter: "{{message}}",
      noNodeBuiltin:
        'Do not import Node.js built-in module "{{module}}" directly — it breaks browser compatibility.',
    },
    schema: [],
  },
  create(context) {
    function getReferencesForSpec(node, spec) {
      const sourceCode = context.sourceCode || context.getSourceCode();
      const scope = sourceCode.getScope(node);
      const variable = scope.variables.find((v) => v.name === spec.local.name);
      if (!variable) return [];
      return variable.references.filter((ref) => ref.identifier !== spec.local);
    }

    function findExistingAdapterImport(node, replacement) {
      const sourceCode = context.sourceCode || context.getSourceCode();
      const program = sourceCode.ast;
      for (const stmt of program.body) {
        if (
          stmt !== node &&
          stmt.type === "ImportDeclaration" &&
          stmt.source.value === replacement.importSource &&
          stmt.importKind !== "type"
        ) {
          return stmt;
        }
      }
      return null;
    }

    function findAdapterSpecifier(existingImport, name) {
      return existingImport.specifiers.find(
        (s) => s.type === "ImportSpecifier" && s.imported && s.imported.name === name,
      );
    }

    function isNamedImportOnly(existingImport) {
      return existingImport.specifiers.every((s) => s.type === "ImportSpecifier");
    }

    function replaceNodeImport(fixer, node, replacement) {
      const fixes = [];
      const existing = findExistingAdapterImport(node, replacement);
      if (existing) {
        const spec = findAdapterSpecifier(existing, replacement.importName);
        if (spec) {
          // Already imported (possibly aliased) — use the local name for rewrites
          fixes.push(fixer.remove(node));
          fixes._adapterLocalName = spec.local.name;
        } else if (isNamedImportOnly(existing)) {
          // Named import exists but doesn't have our specifier — safe to insert
          fixes.push(fixer.remove(node));
          const lastSpec = existing.specifiers[existing.specifiers.length - 1];
          fixes.push(fixer.insertTextAfter(lastSpec, `, ${replacement.importName}`));
        } else {
          // Existing import uses default/namespace style — bail, can't safely merge
          return null;
        }
      } else {
        fixes.push(
          fixer.replaceText(
            node,
            `import { ${replacement.importName} } from "${replacement.importSource}";`,
          ),
        );
      }
      return fixes;
    }

    function fixNamespaceOrDefault(fixer, node, replacement) {
      const spec = node.specifiers[0];
      const refs = getReferencesForSpec(node, spec);

      // Bail if any reference isn't a simple member access (e.g. passed as value)
      for (const ref of refs) {
        const parent = ref.identifier.parent;
        if (!(parent.type === "MemberExpression" && parent.object === ref.identifier)) {
          return null;
        }
      }

      const fixes = replaceNodeImport(fixer, node, replacement);
      if (!fixes) return null;
      const adapterCall = `${fixes._adapterLocalName || replacement.importName}()`;
      for (const ref of refs) {
        fixes.push(fixer.replaceText(ref.identifier, adapterCall));
      }
      return fixes;
    }

    function fixNamedImports(fixer, node, replacement) {
      const refs = [];
      for (const spec of node.specifiers) {
        // Use the imported (original) name, not the local (aliased) name
        const importedName =
          spec.imported && spec.imported.name ? spec.imported.name : spec.local.name;
        for (const ref of getReferencesForSpec(node, spec)) {
          refs.push({ ref, importedName });
        }
      }

      const fixes = replaceNodeImport(fixer, node, replacement);
      if (!fixes) return null;
      const adapterCall = `${fixes._adapterLocalName || replacement.importName}()`;

      for (const { ref, importedName } of refs) {
        fixes.push(fixer.replaceText(ref.identifier, `${adapterCall}.${importedName}`));
      }
      return fixes;
    }

    function check(node, source) {
      const mod = normalizeModule(source);
      const base = getBuiltinBase(mod);
      const replacement = ACTIVESUPPORT_REPLACEMENTS[base];

      // Only autofix exact base module imports (not subpaths like "fs/promises")
      if (replacement && base === mod) {
        context.report({
          node,
          messageId: "useAdapter",
          data: { message: replacement.message.replace("{{module}}", source) },
          fix(fixer) {
            if (node.type !== "ImportDeclaration" || node.specifiers.length === 0) {
              return null;
            }

            const specTypes = new Set(node.specifiers.map((s) => s.type));
            // Bail on mixed specifier styles (e.g. `import fs, { readFileSync } from "fs"`)
            if (specTypes.size > 1) {
              return null;
            }

            const specType = node.specifiers[0].type;
            if (specType === "ImportNamespaceSpecifier" || specType === "ImportDefaultSpecifier") {
              return fixNamespaceOrDefault(fixer, node, replacement);
            }
            if (specType === "ImportSpecifier") {
              return fixNamedImports(fixer, node, replacement);
            }
            return null;
          },
        });
        return;
      }

      // Report adapter-replaceable subpaths (e.g. "fs/promises") without autofix
      if (replacement && base !== mod) {
        context.report({
          node,
          messageId: "useAdapter",
          data: { message: replacement.message.replace("{{module}}", source) },
        });
        return;
      }

      if (NODE_BUILTINS.has(base)) {
        context.report({
          node,
          messageId: "noNodeBuiltin",
          data: { module: source },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string") {
          check(node, node.source.value);
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && typeof node.source.value === "string") {
          check(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal" &&
          typeof node.arguments[0].value === "string"
        ) {
          const source = node.arguments[0].value;
          const mod = normalizeModule(source);
          const base = getBuiltinBase(mod);
          const replacement = ACTIVESUPPORT_REPLACEMENTS[base];
          if (replacement) {
            context.report({
              node,
              messageId: "useAdapter",
              data: { message: replacement.message.replace("{{module}}", source) },
            });
          } else if (NODE_BUILTINS.has(base)) {
            context.report({
              node,
              messageId: "noNodeBuiltin",
              data: { module: source },
            });
          }
        }
      },
    };
  },
};

export default rule;
