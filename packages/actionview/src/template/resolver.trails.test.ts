import { getOsAsync, getFs, getPath } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LookupContext } from "../lookup-context.js";
import { FileSystemResolver } from "./resolver.js";
import { FixtureResolver } from "../testing/resolvers.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";

describe("FileSystemResolver", () => {
  let dir: string;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
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
    const fs = getFs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a template through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["posts"])).toBe(true);
    expect(ctx.isExists("missing", ["posts"])).toBe(false);
    expect(ctx.findTemplate("index", ["posts"], ["html"])?.source).toBe("<h1>Posts</h1>");
  });

  it("finds a partial through the same paths as exists?", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("form", ["posts"], true)).toBe(true);
    expect(ctx.findPartial("form", ["posts"], ["html"])?.source).toBe("<form></form>");
  });

  it("prefers the requested variant", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["posts"], false, [], { variants: ["phone"] })).toBe(true);
    expect(ctx.findAll("index", ["posts"], false, [], { variants: ["phone"] })).toHaveLength(2);
    expect(ctx.find("index", ["posts"], false, [], { variants: ["phone"] })).toMatchObject({
      source: "<h1>Phone</h1>",
    });
  });

  it("escapes glob metacharacters in the looked-up path", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.findTemplate("i*x", ["posts"], ["html"])?.source).toBe("<h1>Star</h1>");
    expect(ctx.isExists("i*dex", ["posts"])).toBe(false);
  });

  it("finds a template under a prefix containing a glob metacharacter", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

    expect(ctx.isExists("index", ["po?sts"])).toBe(true);
    expect(ctx.findTemplate("index", ["po?sts"], ["html"])?.source).toBe("<h1>Query</h1>");
  });

  it("rescans the filesystem when the details cache is off", async () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);
    expect(ctx.isExists("index", ["posts"])).toBe(true);

    const fs = getFs();
    const path = getPath();
    await fs.writeFile!(path.join(dir, "posts", "index.html+tablet.tse"), "<h1>Tablet</h1>");

    expect(
      ctx.disableCache(() => ctx.find("index", ["posts"], false, [], { variants: ["tablet"] })),
    ).toMatchObject({ source: "<h1>Tablet</h1>" });
  });

  it("any? ignores the format and variant constraints", () => {
    const ctx = new LookupContext(null, { formats: ["json"] }, []);
    ctx.appendViewPaths([new FileSystemResolver(dir)]);

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

describe("FileSystemResolver view-directory spelling", () => {
  let dir: string;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    const os = await getOsAsync();
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}fs-resolver-spelling-`);
    await fs.mkdir!(path.join(dir, "rfc-pages"), { recursive: true });
    await fs.writeFile!(path.join(dir, "rfc-pages", "show.html.tse"), "<h1>Kebab</h1>");
    await fs.mkdir!(path.join(dir, "story_pages"), { recursive: true });
    await fs.writeFile!(path.join(dir, "story_pages", "show.html.tse"), "<h1>Underscore</h1>");
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(async () => {
    TemplateHandlers.clear();
    const fs = getFs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("finds a template the generator wrote to a kebab-cased directory", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("show", ["rfc_pages"])).toBe(true);
    expect(ctx.findTemplate("show", ["rfc_pages"], ["html"])?.source).toBe("<h1>Kebab</h1>");
  });

  it("reports the underscored virtual path for a kebab-cased directory", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.findTemplate("show", ["rfc_pages"], ["html"])?.virtualPath).toBe("rfc_pages/show");
  });

  it("still finds a template in an underscored directory", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.findTemplate("show", ["story_pages"], ["html"])?.source).toBe("<h1>Underscore</h1>");
  });

  it("prefers the kebab-cased directory when both spellings hold the template", async () => {
    const fs = getFs();
    const path = getPath();
    await fs.mkdir!(path.join(dir, "both-ways"), { recursive: true });
    await fs.writeFile!(path.join(dir, "both-ways", "show.html.tse"), "<h1>Kebab</h1>");
    await fs.mkdir!(path.join(dir, "both_ways"), { recursive: true });
    await fs.writeFile!(path.join(dir, "both_ways", "show.html.tse"), "<h1>Underscore</h1>");

    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.findTemplate("show", ["both_ways"], ["html"])?.source).toBe("<h1>Kebab</h1>");
  });

  it("enumerates one identity per template, matching the built virtual path", () => {
    const resolver = new FileSystemResolver(dir);
    const enumerated = resolver.allTemplatePaths().map((p) => p.virtual);

    expect(enumerated).toContain("rfc_pages/show");
    expect(enumerated).not.toContain("rfc-pages/show");
  });

  it("does not invent a template for a directory that exists in neither spelling", () => {
    const ctx = new LookupContext(null, {}, []);
    ctx.addResolver(new FileSystemResolver(dir));

    expect(ctx.isExists("show", ["missing_pages"])).toBe(false);
  });
});
