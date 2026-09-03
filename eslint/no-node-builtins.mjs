/**
 * ESLint rule: no-node-builtins
 *
 * Disallows direct imports of Node.js built-in modules in browser-compatible
 * packages. Points to the `@blazetrails/ruby-compat` seat for the builtin when
 * there is one and provides autofix that rewrites both the import and every
 * usage site.
 */

/**
 * The Ruby seat for each Node builtin trails packages reach for. `fs` and
 * `path` are `File` / `Dir` — Ruby's own file and directory API, not an adapter
 * accessor — so their usage-site rewrite is a static-method call, and only the
 * members whose Ruby counterpart takes the same arguments are rewritten; a
 * member with no seat is reported without a fix rather than autofixed into a
 * call that does not type-check. `crypto` has no Ruby class of its own, so it
 * keeps the `getCrypto()` adapter accessor.
 */
export const RUBY_COMPAT_REPLACEMENTS = {
  fs: {
    importSource: "@blazetrails/ruby-compat",
    importName: "File",
    message:
      'Use File / Dir from @blazetrails/ruby-compat instead of importing "{{module}}" directly.',
    members: {
      existsSync: "File.isExist",
      statSync: "File.stat",
      renameSync: "File.rename",
      unlinkSync: "File.delete",
      readdirSync: "Dir.children",
      rmdirSync: "Dir.delete",
    },
  },
  path: {
    importSource: "@blazetrails/ruby-compat",
    importName: "File",
    message: 'Use File from @blazetrails/ruby-compat instead of importing "{{module}}" directly.',
    members: {
      join: "File.join",
      dirname: "File.dirname",
      basename: "File.basename",
      extname: "File.extname",
      sep: "File.SEPARATOR",
    },
  },
  crypto: {
    importSource: "@blazetrails/ruby-compat",
    importName: "getCrypto",
    accessor: true,
    message:
      'Use getCrypto() from @blazetrails/ruby-compat instead of importing "{{module}}" directly.',
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

    /** The import names the rewrite of `members` needs, or null if one has no seat. */
    function importNamesFor(replacement, memberNames) {
      if (replacement.accessor) return [replacement.importName];
      const names = [];
      for (const memberName of memberNames) {
        const seat = replacement.members[memberName];
        if (!seat) return null;
        const receiver = seat.slice(0, seat.indexOf("."));
        if (!names.includes(receiver)) names.push(receiver);
      }
      return names;
    }

    /** The expression that replaces one usage site, e.g. `File.join`. */
    function rewriteMember(localNames, replacement, memberName) {
      if (replacement.accessor) {
        return `${localNames[replacement.importName]}().${memberName}`;
      }
      const seat = replacement.members[memberName];
      const dot = seat.indexOf(".");
      return `${localNames[seat.slice(0, dot)]}.${seat.slice(dot + 1)}`;
    }

    function replaceNodeImport(fixer, node, replacement, names) {
      const fixes = [];
      const localNames = {};
      const existing = findExistingAdapterImport(node, replacement);
      if (existing) {
        const missing = [];
        for (const name of names) {
          const spec = findAdapterSpecifier(existing, name);
          // Already imported (possibly aliased) — use the local name for rewrites
          if (spec) localNames[name] = spec.local.name;
          else {
            localNames[name] = name;
            missing.push(name);
          }
        }
        // Existing import uses default/namespace style — bail, can't safely merge
        if (missing.length > 0 && !isNamedImportOnly(existing)) return null;
        fixes.push(fixer.remove(node));
        if (missing.length > 0) {
          const lastSpec = existing.specifiers[existing.specifiers.length - 1];
          fixes.push(fixer.insertTextAfter(lastSpec, `, ${missing.join(", ")}`));
        }
      } else {
        for (const name of names) localNames[name] = name;
        fixes.push(
          fixer.replaceText(
            node,
            `import { ${names.join(", ")} } from "${replacement.importSource}";`,
          ),
        );
      }
      fixes._localNames = localNames;
      return fixes;
    }

    function fixNamespaceOrDefault(fixer, node, replacement) {
      const spec = node.specifiers[0];
      const refs = getReferencesForSpec(node, spec);

      const sites = [];
      for (const ref of refs) {
        const parent = ref.identifier.parent;
        // Bail if any reference isn't a simple member access (e.g. passed as value)
        if (!(parent.type === "MemberExpression" && parent.object === ref.identifier)) return null;
        if (parent.computed || parent.property.type !== "Identifier") return null;
        sites.push({ node: parent, memberName: parent.property.name });
      }

      const names = importNamesFor(
        replacement,
        sites.map((site) => site.memberName),
      );
      if (!names) return null;
      const fixes = replaceNodeImport(fixer, node, replacement, names);
      if (!fixes) return null;
      for (const site of sites) {
        fixes.push(
          fixer.replaceText(
            site.node,
            rewriteMember(fixes._localNames, replacement, site.memberName),
          ),
        );
      }
      return fixes;
    }

    function fixNamedImports(fixer, node, replacement) {
      const sites = [];
      for (const spec of node.specifiers) {
        // Use the imported (original) name, not the local (aliased) name
        const memberName =
          spec.imported && spec.imported.name ? spec.imported.name : spec.local.name;
        for (const ref of getReferencesForSpec(node, spec)) {
          sites.push({ node: ref.identifier, memberName });
        }
      }

      const names = importNamesFor(
        replacement,
        sites.map((site) => site.memberName),
      );
      if (!names) return null;
      const fixes = replaceNodeImport(fixer, node, replacement, names);
      if (!fixes) return null;
      for (const site of sites) {
        fixes.push(
          fixer.replaceText(
            site.node,
            rewriteMember(fixes._localNames, replacement, site.memberName),
          ),
        );
      }
      return fixes;
    }

    function check(node, source) {
      const mod = normalizeModule(source);
      const base = getBuiltinBase(mod);
      const replacement = RUBY_COMPAT_REPLACEMENTS[base];

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
          const replacement = RUBY_COMPAT_REPLACEMENTS[base];
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
