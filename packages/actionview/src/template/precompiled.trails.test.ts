import { afterEach, describe, expect, it } from "vitest";
import { LoadError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { setTemplateCompiler, Template } from "../template.js";
import { Tse } from "./handlers/tse.js";
import { shippedTemplateCompiler } from "../test-helpers/setup-compile-template.js";

const fixture = (name: string): string =>
  decodeURIComponent(new URL(`../test-helpers/fixtures/${name}`, import.meta.url).pathname);
const view = (): Base => new (Base.withEmptyTemplateCache())(null, {}, null);
const greeting = (root: string): Template =>
  new LookupContext([`${root}/app/views`]).findTemplate(
    "show",
    ["greetings"],
    false,
    [],
    {},
  ) as Template;

describe("Templates are precompiled", () => {
  let testCompiler: ReturnType<typeof setTemplateCompiler> | undefined;
  const shipped = (): void => {
    testCompiler = setTemplateCompiler(shippedTemplateCompiler);
  };

  afterEach(() => {
    if (testCompiler) setTemplateCompiler(testCompiler);
    testCompiler = undefined;
  });

  it("renders a file-backed template from the module build-views emitted", async () => {
    shipped();
    expect(String(await greeting(fixture("precompiled")).render(view(), { name: "Ada" }))).toBe(
      "Hello, Ada!\n",
    );
  });

  it("raises LoadError for a file-backed template with no build", async () => {
    shipped();
    const error = await greeting(fixture("unbuilt"))
      .render(view(), { name: "Ada" })
      .catch((e: unknown) => e);
    expect((error as Error).cause).toBeInstanceOf(LoadError);
    expect(((error as Error).cause as Error).message).toBe(
      `cannot load such file -- ${fixture("unbuilt")}/.trails/views/greetings/show.html.tse.js`,
    );
  });

  it("raises NotImplementedError for a string-source template in shipped code", async () => {
    shipped();
    const template = new Template("<%= 1 %>", "inline template", new Tse(), {
      locals: [],
      format: ":html",
    });
    const error = await template.render(view()).catch((e: unknown) => e);
    expect((error as Error).cause).toBeInstanceOf(NotImplementedError);
  });

  it("compiles a string-source template with the test compiler installed", async () => {
    const template = new Template("<%= 1 + 1 %>", "inline template", new Tse(), {
      locals: [],
      format: ":html",
    });
    expect(String(await template.render(view()))).toBe("2");
  });

  it("leaves no eval, new Function or vm call in shipped actionview or tse-compiler source", async () => {
    // @ts-expect-error -- Property 'glob' does not exist on type 'ImportMeta'
    const globbed: Record<string, string> = import.meta.glob(
      ["../**/*.ts", "../../../tse-compiler/src/**/*.ts"],
      { query: "?raw", import: "default", eager: true },
    );
    const files = Object.entries(globbed).filter(
      ([file]) => !/\.test\.ts$|\/test-helpers\//u.test(file),
    );
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter(([, source]) => /\beval\s*\(|\bnew\s+Function\b|["']node:vm["']/u.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
