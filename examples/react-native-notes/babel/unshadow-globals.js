const GLOBALS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "Function",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
]);

module.exports = function unshadowGlobals() {
  return {
    name: "unshadow-globals",
    visitor: {
      Program(program) {
        for (const name of Object.keys(program.scope.bindings)) {
          if (GLOBALS.has(name)) program.scope.rename(name, program.scope.generateUid(name));
        }
      },
    },
  };
};
