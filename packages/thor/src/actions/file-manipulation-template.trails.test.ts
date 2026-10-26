import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ArgumentError,
  Dir,
  File,
  FileUtils,
  getFs,
  include,
  StringIO,
} from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Shell } from "../shell.js";
import { Thor } from "../thor.js";
import { capture, sourceRoot } from "../test-helpers/helper.js";

class Script extends Thor {
  static {
    include(this, Shell);
    include(this, Actions);
  }
  klass = "Config";

  private world(block: () => void): void {
    const result = this.capture(block);
    this.concat(result.trim() + " world!");
  }

  declare capture: (...args: unknown[]) => string;
  declare concat: (string: string) => void;
}

type Host = ActionsHost &
  Script & {
    copyFile(source: string, ...args: unknown[]): Promise<void>;
    linkFile(source: string, ...args: unknown[]): Promise<unknown>;
    get(source: string, ...args: unknown[]): Promise<unknown>;
    template(source: string, ...args: unknown[]): Promise<unknown>;
    withOutputBuffer(buf: unknown, block: () => unknown): string;
    outputBuffer: StringIO | null;
  };

describe("Thor::Actions copy_file, link_file, get and template (trails)", () => {
  let root: string;
  const host = (options: object = {}): Host =>
    new Script([], options, { destinationRoot: root }) as unknown as Host;
  const file = (name: string): string => File.join(root, name);
  const run = (block: () => unknown): Promise<string> => capture(":stdout", block);

  beforeAll(async () => {
    await (Script as unknown as { sourceRoot(path: string): Promise<unknown> }).sourceRoot(
      sourceRoot(),
    );
  });
  beforeEach(() => {
    root = Dir.mktmpdir("thor-template-");
  });
  afterEach(() => {
    FileUtils.rmRf(root);
  });

  it("copies a file byte for byte and reports it", async () => {
    const out = await run(() => host().copyFile("doc/README", "copied"));
    expect(out).toMatch(/create {2}copied\n/);
    expect(File.binread(file("copied"))).toEqual(
      File.binread(File.join(sourceRoot(), "doc/README")),
    );
  });

  it("copies to the source's own path and post-processes with a block", async () => {
    await run(() =>
      host().copyFile("doc/README", (content: Uint8Array) =>
        new TextDecoder().decode(content).toUpperCase(),
      ),
    );
    expect(File.read(file("doc/README"))).toBe(
      File.read(File.join(sourceRoot(), "doc/README")).toUpperCase(),
    );
  });

  it("preserves the source's mode on the copy", async () => {
    await run(() => host().copyFile("preserve/script.sh", { mode: "preserve" }));
    const mode = (path: string): number => getFs().statSync(path).mode & 0o777;
    expect(mode(file("preserve/script.sh"))).toBe(
      mode(File.join(sourceRoot(), "preserve/script.sh")),
    );
  });

  it("neither reads nor writes the source when pretending", async () => {
    await run(() => host({ pretend: true }).copyFile("doc/README"));
    expect(File.isExist(file("doc/README"))).toBe(false);
  });

  it("links a file to the expanded source", async () => {
    await run(() => host().linkFile("doc/README", "linked"));
    expect(File.isSymlink(file("linked"))).toBe(true);
    expect(File.read(file("linked"))).toBe(File.read(File.join(sourceRoot(), "doc/README")));
  });

  it("gets a local file into the source's basename", async () => {
    await run(() => host().get("doc/README"));
    expect(File.read(file("README"))).toBe(File.read(File.join(sourceRoot(), "doc/README")));
  });

  it("names the destination from a block that takes the content", async () => {
    await run(() =>
      host().get("doc/README", (content: Uint8Array) =>
        new TextDecoder().decode(content).split("\n")[0].replace(/\W/g, ""),
      ),
    );
    const first = File.read(File.join(sourceRoot(), "doc/README")).split("\n")[0];
    expect(File.isExist(file(first.replace(/\W/g, "")))).toBe(true);
  });

  it("names the destination from a block that takes nothing", async () => {
    await run(() => host().get("doc/README", () => "from-block"));
    expect(File.isExist(file("from-block"))).toBe(true);
  });

  it("evaluates the template with the generator as self, stripping .tt only at the end", async () => {
    await run(async () => {
      await host().template("doc/config.rb");
      await host().template("doc/config.yaml.tt");
    });
    expect(File.read(file("doc/config.rb"))).toBe("class Config; end\n");
    expect(File.read(file("doc/config.yaml"))).toBe("--- Hi from yaml\n");
  });

  it("captures and concats through the output buffer", async () => {
    await run(() => host().template("doc/block_helper.rb"));
    expect(File.read(file("doc/block_helper.rb"))).toBe("Hello world!");
  });

  it("evaluates against a given context and post-processes with a block", async () => {
    await run(() =>
      host().template(
        "doc/config.rb",
        "out.rb",
        { context: { klass: "Other" } },
        (content: string) => content.toUpperCase(),
      ),
    );
    expect(File.read(file("out.rb"))).toBe("CLASS OTHER; END\n");
  });

  it("raises for a frozen buffer, and the ensure resets the buffer it never saved", () => {
    const h = host();
    const previous = new StringIO();
    h.outputBuffer = previous;
    expect(() => h.withOutputBuffer(Object.freeze(new StringIO()), () => {})).toThrow(
      new ArgumentError("Buffer can not be a frozen object"),
    );
    expect(h.outputBuffer).toBeNull();
  });
});
