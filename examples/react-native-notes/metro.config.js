const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const NODE_MODULE = path.join(__dirname, "shims/node-module.js");
const UNSUPPORTED = path.join(__dirname, "shims/unsupported.js");
const NODE_BUILTINS = new Set(require("node:module").builtinModules);

const HEADLESS_EXPO_SQLITE = path.join(__dirname, "headless/expo-sqlite.js");

config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  keep_classnames: true,
  keep_fnames: true,
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (process.env.TRAILS_HEADLESS && moduleName === "expo-sqlite") {
    return { type: "sourceFile", filePath: HEADLESS_EXPO_SQLITE };
  }
  if (moduleName === "node:module" || moduleName === "module") {
    return { type: "sourceFile", filePath: NODE_MODULE };
  }
  if (moduleName.startsWith("node:") || NODE_BUILTINS.has(moduleName)) {
    return { type: "sourceFile", filePath: UNSUPPORTED };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
