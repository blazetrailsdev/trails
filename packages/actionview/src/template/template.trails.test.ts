import { Encoding, getFs, getOsAsync, getPath } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { File as SourcesFile } from "./sources/file.js";

const dirs: string[] = [];

async function binarySource(bytes: string): Promise<SourcesFile> {
  const fs = getFs();
  const path = getPath();
  const dir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}tse-template-`);
  dirs.push(dir);
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

describe("Template#encode!", () => {
  afterEach(() => {
    TemplateHandlers.clear();
    for (const dir of dirs.splice(0)) getFs().rmSync(dir, { recursive: true, force: true });
  });

  const newTemplate = (body: string | SourcesFile): Template =>
    new Template(body, "hello template", new Tse(), {
      virtualPath: null,
      format: "html",
      locals: [],
    });

  const render = (template: Template): string =>
    String(template.render(new (Base.withEmptyTemplateCache())(null, {}, null), {}, null, {}));

  it("passes a String source to the handler untouched", () => {
    expect(render(newTemplate("hello \u{fc}mlat"))).toBe("hello \u{fc}mlat");
  });

  it("decodes a file source in Encoding.default_external", async () => {
    const source = await binarySource("hello \xFCmlat");
    withExternalEncoding("ISO-8859-1", () => {
      expect(render(newTemplate(source))).toBe("hello \u{fc}mlat");
    });
  });

  it("decodes a file source in its magic-comment encoding, leaving a blank line", async () => {
    const template = newTemplate(await binarySource("# encoding: ISO-8859-1\nhello \xFCmlat"));
    expect(render(template)).toBe("\nhello \u{fc}mlat");
  });

  it("raises WrongEncodingError for bytes invalid in the magic-comment encoding", async () => {
    const template = newTemplate(await binarySource("# encoding: UTF-8\nhello \xFCmlat"));
    expect(() => render(template)).toThrow(/Your template was not saved as valid UTF-8/);
  });
});
