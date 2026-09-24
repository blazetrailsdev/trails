const TS5 = "5.9.3";

// The bare `typescript` import resolves to TS 7.1's `lib/version.cjs`, a version
// string with no compiler API, so a peer range admitting 7.x does not retire an
// entry: the consumer must stop loading the compiler through that import.
// Latest release per entry, checked 2026-09-24:
const TS5_PEER_CONSUMERS = [
  // 8.70.1: ">=4.8.4 <6.1.0" — none yet.
  /^typescript-eslint$/,
  /^@typescript-eslint\//,
  // 2.5.0: ">=4.8.4" admits 7.x by range only; it is typescript-eslint's AST layer.
  /^ts-api-utils$/,
  // 1.6.27: ">=5.0.0" admits 7.x by range only; it loads the typescript-eslint utils.
  /^@vitest\/eslint-plugin$/,
  // 0.28.20: "5.0.x … 6.0.x" — none yet.
  /^typedoc$/,
  // 2.70.3: "^5.3.3 || ^6.0.0" — none yet. `sync/ts.js` imports the compiler API.
  /^@sveltejs\/kit$/,
  // 57.0.5: "… || ^7.0.0" admits 7.x by range only; `build/load.js` requires the
  // compiler to load a TS app config. Reached through expo-sqlite.
  /^@expo\/require-utils$/,
];

function readPackage(pkg) {
  if (pkg.peerDependencies?.typescript && TS5_PEER_CONSUMERS.some((re) => re.test(pkg.name))) {
    delete pkg.peerDependencies.typescript;
    if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS5 };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
