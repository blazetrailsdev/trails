const TEST_FNS = new Set(["it", "test"]);

function calleeRoot(callee) {
  let node = callee;
  while (node) {
    if (node.type === "Identifier") return node.name;
    if (node.type === "MemberExpression") node = node.object;
    else if (node.type === "CallExpression") node = node.callee;
    else return null;
  }
  return null;
}

function isAdapterTypeRef(node) {
  return node.type === "Identifier" && node.name === "adapterType";
}

function isStringLiteral(node) {
  return node.type === "Literal" && typeof node.value === "string";
}

function isAdapterCondition(node) {
  switch (node.type) {
    case "CallExpression":
      return node.callee.type === "Identifier" && node.callee.name === "currentAdapter";
    case "BinaryExpression":
      return (
        ["===", "!==", "==", "!="].includes(node.operator) &&
        ((isAdapterTypeRef(node.left) && isStringLiteral(node.right)) ||
          (isStringLiteral(node.left) && isAdapterTypeRef(node.right)))
      );
    case "LogicalExpression":
      return isAdapterCondition(node.left) && isAdapterCondition(node.right);
    case "UnaryExpression":
      return node.operator === "!" && isAdapterCondition(node.argument);
    default:
      return false;
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "disallow conditionals in tests, except a current_adapter? branch",
    },
    messages: { noConditionalInTest: "Remove conditional tests" },
    schema: [],
  },
  create(context) {
    return {
      IfStatement(node) {
        const call = node.parent?.parent?.parent;
        if (call?.type !== "CallExpression" || !TEST_FNS.has(calleeRoot(call.callee))) return;
        if (isAdapterCondition(node.test)) return;
        context.report({ messageId: "noConditionalInTest", node });
      },
    };
  },
};
