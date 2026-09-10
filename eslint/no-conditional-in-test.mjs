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

function isAdapterCondition(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "Identifier" && node.name === "adapterType") return true;
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "currentAdapter"
  )
    return true;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      if (child.some(isAdapterCondition)) return true;
    } else if (child && typeof child.type === "string" && isAdapterCondition(child)) {
      return true;
    }
  }
  return false;
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
