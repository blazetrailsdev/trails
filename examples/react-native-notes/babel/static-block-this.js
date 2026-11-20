module.exports = function staticBlockThis({ types: t }) {
  const replaceThis = {
    ThisExpression(path) {
      path.replaceWith(t.cloneNode(this.id));
    },
    Function(path) {
      if (!path.isArrowFunctionExpression()) path.skip();
    },
    Class(path) {
      path.skip();
    },
  };
  return {
    name: "static-block-this",
    visitor: {
      Program(program) {
        program.traverse({
          StaticBlock(path) {
            const klass = path.parentPath.parentPath;
            if (!klass.node.id) {
              klass.node.id = program.scope.generateUidIdentifier("Class");
            }
            path.traverse(replaceThis, { id: klass.node.id });
          },
        });
      },
    },
  };
};
