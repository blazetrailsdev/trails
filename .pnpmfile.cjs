// The root `typescript` is the 7.1 line (RFC 0125). Its bare `typescript`
// export is a version string, so every consumer of the classic 5.x compiler
// API needs 5.9.3 by another route:
//
// - `scripts/` import the root `typescript-5` alias (package.json) by name,
//   never as bare `typescript`.
// - The dev tooling below reaches TypeScript through a `typescript` PEER,
//   which neither `overrides` nor `packageExtensions` can move (both leave it
//   on 7.1). So this hook turns that peer into a 5.9.3 dependency.
//
// None of this is published. Each entry retires when its package ships a
// peer range admitting 7.x; `scripts/` retire when TS 7 has a programmatic
// build API. `recheck-ts7-api-surface` re-checks at 7.1 stable (2026-11-24),
// which is also when the root pin moves off the 7.1.0-dev nightly.
const TS5 = "5.9.3";

const TS5_PEER_CONSUMERS = [
  /^typescript-eslint$/,
  /^@typescript-eslint\//,
  /^ts-api-utils$/,
  /^@vitest\/eslint-plugin$/,
  /^typedoc$/,
  /^@sveltejs\/kit$/,
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
