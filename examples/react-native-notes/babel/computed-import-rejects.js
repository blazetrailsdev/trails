module.exports = function computedImportRejects({ types: t }) {
  return {
    name: "computed-import-rejects",
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== "Import") return;
        const [specifier] = path.node.arguments;
        if (!specifier || t.isStringLiteral(specifier)) return;
        path.replaceWith(
          t.callExpression(t.memberExpression(t.identifier("Promise"), t.identifier("reject")), [
            t.newExpression(t.identifier("Error"), [
              t.stringLiteral("computed import() is not bundled for React Native"),
            ]),
          ]),
        );
      },
    },
  };
};
