import { describe, it, expect, vi, afterEach } from "vitest";
import "../test-helpers/active-record-unit.js";
import * as ActiveRecord from "@blazetrails/activerecord";
import { SafeBuffer, assertMatch } from "@blazetrails/activesupport";
import { Company } from "../test-helpers/fixtures/company.js";
import { rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { debug as _debug } from "../helpers/debug-helper.js";
import { Base } from "../base.js";

const view = new (Base.withEmptyTemplateCache())(null, {}, null);
const debug = _debug.bind(view);
import { Psych } from "@blazetrails/ruby-compat/psych";
import { LoadError } from "@blazetrails/ruby-compat";

describe("DebugHelperTest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debug", async () => {
    const pool = ActiveRecord.Base.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    const company = new Company({ name: "firebase" });
    const output = debug(company).toString();
    assertMatch("name: name", output);
    assertMatch("value_before_type_cast: firebase", output);
    assertMatch("active_record_yaml_version: 2", output);
  });

  it("debug with marshal error", () => {
    const obj = () => {};
    assertMatch("[Function: obj]", debug(obj).toString());
  });

  it("returns a SafeBuffer marked html_safe", () => {
    const out = debug({ a: 1 });
    expect(out).toBeInstanceOf(SafeBuffer);
    expect(out.htmlSafe).toBe(true);
  });

  it("escapes HTML in YAML output", () => {
    const out = debug({ html: "<script>alert(1)</script>" }).toString();
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("test_debug_with_marshal_error falls back to inspect inside code", () => {
    vi.spyOn(Psych, "dump").mockImplementation(() => {
      throw new Error("boom");
    });
    const out = debug({ html: "<b>x</b>" }).toString();
    expect(out).toContain('<code class="debug_dump">');
    expect(out).toContain("</code>");
    expect(out).not.toContain("<pre");
  });

  it("falls back to inspect when Marshal.dump refuses the object", () => {
    const stringify = vi.spyOn(Psych, "dump");
    expect(debug(() => {}).toString()).toContain('<code class="debug_dump">');

    class Company {
      name = "firebase";
    }
    const company = new Company();
    Object.assign(rbObjSingletonClass(company).prototype, { area: () => 1 });
    const out = debug(company).toString();
    expect(out).toContain('<code class="debug_dump">');
    expect(out).toContain("name: &quot;firebase&quot;");
    expect(stringify).not.toHaveBeenCalled();
  });

  it("fallback inspect renders shared (non-cyclic) refs normally, not as Circular", () => {
    vi.spyOn(Psych, "dump").mockImplementation(() => {
      throw new Error("boom");
    });
    const shared = { id: 1 };
    const out = debug({ a: shared, b: shared }).toString();
    expect(out).not.toContain("[Circular]");
    expect(out).toContain("a: { id: 1 }");
    expect(out).toContain("b: { id: 1 }");
  });

  it("fallback inspect renders circular references as [Circular]", () => {
    vi.spyOn(Psych, "dump").mockImplementation(() => {
      throw new Error("boom");
    });
    const circular: Record<string, unknown> = { name: "x" };
    circular.self = circular;
    const out = debug(circular).toString();
    expect(out).toContain("[Circular]");
    expect(out).toContain("name:");
  });

  it("raises a LoadError from to_yaml instead of falling back to inspect", () => {
    vi.spyOn(Psych, "dump").mockImplementation(() => {
      throw new LoadError("cannot load such file -- yaml");
    });
    expect(() => debug({ a: 1 })).toThrow(LoadError);
  });
});
