const THOR_BASES = ["Thor", "Thor.Group"];

function dottedName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const object = dottedName(node.object);
    return object === null ? null : `${object}.${node.property.name}`;
  }
  return null;
}

function isThis(node) {
  while (node.type === "TSAsExpression" || node.type === "TSNonNullExpression") {
    node = node.expression;
  }
  return node.type === "ThisExpression";
}

function keyName(key) {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

function boundName(node) {
  if (node.id) return node.id.name;
  let parent = node.parent;
  while (parent?.type === "TSAsExpression") parent = parent.parent;
  return parent?.type === "VariableDeclarator" && parent.id.type === "Identifier"
    ? parent.id.name
    : null;
}

function commandCandidates(body) {
  return body.body.filter(
    (member) =>
      member.type === "MethodDefinition" &&
      member.kind === "method" &&
      member.value.type !== "TSEmptyBodyFunctionExpression" &&
      !member.static &&
      !member.computed &&
      member.accessibility !== "private" &&
      member.accessibility !== "protected" &&
      keyName(member.key) !== null,
  );
}

function registeredNames(blocks, sourceCode) {
  const names = new Set();
  const visit = (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property.name === "methodAdded" &&
      isThis(node.callee.object)
    ) {
      const [arg] = node.arguments;
      if (arg?.type === "Literal" && typeof arg.value === "string") names.add(arg.value);
    }
    for (const key of sourceCode.visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && visit(c));
      else if (child) visit(child);
    }
  };
  blocks.forEach(visit);
  return names;
}

/**
 * ESLint rule: thor-command-registration
 *
 * Thor registers a command when the VM fires `method_added` for a public `def`
 * (`vendor/thor/v1.3.2/lib/thor/base.rb:729-745`). JS has no such hook, so a
 * Thor class body fires it itself: `this.methodAdded("name")` in a static
 * block, inside `this.noCommands(() => ...)` for a helper (CLAUDE.md § "Thor
 * commands register through an explicit `methodAdded`"). A forgotten call
 * silently drops the command, and in a `Thor::Group` the step never runs.
 *
 * A TS-`private` / `protected` method is Thor's private method, which is never
 * a command, and a `static` method is a class method `method_added` never sees.
 *
 * The `extends` chain is read within the file, in any declaration order.
 * `baseClasses` names further Thor classes a file imports. A registration is a
 * `this.methodAdded("name")` call with a string literal: a name passed through
 * a variable is not read, and its method is reported.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
export default {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Every public method of a Thor / Thor::Group subclass is passed to methodAdded in a " +
        "static block.",
    },
    schema: [
      {
        type: "object",
        properties: { baseClasses: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      unregistered:
        "'{{name}}' is a public method of a Thor class that no static block passes to " +
        'methodAdded, so Thor never registers it. Add this.methodAdded("{{name}}"), inside ' +
        "this.noCommands(() => ...) if it is a helper, or mark the method private.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const thorClasses = new Set([...THOR_BASES, ...(context.options[0]?.baseClasses ?? [])]);

    const classes = [];

    const check = (node) => {
      const blocks = node.body.body.filter((member) => member.type === "StaticBlock");
      const registered = registeredNames(blocks, sourceCode);
      for (const method of commandCandidates(node.body)) {
        const methodName = keyName(method.key);
        if (registered.has(methodName)) continue;
        context.report({
          node: method.key,
          messageId: "unregistered",
          data: { name: methodName },
          fix(fixer) {
            const call = `this.methodAdded(${JSON.stringify(methodName)});`;
            const indent = " ".repeat(node.body.body[0].loc.start.column);
            const block = blocks[blocks.length - 1];
            if (block === undefined) {
              return fixer.insertTextAfter(
                sourceCode.getFirstToken(node.body),
                `\n${indent}static {\n${indent}  ${call}\n${indent}}`,
              );
            }
            const last = block.body[block.body.length - 1];
            if (last === undefined) {
              const open = sourceCode.getFirstToken(block, { skip: 1 });
              const close = sourceCode.getLastToken(block);
              return fixer.replaceTextRange(
                [open.range[1], close.range[0]],
                `\n${indent}  ${call}\n${indent}`,
              );
            }
            return fixer.insertTextAfter(last, `\n${" ".repeat(last.loc.start.column)}${call}`);
          },
        });
      }
    };

    return {
      ClassDeclaration: (node) => classes.push(node),
      ClassExpression: (node) => classes.push(node),
      "Program:exit"() {
        let pending = classes.filter((node) => dottedName(node.superClass) !== null);
        for (let found = true; found; ) {
          found = false;
          pending = pending.filter((node) => {
            if (!thorClasses.has(dottedName(node.superClass))) return true;
            const name = boundName(node);
            if (name !== null) thorClasses.add(name);
            check(node);
            found = true;
            return false;
          });
        }
      },
    };
  },
};
