import { describe, it, expect } from "vitest";
import { compileJs } from "./emit-js.js";

describe("compileJs", () => {
  it("emits a render function with the Rails-shaped dispatch", () => {
    const { code } = compileJs("<h1><%= name %></h1>");
    expect(code).toBe(
      [
        "export default function render(context, locals) {",
        "  const _ob = context.outputBuffer;",
        '  _ob.safeAppend("<h1>");',
        "  _ob.append(name);",
        '  _ob.safeAppend("</h1>");',
        "  return _ob;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("dispatches expression sites by escape mode and indicator", () => {
    expect(compileJs("<%= n %>").code).toContain("_ob.append(n);");
    expect(compileJs("<%= n %>", { escapeIgnore: true }).code).toContain("_ob.safeExprAppend(n);");
    expect(compileJs("<%== n %>").code).toContain("_ob.safeExprAppend(n);");
    expect(compileJs("<% const x = 1 %>").code).toContain("const x = 1;");
  });
});
