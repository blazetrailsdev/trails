import { describe, it, expect, vi } from "vitest";
import { SafeBuffer } from "@blazetrails/activesupport";
import { debug } from "./debug-helper.js";
import * as yaml from "@blazetrails/activesupport/yaml";

describe("DebugHelperTest", () => {
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
    const spy = vi.spyOn(yaml, "stringify").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const out = debug({ html: "<b>x</b>" }).toString();
      expect(out).toContain('<code class="debug_dump">');
      expect(out).toContain("</code>");
      expect(out).not.toContain("<pre");
    } finally {
      spy.mockRestore();
    }
  });
});
