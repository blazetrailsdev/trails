const path = require("node:path");

module.exports = function perFileImportMetaUrl({ types: t }) {
  return {
    name: "per-file-import-meta-url",
    visitor: {
      Program(program, state) {
        const relative = path.relative(state.cwd, state.filename).split(path.sep).join("/");
        const url = `file:///${encodeURI(relative)}`;
        program.traverse({
          MemberExpression(path) {
            const { object, property } = path.node;
            if (
              t.isMetaProperty(object) &&
              object.meta.name === "import" &&
              object.property.name === "meta" &&
              t.isIdentifier(property, { name: "url" })
            ) {
              path.replaceWith(t.stringLiteral(url));
            }
          },
        });
      },
    },
  };
};
