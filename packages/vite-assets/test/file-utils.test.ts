import { Dir, File, FileUtils as RbFileUtils, Pathname } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI } from "../lib/cli.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig } from "./support/test-helper.js";

const { append, write, replaceFirstLine, injectLineBefore, injectLineAfter, injectLineAfterLast } =
  CLI.FileUtils;

describe("FilesTest", () => {
  let _root: Pathname | undefined;

  async function root(): Promise<Pathname> {
    if (_root === undefined) {
      _root = new Pathname(new URL("../tmp/", import.meta.url).pathname).join(crypto.randomUUID());
      await RbFileUtils.mkdirPAsync(_root.toString());
    }
    return _root;
  }

  afterEach(async () => {
    if (_root !== undefined) await RbFileUtils.rmRfAsync(_root.toString());
    _root = undefined;
  });

  async function assertContent(path: Pathname, content: string) {
    expect(content).toContain(await path.read());
  }

  async function assertPathExists(path: Pathname) {
    expect(await File.isExistAsync(path.toString())).toBe(true);
  }

  it("fresh installation", async () => {
    const appRoot = (await root()).join("test_fresh_install");
    await RbFileUtils.mkdirPAsync(appRoot.toString());
    const spy = vi
      .spyOn(
        CLI.Install.prototype as unknown as { installJsPackages(): unknown },
        "installJsPackages",
      )
      .mockResolvedValue(undefined);
    try {
      await Dir.chdir(appRoot.toString(), async () => {
        await ViteAssets.reloadWith({ root: appRoot.toString() }).prewarmConfig();
        await new CLI.Install().call();
      });
    } finally {
      spy.mockRestore();
      await refreshConfig();
    }

    await assertPathExists(appRoot.join("vite.config.ts"));
    await assertPathExists(appRoot.join("package.json"));
    expect(JSON.parse(await appRoot.join("package.json").read())["type"]).toBe("module");
  });

  it("write", async () => {
    const path = (await root()).join("write");
    await write(path, "Hello\nWorld");

    expect(await File.isExistAsync(path.toString())).toBeTruthy();
    await assertContent(path, "Hello\nWorld");
  });

  it("append", async () => {
    const path = (await root()).join("append.rb");
    const content = "class Append\nend\n";

    await write(path, content);
    await append(path, "\nFoo.register Append");

    await assertContent(path, "class Append\nend\n\nFoo.register Append\n");
  });

  it("replace first line", async () => {
    const path = (await root()).join("replace_string.rb");
    const content = "class Replace\n  def self.perform\n  end\nend\n";

    await write(path, content);
    await replaceFirstLine(path, "perform", "  def self.call(input)");

    await assertContent(path, "class Replace\n  def self.call(input)\n  end\nend\n");
  });

  it("injects line before", async () => {
    const path = (await root()).join("inject_before_string.rb");
    const content = "class InjectBefore\n  def self.call\n  end\nend\n";

    await write(path, content);
    await injectLineBefore(path, "call", "  # It performs the operation");

    await assertContent(
      path,
      "class InjectBefore\n  # It performs the operation\n  def self.call\n  end\nend\n",
    );
  });

  it("injects line after", async () => {
    const path = (await root()).join("inject_after.rb");
    const content = "class InjectAfter\n  def self.call\n  end\nend\n";

    await write(path, content);
    await injectLineAfter(path, "call", "    :result");

    await assertContent(path, "class InjectAfter\n  def self.call\n    :result\n  end\nend\n");
  });

  it("injects line after last", async () => {
    const path = (await root()).join("inject_after_last.rb");
    const content = "class InjectAfter\n  def self.call\n  end\n  def self.call\n  end\nend\n";

    await write(path, content);
    await injectLineAfterLast(path, "call", "    :result");

    await assertContent(
      path,
      "class InjectAfter\n  def self.call\n  end\n  def self.call\n    :result\n  end\nend\n",
    );
  });
});
