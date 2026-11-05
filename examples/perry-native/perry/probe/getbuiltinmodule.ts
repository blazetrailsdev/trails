const gbm = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
  ?.getBuiltinModule;
console.log("typeof getBuiltinModule:", typeof gbm);
if (typeof gbm === "function") {
  const u = gbm("node:util") as { getCallSites?: unknown } | undefined;
  console.log("node:util resolved:", u != null);
  console.log("typeof getCallSites:", typeof u?.getCallSites);
  if (typeof u?.getCallSites === "function") {
    const sites = (u.getCallSites as (n?: number) => unknown[])(10);
    console.log("frames:", Array.isArray(sites) ? sites.length : "not-array");
    console.log("first:", JSON.stringify(sites?.[0]));
  }
}
