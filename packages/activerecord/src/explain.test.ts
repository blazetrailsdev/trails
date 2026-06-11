/**
 * Mirrors: activerecord/test/cases/explain_test.rb
 *
 * Rails guards the whole suite on `supports_explain?` and rides
 * `fixtures :cars` + the canonical `Car` model. Our `explain()` resolves to
 * the rendered query-plan string rather than Rails' chainable proxy, so the
 * per-aggregate tests assert the plan string (Rails' `assert_match(/^EXPLAIN/`)
 * and exercise the matching aggregate alongside it.
 */
import { describe, it, expect } from "vitest";
import { Base, ExplainRegistry, registerModel } from "./index.js";
import { itIfSupports } from "./test-helpers/supports.js";
import type { DatabaseAdapter } from "./adapter.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb } from "./test-helpers/models/bulb.js";

registerModel(Car);
registerModel(Bulb);

describe("ExplainTest", () => {
  useHandlerFixtures(["cars", "bulbs"], { schema: canonicalSchema });

  itIfSupports("explain", "relation explain", async () => {
    const message = await Car.where({ name: "honda" }).explain();
    expect(message).toMatch(/EXPLAIN/i);
  });

  itIfSupports("explain", "collecting queries for explain", async () => {
    const message = await Car.where({ name: "honda" }).explain();
    expect(typeof message).toBe("string");
    expect(message.toLowerCase()).toContain("select");
  });

  itIfSupports("explain", "relation explain with average", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await Car.average("id"))).toBe("number");
  });

  itIfSupports("explain", "relation explain with count", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await Car.count())).toBe("number");
  });

  itIfSupports("explain", "relation explain with count and argument", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await (Car as any).count("id"))).toBe("number");
  });

  itIfSupports("explain", "relation explain with minimum", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await Car.minimum("id"))).toBe("number");
  });

  itIfSupports("explain", "relation explain with maximum", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await Car.maximum("id"))).toBe("number");
  });

  itIfSupports("explain", "relation explain with sum", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(typeof (await Car.sum("id"))).toBe("number");
  });

  itIfSupports("explain", "relation explain with first", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(await Car.first()).not.toBeNull();
  });

  itIfSupports("explain", "relation explain with last", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(await Car.last()).not.toBeNull();
  });

  itIfSupports("explain", "relation explain with pluck", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    expect(await Car.pluck("name")).toContain("honda");
  });

  itIfSupports("explain", "relation explain with pluck with args", async () => {
    const plan = await Car.all().explain();
    expect(plan).toMatch(/EXPLAIN/i);
    const values = await Car.pluck("id", "name");
    expect(values.length).toBeGreaterThan(0);
  });

  itIfSupports("explain", "exec explain with no binds", async () => {
    const plan = await Car.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  itIfSupports("explain", "exec explain with binds", async () => {
    const plan = await Car.where({ name: "honda" }).explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("explain returns query plan string (Rails-guided)", async () => {
    const plan = await Car.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("prints one EXPLAIN block per collected query with the header prefix", async () => {
    const plan = await Car.where({ name: "honda" }).explain();
    expect(plan).toMatch(/EXPLAIN.*for:/);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("captures queries for eager-loaded associations, one block per query", async () => {
    const plan = await Car.all().preload("bulbs").explain();
    const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan.toLowerCase()).toContain("cars");
    expect(plan.toLowerCase()).toContain("bulbs");
  });

  it("resets ExplainRegistry after the call (no leaked collection state)", async () => {
    await Car.all().explain();
    expect(ExplainRegistry.collect).toBe(false);
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("falls back to explaining toSql when no queries were collected", async () => {
    // `none()` short-circuits before any SQL runs — collectingQueries
    // captures nothing. The fallback should still produce a non-empty
    // plan instead of a silent empty string.
    const plan = await Car.none().explain();
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("renders binds via adapter.typeCast + Ruby-inspect form", async () => {
    // Mirrors Rails' `exec_explain`:
    //   binds.map { |attr| render_bind(c, attr) }.inspect
    // where `render_bind` does
    // `connection.type_cast(attr.value_for_database)`. That produces
    // Ruby's `Array#inspect` output: strings double-quoted, numbers
    // bare, nil as `nil`, booleans as `true/false`. The BigInt case
    // is the one that used to crash raw `JSON.stringify`.
    const rel = Car.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    // Booleans go through the adapter's typeCast: SQLite collapses
    // them to 1/0, PG/MySQL keep them as true/false. So the rendered
    // form differs by backend; assert both halves independently.
    const rendered = rel._renderExplainBinds(Base.connection, [
      BigInt(42),
      "str",
      7,
      null,
      true,
      false,
    ]);
    expect(rendered.startsWith('[42, "str", 7, nil, ')).toBe(true);
    expect(rendered).toMatch(/\b(1, 0|true, false)\]$/);
    // End-to-end on sqlite: where-literals are interpolated into the
    // SQL (no binds reach the adapter), so the round-trip still
    // returns non-empty output.
    const plan = await Car.all().explain();
    expect(plan.length).toBeGreaterThan(0);
  });

  it("normalizes Date binds — invalid Dates render as 'Invalid Date'", () => {
    // _normalizeExplainBindValue is reached directly only when a caller bypasses
    // the adapter typeCast (which rejects raw Date post-PR-6); the branch still
    // exists as a defensive boundary handler for legacy / test code paths.
    const rel = Car.all() as unknown as {
      _normalizeExplainBindValue: (v: unknown) => unknown;
    };
    expect(rel._normalizeExplainBindValue(new Date("2026-04-15T12:00:00.000Z"))).toBe(
      "2026-04-15T12:00:00.000Z",
    );
    expect(rel._normalizeExplainBindValue(new Date(NaN))).toBe("Invalid Date");
  });

  it("renders binary binds as '<N bytes of binary data>' (Rails parity)", async () => {
    // Rails' `render_bind` special-cases binary-typed attrs:
    //   "<#{attr.value_for_database.to_s.bytesize} bytes of binary data>"
    // We reach the same result structurally — after typeCast, any
    // Buffer / Uint8Array / ArrayBuffer bind gets normalized to the
    // same byte-count string before rubyInspect sees it, so an
    // EXPLAIN over a BYTEA/BLOB column doesn't dump the raw buffer.
    const rel = Car.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    const buf = Buffer.from("hello world"); // 11 bytes
    const u8 = new Uint8Array([1, 2, 3, 4, 5]); // 5 bytes
    const rendered = rel._renderExplainBinds(Base.connection, [buf, u8]);
    expect(rendered).toBe('["<11 bytes of binary data>", "<5 bytes of binary data>"]');
  });

  it("unwraps PG-style { value, format } bind shapes when rendering", async () => {
    // PG's `typeCast(BinaryData)` returns `{ value, format }` — the
    // raw wrapper would stringify to "[object Object]" via
    // `rubyInspect`'s object fallback. Normalization recurses on
    // `.value` so we show the actual payload instead of the envelope.
    const rel = Car.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    // Skip typeCast here — we're testing the normalization of a
    // pre-cast bind-wrapper value. The inner adapter.typeCast call
    // would pass these objects through unchanged on non-PG adapters.
    const stub = {
      typeCast: (v: unknown) => v,
    } as unknown as DatabaseAdapter;
    const rendered = rel._renderExplainBinds(stub, [
      { value: "raw", format: 1 },
      { value: 42, format: 0 },
    ]);
    expect(rendered).toBe('["raw", 42]');
  });

  it("rejects multiple hash options (Rails extract_options! semantics)", async () => {
    await expect(Car.all().explain({ format: "json" }, { format: "xml" } as never)).rejects.toThrow(
      /at most one option hash/,
    );
  });

  it("rejects a non-trailing hash option", async () => {
    await expect(Car.all().explain({ format: "json" } as never, "analyze")).rejects.toThrow(
      /last argument/,
    );
  });

  it("isolates concurrent explain() calls via AsyncLocalStorage scopes", async () => {
    // Two parallel explain() calls must not trample each other's
    // collected queries. Without async-context isolation a global
    // collect flag + shared queries array leaks across the await
    // boundaries of concurrent tasks.
    const [plan1, plan2] = await Promise.all([
      Car.where({ name: "honda" }).explain(),
      Car.all().explain(),
    ]);
    expect(plan1.length).toBeGreaterThan(0);
    expect(plan2.length).toBeGreaterThan(0);
    // plan1's SELECT had a WHERE clause; plan2's did not. Each plan's
    // header block should reference only its own SQL.
    expect(plan1.toLowerCase()).toContain("where");
    expect(plan2.toLowerCase()).not.toContain("where");
  });
});
