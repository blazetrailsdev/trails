module.exports = function keepUninitializedFields({ types: t }) {
  return {
    name: "keep-uninitialized-fields",
    visitor: {
      Program(program) {
        program.traverse({
          ClassProperty({ node }) {
            if (node.value === null && !node.declare) {
              node.value = t.unaryExpression("void", t.numericLiteral(0));
            }
          },
        });
      },
    },
  };
};
