#!/usr/bin/env node
// Prints the `packages/<name>` dirs a change set must retest: each changed
// package plus its reverse closure over package.json @blazetrails edges
// (dependencies, peer and dev), one per line. Rationale: "unit_packages" in
// the gate reference, scripts/ci-suite-coverage.test.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");
const FIELDS = ["dependencies", "peerDependencies", "devDependencies"];
const SCOPE = "@blazetrails/";

export function reverseEdges(packagesDir = PACKAGES) {
  const dependents = new Map();
  for (const dir of readdirSync(packagesDir)) {
    const manifest = path.join(packagesDir, dir, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    for (const field of FIELDS) {
      for (const dep of Object.keys(pkg[field] ?? {})) {
        if (!dep.startsWith(SCOPE)) continue;
        const name = dep.slice(SCOPE.length);
        if (!dependents.has(name)) dependents.set(name, new Set());
        dependents.get(name).add(dir);
      }
    }
  }
  return dependents;
}

export function affectedPackages(files, dependents = reverseEdges()) {
  const seen = new Set();
  const queue = [];
  for (const file of files) {
    const name = file.match(/^packages\/([^/]+)\//)?.[1];
    if (name !== undefined) queue.push(name);
  }
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push(...(dependents.get(name) ?? []));
  }
  return [...seen].sort().map((name) => `packages/${name}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = (process.argv[2] ?? "").split("\n").filter(Boolean);
  for (const dir of affectedPackages(files)) console.log(dir);
}
