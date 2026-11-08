import { describe, expect, it } from "vitest";
import { onLoad } from "@blazetrails/activesupport";
import { Base } from "./base.js";
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
