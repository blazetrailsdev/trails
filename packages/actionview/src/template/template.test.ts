import { Encoding, getFs, getOsAsync, getPath } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { File as SourcesFile } from "./sources/file.js";

async function binarySource(bytes: string): Promise<SourcesFile> {
  const fs = getFs();
  const path = getPath();
  const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}tse-template-`);
  const filename = path.join(dir, "template.html.tse");
  await fs.writeFile!(
    filename,
    Uint8Array.from(bytes, (c) => c.charCodeAt(0)),
  );
  return new SourcesFile(filename);
}

function withExternalEncoding<T>(encoding: string | Encoding, block: () => T): T {
  const old = Encoding.defaultExternal;
  Encoding.defaultExternal = encoding;
  try {
    return block();
  } finally {
    Encoding.defaultExternal = old;
  }
}

describe("TestTSETemplate", () => {
  afterEach(() => TemplateHandlers.clear());

  const newTemplate = (
    body: string | SourcesFile,
    { virtualPath = "hello" }: { virtualPath?: string | null } = {},
  ): Template =>
    new Template(body, "hello template", new Tse(), {
      virtualPath,
      format: "html",
      locals: [],
    });

  const render = (
    template: Template,
    locals: Record<string, unknown> = {},
    implicitLocals: readonly string[] = [],
  ): string =>
    template.render(new (Base.withEmptyTemplateCache())(null, {}, null), locals, null, {
      implicitLocals,
    });

  it("locals cannot be specified with positional arguments", () => {
    const template = newTemplate("<%# locals: (argument = 'content') -%>\n<%= argument %>");
    expect(() => render(template)).toThrow(
      "`argument` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("locals cannot be specified with block arguments", () => {
    const template = newTemplate("<%# locals: (&block) -%>\n<%= tag.div(block) %>");
    expect(() => render(template)).toThrow(
      "`block` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("rails injected locals does not raise error if not passed", () => {
    const template = newTemplate("<%# locals: (message:) -%>");
    expect(() =>
      render(template, { message: "Hi", message_counter: 1, message_iteration: 1 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).not.toThrow();
  });

  it("rails injected locals can be specified", () => {
    const template = newTemplate("<%# locals: (message: 'Hello') -%>\n<%= message %>");
    expect(render(template, { message: "Hello" }, ["message"])).toBe("Hello");
  });

  it("rails injected locals can be specified as kwargs", () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', **kwargs) -%>\n<%= kwargs.message_counter %>-<%= kwargs.message_iteration %>",
    );
    expect(
      render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("1-2");
  });

  it("rails injected locals can be specified as required argument", () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', message_iteration:) -%>\n<%= message %>-<%= message_iteration %>",
    );
    expect(
      render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("Hello-2");
  });
  it("rails local assigns and strict locals", () => {
    const template = newTemplate('<%# locals: (class: ) -%>\n<%= localAssigns["class"] %>');
    expect(render(template, { class: "some-class" }, ["message"])).toBe("some-class");
  });

  it("no magic comment word with utf 8", () => {
    const template = newTemplate("hello \u{fc}mlat");
    expect(render(template)).toBe("hello \u{fc}mlat");
  });

  it("default external works", async () => {
    const source = await binarySource("hello \xFCmlat");
    withExternalEncoding("ISO-8859-1", () => {
      const template = newTemplate(source);
      expect(render(template)).toBe("hello \u{fc}mlat");
    });
  });

  it("encoding can be specified with magic comment", async () => {
    const template = newTemplate(await binarySource("# encoding: ISO-8859-1\nhello \xFCmlat"));
    expect(render(template)).toBe("\nhello \u{fc}mlat");
  });

  it("lying with magic comment", async () => {
    const template = newTemplate(await binarySource("# encoding: UTF-8\nhello \xFCmlat"), {
      virtualPath: null,
    });
    expect(() => render(template)).toThrow(Template.Error);
  });
});
