function createRequire() {
  return function shimRequire(id) {
    if (id === "expo-sqlite") return require("expo-sqlite");
    const error = new Error(`Cannot find module '${id}'`);
    error.code = "MODULE_NOT_FOUND";
    throw error;
  };
}

module.exports = { createRequire };
