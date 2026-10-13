import { describe, it, expect } from "vitest";
import { Thread, rbInspect } from "@blazetrails/ruby-compat";
import { ExplainRegistry, Base, registerModel } from "./index.js";
import { renderBind } from "./explain.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb } from "./test-helpers/models/bulb.js";

registerModel(Car);
registerModel(Bulb);

describe("ExplainTest (trails)", () => {
  fixtures(["cars", "bulbs"]);

  it("explain returns query plan string (Rails-guided)", async () => {
    const plan = await Car.all().explain().inspect();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("prints one EXPLAIN block per collected query with the header prefix", async () => {
    const plan = await Car.where({ name: "honda" }).explain().inspect();
    expect(plan).toMatch(/^EXPLAIN\b/m);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("captures queries for eager-loaded associations, one block per query", async () => {
    const plan = await Car.all().preload(":bulbs").explain().inspect();
    const blocks = plan.split(/^(?=EXPLAIN)/m).filter((b) => /EXPLAIN/.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan.toLowerCase()).toContain("cars");
    expect(plan.toLowerCase()).toContain("bulbs");
  });

  it("resets ExplainRegistry after the call (no leaked collection state)", async () => {
    await Car.all().explain().inspect();
    expect(ExplainRegistry.collect).toBe(false);
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("does not load the relation as a side effect", async () => {
    const relation = Car.where({ name: "honda" });
    await relation.explain().inspect();
    expect(relation.isLoaded).toBe(false);
  });

  it("yields empty output for a query-less relation", async () => {
    const plan = await Car.none().explain().inspect();
    expect(plan).toBe("");
  });

  it("yields empty output for a contradiction relation", async () => {
    const plan = await Car.where({ id: [] }).explain().inspect();
    expect(plan).toBe("");
  });

  it("renders binds via adapter.typeCast + Ruby-inspect form", async () => {
    const connection = await Base.leaseConnection();
    const rendered = rbInspect(
      [BigInt(42), "str", 7, null, true, false].map((b) => renderBind(connection, b)),
    );
    expect(rendered.startsWith('[[nil, 42], [nil, "str"], [nil, 7], [nil, nil], ')).toBe(true);
    expect(rendered).toMatch(/\[nil, (1\], \[nil, 0|true\], \[nil, false)\]\]$/);
    const plan = await Car.all().explain().inspect();
    expect(plan.length).toBeGreaterThan(0);
  });

  it("normalizes Date binds — invalid Dates render as 'Invalid Date'", () => {
    const stub = { typeCast: (v: unknown) => v } as unknown as DatabaseAdapter;
    expect(renderBind(stub, new Date("2026-04-15T12:00:00.000Z"))[1]).toBe(
      "2026-04-15T12:00:00.000Z",
    );
    expect(renderBind(stub, new Date(NaN))[1]).toBe("Invalid Date");
  });

  it("renders binary binds as '<N bytes of binary data>' (Rails parity)", async () => {
    const stub = { typeCast: (v: unknown) => v } as unknown as DatabaseAdapter;
    const buf = Buffer.from("hello world");
    const u8 = new Uint8Array([1, 2, 3, 4, 5]);
    const rendered = rbInspect([buf, u8].map((b) => renderBind(stub, b)));
    expect(rendered).toBe(
      '[[nil, "<11 bytes of binary data>"], [nil, "<5 bytes of binary data>"]]',
    );
  });

  it("unwraps PG-style { value, format } bind shapes when rendering", async () => {
    const stub = {
      typeCast: (v: unknown) => v,
    } as unknown as DatabaseAdapter;
    const rendered = rbInspect(
      [
        { value: "raw", format: 1 },
        { value: 42, format: 0 },
      ].map((b) => renderBind(stub, b)),
    );
    expect(rendered).toBe('[[nil, "raw"], [nil, 42]]');
  });

  it("isolates concurrent explain() calls via AsyncLocalStorage scopes", async () => {
    const [plan1, plan2] = await Promise.all([
      new Thread(async () => Car.where({ name: "honda" }).explain().inspect()).value(),
      new Thread(async () => Car.all().explain().inspect()).value(),
    ]);
    expect(plan1.length).toBeGreaterThan(0);
    expect(plan2.length).toBeGreaterThan(0);
    expect(plan1.toLowerCase()).toContain("where");
    expect(plan2.toLowerCase()).not.toContain("where");
  });
});
