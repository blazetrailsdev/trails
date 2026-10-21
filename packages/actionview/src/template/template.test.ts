import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@blazetrails/actionpack";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, Marshal } from "@blazetrails/ruby-compat";
import { SafeBuffer } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { StrictLocalsError } from "./error.js";
import { TemplateHandlers, type TemplateHandler } from "./handlers.js";
import { Raw } from "./handlers/raw.js";
import { Tse, type Spot } from "./handlers/tse.js";

describe("TestTSETemplate", () => {
  afterEach(() => TemplateHandlers.clear());

  const TSEHandler = new Tse();

  class Context extends Base {
    constructor(...args: ConstructorParameters<typeof Base>) {
      super(...args);
      this.outputBuffer!.append("original");
      this.virtualPath = null;
    }

    get hello(): string {
      return "Hello";
    }

    get apostrophe(): string {
      return "l'apostrophe";
    }

    get partial(): Template {
      return new Template("<%= virtualPath %>", "partial", TSEHandler, {
        virtualPath: "partial",
        format: "html",
        locals: [],
      });
    }

    myBuffer(): SafeBuffer {
      return this.outputBuffer!.toString();
    }
  }

  let template: Template;
  let context: Context;

  const newTemplate = (
    body = "<%= hello %>",
    details: Partial<{
      format: string;
      locals: string[];
      virtualPath: string | null;
      handler: TemplateHandler;
    }> = {},
  ): Template => {
    const { handler, ...rest } = { format: "html", locals: [] as string[], ...details };
    return new Template(body, "hello template", handler ?? TSEHandler, {
      virtualPath: "hello",
      ...rest,
    });
  };

  const render = async (
    locals: Record<string, unknown> = {},
    implicitLocals: readonly string[] = [],
  ): Promise<unknown> => {
    const result = await template.render(context, locals, null, { implicitLocals });
    return result instanceof SafeBuffer ? result.toString() : result;
  };

  const spotHighlight = (
    compiled: string,
    highlight: string,
    { firstColumn, ...options }: Partial<Spot> = {},
  ): Spot => {
    firstColumn ??= compiled.lastIndexOf(highlight) === -1 ? 999 : compiled.lastIndexOf(highlight);
    const lastColumn = firstColumn + highlight.length;
    const spot: Spot = {
      firstColumn,
      lastColumn,
      snippet: compiled,
      firstLineno: 1,
      lastLineno: 1,
      scriptLines: compiled.split(/(?<=\n)/),
    };
    Object.assign(spot, options);
    return spot;
  };

  beforeEach(() => {
    context = Context.withEmptyTemplateCache().empty() as Context;
  });

  it("basic template", async () => {
    template = newTemplate();
    expect(await render()).toBe("Hello");
  });

  it("basic template does html escape", async () => {
    template = newTemplate("<%= apostrophe %>");
    expect(await render()).toBe("l&#39;apostrophe");
  });

  it("text template does not html escape", async () => {
    template = newTemplate("<%= apostrophe %> <%== apostrophe %>", { format: "text" });
    expect(await render()).toBe("l'apostrophe l'apostrophe");
  });

  it("raw template", async () => {
    template = newTemplate("<%= hello %>", { handler: new Raw() });
    expect(await render()).toBe("<%= hello %>");
  });

  it("template does not lose its source after rendering", async () => {
    template = newTemplate();
    await render();
    expect(template.source).toBe("<%= hello %>");
  });

  it("template does not lose its source after rendering if it does not have a virtual path", async () => {
    template = newTemplate("Hello", { virtualPath: null });
    await render();
    expect(template.source).toBe("Hello");
  });

  it("locals", async () => {
    template = newTemplate("<%= my_local %>", { locals: ["my_local"] });
    expect(await render({ my_local: "I am a local" })).toBe("I am a local");
  });

  it("restores buffer", async () => {
    template = newTemplate();
    expect(await render()).toBe("Hello");
    expect(String(context.myBuffer())).toBe("original");
  });

  it("virtual path", async () => {
    template = newTemplate(
      "<%= virtualPath %>" + "<%= await partial.render(this, {}) %>" + "<%= virtualPath %>",
    );
    expect(await render()).toBe("hellopartialhello");
  });

  it("rendering non string", async () => {
    const myObject = {};
    const evalHandler: TemplateHandler = {
      call: (_template: unknown, source: string) => `return ${source};`,
    };
    template = new Template("my_object", "__id__", evalHandler, {
      virtualPath: "hello",
      locals: ["my_object"],
    });
    const result = await render({ my_object: myObject });
    expect(result).toBe(myObject);
  });

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the assertion is `render.encoding`.
  it.skip("resulting string is utf8", async () => {
    template = newTemplate();
    expect((await render()) as string).toBeTypeOf("string");
  });

  it("no magic comment word with utf 8", async () => {
    template = newTemplate("hello \u{fc}mlat");
    expect(await render()).toBe("hello \u{fc}mlat");
  });

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the source is a binary String under a non-UTF-8 default_external.
  it.skip("default external works", () => {});

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the magic comment re-tags a binary String.
  it.skip("encoding can be specified with magic comment", () => {});

  it("locals can be disabled", async () => {
    const error = await assertRaises([Template.Error], {}, async () => {
      template = newTemplate("<%# locals: () -%>");
      await render({ foo: "bar" });
    });
    expect(error.message).toMatch(/no locals accepted for hello template/);
  });

  it("locals can not be specified with positional arguments", async () => {
    const error = await assertRaises([Template.Error], {}, async () => {
      template = newTemplate("<%# locals: (foo) -%>");
      await render({ foo: "bar" });
    });
    expect(error.message).toMatch(/`foo` set as non-keyword argument/);
  });

  it("locals can be specified with splat arguments", async () => {
    template = newTemplate("<%# locals: (**etc) -%><%= etc.foo %>");
    expect(await render({ foo: "bar" })).toBe("bar");
  });

  it("locals can be specified with keyword and splat arguments", async () => {
    template = newTemplate(
      "<%# locals: (id:, **attributes) -%>\n<%= tag().hr({ id: id, ...attributes }) %>",
    );
    expect(await render({ id: 1, class: "h-1" })).toBe('<hr id="1" class="h-1">');
  });

  it("locals cannot be specified with positional arguments", async () => {
    template = newTemplate("<%# locals: (argument = 'content') -%>\n<%= argument %>");
    await expect(render()).rejects.toThrow(
      "`argument` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("locals cannot be specified with block arguments", async () => {
    template = newTemplate("<%# locals: (&block) -%>\n<%= tag.div(block) %>");
    await expect(render()).rejects.toThrow(
      "`block` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("locals can be specified", async () => {
    template = newTemplate("<%# locals: (message:) -%>\n<%= message %>");
    expect(await render({ message: "Hello" })).toBe("Hello");
  });

  it("default locals can be specified", async () => {
    template = newTemplate("<%# locals: (message: 'Hello') -%>\n<%= message %>");
    expect(await render()).toBe("Hello");
  });

  it("required locals must be specified", async () => {
    const error = await assertRaises([Template.Error], {}, async () => {
      template = newTemplate("<%# locals: (message:) -%>");
      await render();
    });
    expect(error.message).toMatch(/missing local: :message for hello template/);
    expect(error.cause).toBeInstanceOf(StrictLocalsError);
  });

  it("extra locals raises strict locals error", async () => {
    const error = await assertRaises([Template.Error], {}, async () => {
      template = newTemplate("<%# locals: (message:) -%>");
      await render({ message: "Hi", foo: "bar" });
    });
    expect(error.message).toMatch(/unknown local: :foo for hello template/);
    expect(error.cause).toBeInstanceOf(StrictLocalsError);
  });

  it("argument error in the template is not hijacked by strict locals checking", async () => {
    const error = await assertRaises([Template.Error], {}, async () => {
      template = newTemplate(
        '<%# locals: () -%>\n<%= (function hello() { throw new ArgumentError("wrong number of arguments (given 1, expected 0)"); })("invalid_argument") %>',
      );
      await render();
    });
    expect(error.cause.stack!.split("\n")[1]).toMatch(/at (?:\S+\.)?hello\b/);
    expect(error.cause).toBeInstanceOf(ArgumentError);
  });

  it("rails injected locals does not raise error if not passed", async () => {
    template = newTemplate("<%# locals: (message:) -%>");
    await assertNothingRaised(() =>
      render({ message: "Hi", message_counter: 1, message_iteration: 1 }, [
        "message_counter",
        "message_iteration",
      ]),
    );
  });

  it("rails injected locals can be specified", async () => {
    template = newTemplate("<%# locals: (message: 'Hello') -%>\n<%= message %>");
    expect(await render({ message: "Hello" }, ["message"])).toBe("Hello");
  });

  it("rails local assigns and strict locals", async () => {
    template = newTemplate('<%# locals: (class: ) -%>\n<%= localAssigns["class"] %>');
    expect(await render({ class: "some-class" }, ["message"])).toBe("some-class");
  });

  it("rails injected locals can be specified as kwargs", async () => {
    template = newTemplate(
      "<%# locals: (message: 'Hello', **kwargs) -%>\n<%= kwargs.message_counter %>-<%= kwargs.message_iteration %>",
    );
    expect(
      await render({ message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("1-2");
  });

  it("rails injected locals can be specified as required argument", async () => {
    template = newTemplate(
      "<%# locals: (message: 'Hello', message_iteration:) -%>\n<%= message %>-<%= message_iteration %>",
    );
    expect(
      await render({ message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("Hello-2");
  });

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the magic comment lies about a binary String's encoding.
  it.skip("lying with magic comment", () => {});

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the source is a binary String tagged by an ERB magic comment.
  it.skip("encoding can be specified with magic comment in erb", () => {});

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the source is a binary String tagged by an ERB magic comment.
  it.skip("encoding and arguments can be specified with magic comment in erb", () => {});

  // PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — the source is a binary String that is not valid UTF-8.
  it.skip("error when template isnt valid utf8", () => {});

  it("template is marshalable", () => {
    const template = newTemplate();
    const serialized = Marshal.load(Marshal.dump(template)) as Template;
    expect(serialized.identifier).toBe(template.identifier);
    expect(serialized.source).toBe(template.source);
  });

  it("short identifier", () => {
    template = newTemplate("hello");
    expect(template.shortIdentifier).toBe("hello template");
  });

  it("template inspect", () => {
    template = newTemplate("hello");
    expect(template.inspect()).toBe("#<ActionView::Template hello template locals=[]>");
  });

  const backtraceLocation = (lineno: number) => ({ lineno });

  it("template translate location", () => {
    const highlight = "nomethoderror";
    const source = "<%= nomethoderror %>";
    const compiled =
      "'.freeze; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location lineno offset", () => {
    const highlight = "nomethoderror";
    const source = "<%= nomethoderror %>";
    const compiled =
      "'.freeze; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='";

    const spot = spotHighlight(compiled, highlight, { firstLineno: 2, lastLineno: 2 });
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location with multiline code source", () => {
    const highlight = "nomethoderror";
    const source = "<%=\ngood(\n nomethoderror\n) %>";
    const extractedLine = " nomethoderror\n";
    const compiled =
      "ValidatedOutputBuffer.wrap(@output_buffer, ({}), ' \ngood(\n nomethoderror\n" +
      ") '.freeze, true).safe_none_append=( \ngood(\n nomethoderror\n) );\n@output_buffer";

    const spot = spotHighlight(compiled, highlight, {
      firstColumn: 1,
      firstLineno: 6,
      lastLineno: 6,
      snippet: extractedLine,
    });

    expect(newTemplate(source).translateLocation(backtraceLocation(6), spot)).toEqual(spot);
  });

  it("template translate location with multibye string before highlight", () => {
    const highlight = "nomethoderror";
    const source = "\u{a5}<%= nomethoderror %>";
    const compiled =
      "\u{a5}'.freeze; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location no match in compiled", () => {
    const highlight = "nomatch";
    const source = "<%= nomatch %>";
    const compiled = "this source does not contain the highlight, so the original spot is returned";

    const spot = spotHighlight(compiled, highlight, { firstColumn: 50 });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(spot);
  });

  it("template translate location text includes highlight", () => {
    const highlight = "nomethoderror";
    const source = " nomethoderror <%= nomethoderror %>";
    const compiled =
      " nomethoderror '.freeze; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location space separated erb tags", () => {
    const highlight = "nomethoderror";
    const source = "<%= goodcode %> <%= nomethoderror %>";
    const compiled =
      "'.freeze; @output_buffer.append=  goodcode ; @output_buffer.safe_append=' '.freeze; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location consecutive erb tags", () => {
    const highlight = "nomethoderror";
    const source = "<%= goodcode %><%= nomethoderror %>";
    const compiled =
      "'.freeze; @output_buffer.append=  goodcode ; @output_buffer.append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location repeated highlight in compiled template", () => {
    const highlight = "nomethoderror";
    const source = "<%= nomethoderror %>";
    const compiled =
      "ValidatedOutputBuffer.wrap(@output_buffer, ({}), ' nomethoderror '.freeze, true).safe_none_append=  nomethoderror ; @output_buffer.safe_append='\n";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });

  it("template translate location flaky pathological template", () => {
    const highlight = "flakymethod";
    const source = "<%= flakymethod %> flakymethod <%= flakymethod ";
    const compiled =
      "ValidatedOutputBuffer.wrap(@output_buffer, ({}), ' flakymethod '.freeze, true).safe_none_append=( flakymethod );@output_buffer.safe_append=' flakymethod '.freeze;ValidatedOutputBuffer.wrap(@output_buffer, ({}), ' flakymethod '.freeze, true).safe_none_append=( flakymethod ";

    const spot = spotHighlight(compiled, highlight);
    const expected = spotHighlight(source, highlight, { snippet: compiled });

    expect(newTemplate(source).translateLocation(backtraceLocation(1), spot)).toEqual(expected);
  });
});
