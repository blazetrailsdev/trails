import { afterEach, describe, expect, it } from "vitest";
import { TemplateHandlers } from "../handlers.js";
import { Tse, type TseImplementation } from "./tse.js";

describe("Template::Handlers::Tse", () => {
  const originalImpl = Tse.implementation;
  const originalEscapeIgnore = Tse.escapeIgnoreList;
  const originalStrip = Tse.stripTrailingNewlines;
  const originalTrim = Tse.trimMode;

  afterEach(() => {
    Tse.implementation = originalImpl;
    Tse.escapeIgnoreList = originalEscapeIgnore;
    Tse.stripTrailingNewlines = originalStrip;
    Tse.trimMode = originalTrim;
    TemplateHandlers.clear();
  });

  it("supports the streaming protocol", () => {
    expect(new Tse().supportsStreaming()).toBe(true);
  });

  it("handles encoding", () => {
    expect(new Tse().handlesEncoding()).toBe(true);
  });

  it("defaults trimMode to '-'", () => {
    expect(Tse.trimMode).toBe("-");
  });

  it("defaults escapeIgnoreList to ['text/plain']", () => {
    expect(Tse.escapeIgnoreList).toEqual(["text/plain"]);
  });

  it("defaults stripTrailingNewlines to false", () => {
    expect(Tse.stripTrailingNewlines).toBe(false);
  });

  it("compiles a static template to a JS render module", () => {
    const code = new Tse().call({ type: "text/html" }, "<h1>hi</h1>");
    expect(code).toContain("export default function render");
    expect(code).toContain("safeAppend");
    expect(code).toContain("<h1>hi</h1>");
  });

  it("emits the escaping append for html templates", () => {
    const code = new Tse().call({ type: "text/html" }, "<%= name %>");
    expect(code).toMatch(/_ob\.append\(name\)/);
  });

  it("emits the non-escaping append for templates in escapeIgnoreList", () => {
    const code = new Tse().call({ type: "text/plain" }, "<%= name %>");
    expect(code).toMatch(/_ob\.safeExprAppend\(name\)/);
  });

  it("treats unknown template.type as escaping (not in ignore list)", () => {
    const code = new Tse().call({ type: "application/json" }, "<%= name %>");
    expect(code).toMatch(/_ob\.append\(name\)/);
  });

  it("treats missing template.type as escaping", () => {
    const code = new Tse().call({}, "<%= name %>");
    expect(code).toMatch(/_ob\.append\(name\)/);
  });

  it("strips a single trailing newline when stripTrailingNewlines is enabled", () => {
    const captured: string[] = [];
    Tse.implementation = ((source: string) => {
      captured.push(source);
      return { code: "", localsSignature: null, typesAnnotation: null };
    }) as TseImplementation;

    Tse.stripTrailingNewlines = true;
    new Tse().call({ type: "text/html" }, "hello\n");
    expect(captured[0]).toBe("hello");

    Tse.stripTrailingNewlines = false;
    new Tse().call({ type: "text/html" }, "hello\n");
    expect(captured[1]).toBe("hello\n");
  });

  it("stripTrailingNewlines chomps \\n, \\r\\n, and lone \\r like Ruby String#chomp", () => {
    const captured: string[] = [];
    Tse.implementation = ((source: string) => {
      captured.push(source);
      return { code: "", localsSignature: null, typesAnnotation: null };
    }) as TseImplementation;
    Tse.stripTrailingNewlines = true;

    new Tse().call({ type: "text/html" }, "a\n");
    new Tse().call({ type: "text/html" }, "b\r\n");
    new Tse().call({ type: "text/html" }, "c\r");
    expect(captured).toEqual(["a", "b", "c"]);
  });

  it("delegates compilation to the swappable implementation", () => {
    const calls: Array<{ source: string; escapeIgnore: boolean | undefined }> = [];
    Tse.implementation = ((source, options) => {
      calls.push({ source, escapeIgnore: options?.escapeIgnore });
      return { code: "STUB", localsSignature: null, typesAnnotation: null };
    }) as TseImplementation;

    const out = new Tse().call({ type: "text/plain" }, "src");
    expect(out).toBe("STUB");
    expect(calls).toEqual([{ source: "src", escapeIgnore: true }]);
  });

  it("normalizes a format-token template.type ('text') to MIME before the escapeIgnoreList check", () => {
    const code = new Tse().call({ type: "text" }, "<%= name %>");
    expect(code).toMatch(/_ob\.safeExprAppend\(name\)/);
  });

  it("render() throws — execution lands in Phase 2c", () => {
    expect(() =>
      new Tse().render("<%= 1 %>", {}, { controller: "c", action: "a", format: "html" }),
    ).toThrow(/not yet implemented/);
  });

  it("Tse.call mirrors `Handlers::ERB.call` and delegates to a fresh instance", () => {
    const code = Tse.call({ type: "text/html" }, "<%= name %>");
    expect(code).toMatch(/_ob\.append\(name\)/);
  });

  it("registers against the .tse extension via Template::Handlers", () => {
    const tse = new Tse();
    TemplateHandlers.registerTemplateHandler("tse", tse);
    expect(TemplateHandlers.handlerForExtension("tse")).toBe(tse);
  });
});
