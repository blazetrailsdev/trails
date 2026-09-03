import { getOsAsync } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LookupContext } from "../lookup-context.js";
import { FileSystemResolver } from "./resolver.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";

describe("FileSystemResolver", () => {
  let dir: string;

  beforeEach(async () => {
    const fs = await getFsAsync();
    const path = await getPathAsync();
    const os = await getOsAsync();
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}fs-resolver-`);
    await fs.mkdir!(path.join(dir, "posts"), { recursive: true });
    const write = (name: string, body: string) =>
      fs.writeFile!(path.join(dir, "posts", name), body);
    await write("index.html.tse", "<h1>Posts</h1>");
    await write("index.html+phone.tse", "<h1>Phone</h1>");
    await write("_form.html.tse", "<form></form>");
    await write("i*x.html.tse", "<h1>Star</h1>");
    await fs.mkdir!(path.join(dir, "po?sts"), { recursive: true });
    await fs.writeFile!(path.join(dir, "po?sts", "index.html.tse"), "<h1>Query</h1>");
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(async () => {
    TemplateHandlers.clear();
    const fs = await getFsAsync();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a template through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("index", ["posts"])).toBe(true);
    expect(ctx.isExists("missing", ["posts"])).toBe(false);
    expect(ctx.findTemplate("index", "posts", "html")?.source).toBe("<h1>Posts</h1>");
  });

  it("finds a partial through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("form", ["posts"], true)).toBe(true);
    expect(ctx.findPartial("form", "posts", "html")?.source).toBe("<form></form>");
  });

  it("prefers the requested variant", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("index", ["posts"], false, [], { variants: ["phone"] })).toBe(true);
    expect(ctx.findAll("index", ["posts"], false, [], { variants: ["phone"] })).toHaveLength(2);
    expect(ctx.find("index", ["posts"], false, [], { variants: ["phone"] })).toMatchObject({
      source: "<h1>Phone</h1>",
    });
  });

  it("escapes glob metacharacters in the looked-up path", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.findTemplate("i*x", "posts", "html")?.source).toBe("<h1>Star</h1>");
    expect(ctx.isExists("i*dex", ["posts"])).toBe(false);
  });

  it("finds a template under a prefix containing a glob metacharacter", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("index", ["po?sts"])).toBe(true);
    expect(ctx.findTemplate("index", "po?sts", "html")?.source).toBe("<h1>Query</h1>");
  });

  it("rescans the filesystem when the details cache is off", async () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));
    expect(ctx.isExists("index", ["posts"])).toBe(true);

    const fs = await getFsAsync();
    const path = await getPathAsync();
    await fs.writeFile!(path.join(dir, "posts", "index.html+tablet.tse"), "<h1>Tablet</h1>");

    expect(
      ctx.disableCache(() => ctx.find("index", ["posts"], false, [], { variants: ["tablet"] })),
    ).toMatchObject({ source: "<h1>Tablet</h1>" });
  });

  it("any? ignores the format and variant constraints", () => {
    const ctx = new LookupContext(null, { formats: ["json"] }, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("index", ["posts"])).toBe(false);
    expect(ctx.isAny("index", ["posts"])).toBe(true);
    expect(ctx.isAny("missing", ["posts"])).toBe(false);
  });
});

describe("FixtureResolver", () => {
  it("globs with File.fnmatch semantics, where ** requires a directory", () => {
    const resolver = new FixtureResolver({
      "index.html.tse": "root",
      "posts/index.html.tse": "nested",
    });

    expect(resolver.allTemplatePaths().map((path) => path.virtual)).toEqual(["posts/index"]);
  });
});
