import { afterEach, describe, expect, it } from "vitest";
import { Base } from "../../base.js";
import { TemplateHandlers } from "../handlers.js";
import { Tse, type TseImplementation } from "./tse.js";

const ctx = () => ({ controller: "home", action: "index", format: "html" });

describe("Template::Handlers::Tse", () => {
  const originalImpl = Tse.implementation;
  const originalEscapeIgnore = Tse.escapeIgnoreList;
  const originalStrip = Tse.stripTrailingNewlines;
  const originalTrim = Tse.trimMode;
  const originalAnnotate = Base.annotateRenderedViewWithFilenames;

  afterEach(() => {
    Tse.implementation = originalImpl;
    Tse.escapeIgnoreList = originalEscapeIgnore;
    Tse.stripTrailingNewlines = originalStrip;
    Tse.trimMode = originalTrim;
    Base.annotateRenderedViewWithFilenames = originalAnnotate;
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

  it("render() executes the compiled template and returns its output", () => {
    const out = new Tse().render("<%= 1 + 1 %>", {}, ctx());
    expect(out).toBe("2");
  });

  it("render() resolves bare identifiers against the locals", () => {
    const out = new Tse().render("<h1><%= title %></h1>", { title: "Home" }, ctx());
    expect(out).toBe("<h1>Home</h1>");
  });

  it("render() escapes an unsafe local", () => {
    const out = new Tse().render("<%= body %>", { body: "<script>" }, ctx());
    expect(out).toBe("&lt;script&gt;");
  });

  it("render() runs template control flow", () => {
    const out = new Tse().render(
      "<% for (const n of names) { %><li><%= n %></li><% } %>",
      { names: ["a", "b"] },
      ctx(),
    );
    expect(out).toBe("<li>a</li><li>b</li>");
  });

  it("render() substitutes a layout's yield with the inner output", () => {
    const out = new Tse().render(
      "<body><%= yield %></body>",
      {},
      {
        ...ctx(),
        yield: "<p>inner</p>",
      },
    );
    expect(out).toBe("<body><p>inner</p></body>");
  });

  it("render() delegates a nested partial to the context's renderPartial", () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    const out = new Tse().render(
      '<%= render({ partial: "tweet", locals: { tweet: 7 } }) %>',
      {},
      {
        ...ctx(),
        renderPartial(name, locals) {
          seen.push([name, locals]);
          return "<article>7</article>";
        },
      },
    );
    expect(out).toBe("<article>7</article>");
    expect(seen).toEqual([["tweet", { tweet: 7 }]]);
  });

  it("render() explains itself when a nested partial has no renderPartial", () => {
    expect(() => new Tse().render('<%= render({ partial: "tweet" }) %>', {}, ctx())).toThrow(
      /has no partial renderer/,
    );
  });

  it("Tse.call delegates to a fresh instance", () => {
    const code = Tse.call({ type: "text/html" }, "<%= name %>");
    expect(code).toMatch(/_ob\.append\(name\)/);
  });

  describe("translateLocation", () => {
    it("anchors a compiled spot to the source-line column (Rails parity)", () => {
      // Snippet matches what @blazetrails/tse-compiler actually emits for
      // `<%= name %>` (see emit-js.ts + parser.ts trim) so the test exercises
      // the real anchoring path, not a fabricated one.
      const source = "<h1>hi</h1>\n<%= name %>\n";
      const spot = {
        snippet: "_ob.append(name);",
        firstLineno: 2,
        lastLineno: 2,
        firstColumn: 11,
        lastColumn: 15,
      };
      const out = new Tse().translateLocation(spot, { lineno: 2 }, source);
      expect(out).not.toBeNull();
      expect(out!.scriptLines).toEqual(["<h1>hi</h1>\n", "<%= name %>\n"]);
      expect(out!.firstLineno).toBe(2);
    });

    it("returns null when backtrace lineno is past EOF", () => {
      const spot = {
        snippet: "_ob.append(x);",
        firstLineno: 1,
        lastLineno: 1,
        firstColumn: 0,
        lastColumn: 1,
      };
      expect(new Tse().translateLocation(spot, { lineno: 99 }, "a\nb\n")).toBeNull();
    });

    it("returns null when the snippet can't be anchored against source tokens", () => {
      const spot = {
        snippet: "totally-unrelated",
        firstLineno: 1,
        lastLineno: 1,
        firstColumn: 0,
        lastColumn: 1,
      };
      expect(new Tse().translateLocation(spot, { lineno: 1 }, "<%= name %>")).toBeNull();
    });
  });

  describe("annotateRenderedViewWithFilenames", () => {
    it("defaults to false — no annotation comments emitted", () => {
      const code = new Tse().call(
        { type: "text/html", format: "html", shortIdentifier: "app/views/posts/show.html.tse" },
        "<h1>hi</h1>",
      );
      expect(code).not.toContain("BEGIN");
      expect(code).not.toContain("END");
    });

    it("wraps html output with BEGIN/END comments when enabled", () => {
      Base.annotateRenderedViewWithFilenames = true;
      const id = "app/views/posts/show.html.tse";
      const code = new Tse().call(
        { type: "text/html", format: "html", shortIdentifier: id },
        "<h1>hi</h1>",
      );
      expect(code).toContain(`_ob.safeAppend("<!-- BEGIN ${id} -->");`);
      expect(code).toContain(`_ob.safeAppend("<!-- END ${id} -->");`);
      // BEGIN before END
      expect(code.indexOf("BEGIN")).toBeLessThan(code.indexOf("END"));
    });

    it("does not annotate non-html formats (json)", () => {
      Base.annotateRenderedViewWithFilenames = true;
      const code = new Tse().call(
        {
          type: "application/json",
          format: "json",
          shortIdentifier: "app/views/posts/show.json.tse",
        },
        "<%= data %>",
      );
      expect(code).not.toContain("BEGIN");
    });

    it("does not annotate non-html formats (text/plain)", () => {
      Base.annotateRenderedViewWithFilenames = true;
      const code = new Tse().call(
        { type: "text/plain", format: "text", shortIdentifier: "app/views/mailer/body.text.tse" },
        "hello",
      );
      expect(code).not.toContain("BEGIN");
    });

    it("does not annotate when shortIdentifier is absent", () => {
      Base.annotateRenderedViewWithFilenames = true;
      const code = new Tse().call({ type: "text/html", format: "html" }, "<h1>hi</h1>");
      expect(code).not.toContain("BEGIN");
    });

    it("annotation appears inside the render function body", () => {
      Base.annotateRenderedViewWithFilenames = true;
      const id = "app/views/posts/index.html.tse";
      const code = new Tse().call(
        { type: "text/html", format: "html", shortIdentifier: id },
        "<p>items</p>",
      );
      const fnStart = code.indexOf("export default function render");
      const beginPos = code.indexOf("BEGIN");
      const endPos = code.indexOf("END");
      const fnEnd = code.lastIndexOf("}");
      expect(beginPos).toBeGreaterThan(fnStart);
      expect(endPos).toBeLessThan(fnEnd);
    });
  });

  it("registers against the .tse extension via Template::Handlers", () => {
    const tse = new Tse();
    TemplateHandlers.registerTemplateHandler("tse", tse);
    expect(TemplateHandlers.handlerForExtension("tse")).toBe(tse);
  });
});
