const TRAILS_OUTPUT = /[\\/](?:packages[\\/][^\\/]+[\\/]dist|node_modules[\\/]@blazetrails)[\\/]/;

module.exports = function keepUninitializedFields({ types: t }) {
  return {
    name: "keep-uninitialized-fields",
    visitor: {
      Program(program, state) {
        if (!TRAILS_OUTPUT.test(state.filename)) return;
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
