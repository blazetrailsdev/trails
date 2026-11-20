const TS5 = "5.9.3";
const TS6 = "6.0.3";

const TS5_PEER_CONSUMERS = [/^@sveltejs\/kit$/, /^@expo\/require-utils$/];

const TS6_PEER_CONSUMERS = [
  /^typescript-eslint$/,
  /^@typescript-eslint\//,
  /^ts-api-utils$/,
  /^@vitest\/eslint-plugin$/,
  /^typedoc$/,
];

function pin(pkg, version) {
  delete pkg.peerDependencies.typescript;
  if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
  pkg.dependencies = { ...pkg.dependencies, typescript: version };
}

function readPackage(pkg) {
  if (!pkg.peerDependencies?.typescript) return pkg;
  if (TS6_PEER_CONSUMERS.some((re) => re.test(pkg.name))) pin(pkg, TS6);
  else if (TS5_PEER_CONSUMERS.some((re) => re.test(pkg.name))) pin(pkg, TS5);
  return pkg;
}

module.exports = { hooks: { readPackage } };
