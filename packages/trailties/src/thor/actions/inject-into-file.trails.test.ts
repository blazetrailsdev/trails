import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils, include, stdout } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Shell } from "../shell.js";
import { Thor } from "../thor.js";

class Script extends Thor {
  static {
    include(this, Shell);
    include(this, Actions);
  }
}

async function capture(_stream: string, block: () => unknown): Promise<string> {
  let result = "";
  const write = stdout.write;
  (stdout as { write: typeof write }).write = (chunk) => {
    result += chunk;
    return true;
  };
  try {
    await block();
  } finally {
    (stdout as { write: typeof write }).write = write;
  }
  return result;
}

type Host = ActionsHost & {
  injectIntoFile(destination: string, ...args: unknown[]): Promise<unknown>;
  prependToFile(path: string, ...args: unknown[]): Promise<unknown>;
  appendFile(path: string, ...args: unknown[]): Promise<unknown>;
  injectIntoClass(path: string, klass: unknown, ...args: unknown[]): Promise<unknown>;
  injectIntoModule(path: string, moduleName: unknown, ...args: unknown[]): Promise<unknown>;
};

describe("Thor::Actions insert_into_file and its wrappers (trails)", () => {
  let root: string;
  const host = (options: object = {}, config: object = {}): Host =>
    new Script([], options, { destinationRoot: root, ...config }) as unknown as Host;
  const file = (name: string): string => File.join(root, name);

  beforeEach(() => {
    root = Dir.mktmpdir("thor-inject-into-file-");
    File.write(file("README"), "__start__\nREADME\n__end__\n");
    File.write(file("post.ts"), "export class Post extends Base {\n}\n");
  });
  afterEach(() => {
    FileUtils.rmRf(root);
  });

  it("prepends, reports :prepend, and writes the flag into the caller's config", async () => {
    const config: Record<string, unknown> = {};
    const out = await capture(":stdout", () => host().prependToFile("README", "top\n", config));
    expect(File.read(file("README"))).toBe("top\n__start__\nREADME\n__end__\n");
    expect(out).toBe("     prepend  README\n");
    expect(config["after"]).toEqual(/^/);
  });

  it("appends through the alias, reports :append, and revokes it", async () => {
    const out = await capture(":stdout", () => host().appendFile("README", () => "bottom\n"));
    expect(File.read(file("README"))).toBe("__start__\nREADME\n__end__\nbottom\n");
    expect(out).toBe("      append  README\n");
    await capture(":stdout", () =>
      host({}, { behavior: "revoke" }).appendFile("README", "bottom\n"),
    );
    expect(File.read(file("README"))).toBe("__start__\nREADME\n__end__\n");
  });

  it("injects after a TS class declaration through the second alternative", async () => {
    await capture(":stdout", () => host().injectIntoClass("post.ts", "Post", "  title = 1;\n"));
    expect(File.read(file("post.ts"))).toBe("export class Post extends Base {\n  title = 1;\n}\n");
  });

  it("injects after a module line", async () => {
    File.write(file("helper.rb"), "module Helper\nend\n");
    await capture(":stdout", () => host().injectIntoModule("helper.rb", "Helper", "  x\n"));
    expect(File.read(file("helper.rb"))).toBe("module Helper\n  x\nend\n");
  });

  it("matches a string flag literally and keeps a Regexp flag's own options", async () => {
    File.write(file("README"), "a.b\nAXB\n");
    await capture(":stdout", async () => {
      await host().injectIntoFile("README", "!", { after: "a.b" });
      await host().injectIntoFile("README", "?", { after: /axb/i });
    });
    expect(File.read(file("README"))).toBe("a.b!\nAXB?\n");
  });

  it("awaits a block that returns a promise and inserts a literal dollar sign", async () => {
    await capture(":stdout", () =>
      host().injectIntoFile("README", { before: "__end__" }, async () => "$& $1\n"),
    );
    expect(File.read(file("README"))).toBe("__start__\nREADME\n$& $1\n__end__\n");
  });

  it("says nothing when verbose is false", async () => {
    const out = await capture(":stdout", () =>
      host().injectIntoFile("README", "x", { after: "nowhere", verbose: false }),
    );
    expect(out).toBe("");
  });
});
