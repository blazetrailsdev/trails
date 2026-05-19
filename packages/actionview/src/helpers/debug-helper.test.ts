import { describe, it, expect, vi, afterEach } from "vitest";
import { SafeBuffer } from "@blazetrails/activesupport";
import { debug } from "./debug-helper.js";
import * as yaml from "@blazetrails/activesupport/yaml";

describe("DebugHelperTest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("test_debug", () => {
    const obj = { name: "firebase", count: 42 };
    const output = debug(obj).toString();
    expect(output).toContain('<pre class="debug_dump">');
    expect(output).toContain("name: firebase");
    expect(output).toContain("count: 42");
    expect(output).toContain("</pre>");
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
    vi.spyOn(yaml, "stringify").mockImplementation(() => {
      throw new Error("boom");
    });
    const out = debug({ html: "<b>x</b>" }).toString();
    expect(out).toContain('<code class="debug_dump">');
    expect(out).toContain("</code>");
    expect(out).not.toContain("<pre");
  });

  it("fallback inspect renders shared (non-cyclic) refs normally, not as Circular", () => {
    vi.spyOn(yaml, "stringify").mockImplementation(() => {
      throw new Error("boom");
    });
    const shared = { id: 1 };
    const out = debug({ a: shared, b: shared }).toString();
    expect(out).not.toContain("[Circular]");
    expect(out).toContain("a: { id: 1 }");
    expect(out).toContain("b: { id: 1 }");
  });

  it("fallback inspect renders circular references as [Circular]", () => {
    vi.spyOn(yaml, "stringify").mockImplementation(() => {
      throw new Error("boom");
    });
    const circular: Record<string, unknown> = { name: "x" };
    circular.self = circular;
    const out = debug(circular).toString();
    expect(out).toContain("[Circular]");
    expect(out).toContain("name:");
  });
});
