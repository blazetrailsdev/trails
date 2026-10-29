import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import { Base, registerJob, registeredJob } from "./base.js";
import { ActiveJob } from "./namespaces.js";

describe("ActiveJob::Base", () => {
  it("runs the active_job load hooks once, with Base", () => {
    const loaded: unknown[] = [];
    onLoad("active_job", (base: unknown) => loaded.push(base));
    expect(loaded).toEqual([Base]);
  });

  it("is seated on the ActiveJob namespace by base.ts", () => {
    expect(ActiveJob.Base).toBe(Base);
  });
});

describe("registeredJob", () => {
  it("reads back a job seated by registerJob under its name and an explicit name", () => {
    class RegistryReadJob extends Base {}
    registerJob(RegistryReadJob);
    registerJob("Registry::AliasJob", RegistryReadJob);
    expect(registeredJob("RegistryReadJob")).toBe(RegistryReadJob);
    expect(registeredJob("Registry::AliasJob")).toBe(RegistryReadJob);
    expect(registeredJob("NeverRegisteredJob")).toBeUndefined();
  });
});
