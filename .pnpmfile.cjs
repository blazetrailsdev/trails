const TS5 = "5.9.3";

const TS5_PEER_CONSUMERS = [
  /^typescript-eslint$/,
  /^@typescript-eslint\//,
  /^ts-api-utils$/,
  /^@vitest\/eslint-plugin$/,
  /^typedoc$/,
  /^@sveltejs\/kit$/,
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
