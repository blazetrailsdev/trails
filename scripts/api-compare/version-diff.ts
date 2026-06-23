// Pure cross-version diff core for the Rails API drift report: diff two Ruby
// API manifests (base = our v8.0.2 pin, target = a bump candidate) into an
// upgrade worklist (classes added/removed, per-method signature/visibility/
// call-set deltas); `annotateAgainstTs` flags what intersects OUR ported
// surface. Pure (no node:* / process / fs) — drift.ts owns all I/O.

import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "./types.js";

export interface MethodRef {
  name: string;
  isStatic: boolean;
}
export interface MethodChange extends MethodRef {
  signatureChanged?: { before: string; after: string };
  visibilityChanged?: { before: string; after: string };
  callsChanged?: { added: string[]; removed: string[] };
  ported?: boolean;
}
export interface ClassDrift {
  name: string;
  kind: "class" | "module";
  addedMethods: MethodRef[];
  removedMethods: MethodRef[];
  changedMethods: MethodChange[];
  ported?: boolean;
}
export interface ClassRef {
  name: string;
  kind: "class" | "module";
  ported?: boolean;
}
export interface PackageDrift {
  package: string;
  addedClasses: ClassRef[];
  removedClasses: ClassRef[];
  changedClasses: ClassDrift[];
}
export interface DriftSummary {
  addedClasses: number;
  removedClasses: number;
  signatureChanges: number;
  visibilityChanges: number;
  callSetChanges: number;
  portedAffected: number;
}
export interface VersionDrift {
  packages: PackageDrift[];
  summary: DriftSummary;
}
type ClassEntry = { kind: "class" | "module"; info: ClassInfo };

function classEntries(pkg: PackageInfo): Map<string, ClassEntry> {
  const out = new Map<string, ClassEntry>();
  for (const [name, info] of Object.entries(pkg.classes ?? {}))
    out.set(name, { kind: "class", info });
  for (const [name, info] of Object.entries(pkg.modules ?? {}))
    out.set(name, { kind: "module", info });
  return out;
}
function methodMap(info: ClassInfo): Map<string, MethodInfo> {
  const out = new Map<string, MethodInfo>();
  for (const m of info.instanceMethods ?? []) out.set(`i:${m.name}`, m);
  for (const m of info.classMethods ?? []) out.set(`s:${m.name}`, m);
  return out;
}
export function signatureOf(m: MethodInfo): string {
  const part = (p: { kind: string; name: string; literal?: { value?: string | boolean } }) =>
    `${p.kind} ${p.name}` + (p.literal?.value !== undefined ? `=${p.literal.value}` : "");
  return (m.params ?? []).map(part).join(", ");
}
function callDelta(
  before: string[] | undefined,
  after: string[] | undefined,
): { added: string[]; removed: string[] } | undefined {
  const b = new Set(before ?? []);
  const a = new Set(after ?? []);
  const added = [...a].filter((x) => !b.has(x)).sort();
  const removed = [...b].filter((x) => !a.has(x)).sort();
  return added.length || removed.length ? { added, removed } : undefined;
}
const sortRef = (a: MethodRef, b: MethodRef) =>
  a.name === b.name ? Number(a.isStatic) - Number(b.isStatic) : a.name < b.name ? -1 : 1;
function diffClass(before: ClassInfo, after: ClassInfo, kind: "class" | "module"): ClassDrift {
  const beforeMethods = methodMap(before);
  const afterMethods = methodMap(after);
  const addedMethods: MethodRef[] = [];
  const removedMethods: MethodRef[] = [];
  const changedMethods: MethodChange[] = [];
  for (const [key, m] of afterMethods) {
    if (!beforeMethods.has(key))
      addedMethods.push({ name: m.name, isStatic: key.startsWith("s:") });
  }
  for (const [key, m] of beforeMethods) {
    const next = afterMethods.get(key);
    if (!next) {
      removedMethods.push({ name: m.name, isStatic: key.startsWith("s:") });
      continue;
    }
    const change: MethodChange = { name: m.name, isStatic: key.startsWith("s:") };
    const [beforeSig, afterSig] = [signatureOf(m), signatureOf(next)];
    if (beforeSig !== afterSig) change.signatureChanged = { before: beforeSig, after: afterSig };
    if (m.visibility !== next.visibility) {
      change.visibilityChanged = { before: m.visibility, after: next.visibility };
    }
    const calls = callDelta(m.calls, next.calls);
    if (calls) change.callsChanged = calls;
    if (change.signatureChanged || change.visibilityChanged || change.callsChanged) {
      changedMethods.push(change);
    }
  }
  addedMethods.sort(sortRef);
  removedMethods.sort(sortRef);
  changedMethods.sort(sortRef);
  return { name: after.name, kind, addedMethods, removedMethods, changedMethods };
}

export function diffManifests(base: ApiManifest, target: ApiManifest): VersionDrift {
  const packages: PackageDrift[] = [];
  const summary: DriftSummary = {
    addedClasses: 0,
    removedClasses: 0,
    signatureChanges: 0,
    visibilityChanges: 0,
    callSetChanges: 0,
    portedAffected: 0,
  };
  const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : 1);
  const pkgNames = new Set([...Object.keys(base.packages), ...Object.keys(target.packages)]);

  for (const pkgName of [...pkgNames].sort()) {
    const basePkg = base.packages[pkgName];
    const targetPkg = target.packages[pkgName];
    if (!basePkg || !targetPkg) continue;

    const baseClasses = classEntries(basePkg);
    const targetClasses = classEntries(targetPkg);
    const addedClasses: ClassRef[] = [];
    const removedClasses: ClassRef[] = [];
    const changedClasses: ClassDrift[] = [];
    for (const [name, entry] of targetClasses) {
      if (!baseClasses.has(name)) addedClasses.push({ name, kind: entry.kind });
    }
    for (const [name, entry] of baseClasses) {
      const next = targetClasses.get(name);
      if (!next) {
        removedClasses.push({ name, kind: entry.kind });
        continue;
      }
      const drift = diffClass(entry.info, next.info, entry.kind);
      if (drift.addedMethods.length || drift.removedMethods.length || drift.changedMethods.length) {
        changedClasses.push(drift);
      }
    }

    addedClasses.sort(byName);
    removedClasses.sort(byName);
    changedClasses.sort(byName);
    summary.addedClasses += addedClasses.length;
    summary.removedClasses += removedClasses.length;
    for (const c of changedClasses) {
      for (const m of c.changedMethods) {
        if (m.signatureChanged) summary.signatureChanges++;
        if (m.visibilityChanged) summary.visibilityChanges++;
        if (m.callsChanged) summary.callSetChanges++;
      }
    }
    if (addedClasses.length || removedClasses.length || changedClasses.length) {
      packages.push({ package: pkgName, addedClasses, removedClasses, changedClasses });
    }
  }
  return { packages, summary };
}
function tsIndex(ts: ApiManifest): Map<string, Map<string, Set<string>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  for (const [pkgName, pkg] of Object.entries(ts.packages)) {
    const classes = new Map<string, Set<string>>();
    for (const entry of classEntries(pkg).values()) {
      classes.set(entry.info.name, new Set(methodMap(entry.info).keys()));
    }
    out.set(pkgName, classes);
  }
  return out;
}

/** Mark each affected class/method `ported` when it exists in OUR TS surface;
 *  recompute `summary.portedAffected`. Mutates and returns the same object. */
export function annotateAgainstTs(drift: VersionDrift, ts: ApiManifest): VersionDrift {
  const index = tsIndex(ts);
  let portedAffected = 0;
  const methodKey = (m: MethodRef) => `${m.isStatic ? "s" : "i"}:${m.name}`;
  for (const pkg of drift.packages) {
    const classes = index.get(pkg.package);
    for (const c of [...pkg.addedClasses, ...pkg.removedClasses]) {
      c.ported = classes?.has(c.name) ?? false;
      if (c.ported) portedAffected++;
    }
    for (const c of pkg.changedClasses) {
      const methods = classes?.get(c.name);
      c.ported = methods !== undefined;
      for (const m of c.changedMethods) {
        m.ported = methods?.has(methodKey(m)) ?? false;
        if (m.ported) portedAffected++;
      }
    }
  }
  drift.summary.portedAffected = portedAffected;
  return drift;
}
