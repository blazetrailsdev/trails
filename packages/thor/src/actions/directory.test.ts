import { beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Error } from "../error.js";
import { Group } from "../group.js";
import { capture, destinationRoot, isWindows, sourceRoot } from "../test-helpers/helper.js";

type Generator = ActionsHost & {
  fileName?: () => string;
  directory(...args: unknown[]): Promise<unknown>;
};

class WhinyGenerator extends Group {
  static {
    include(this, Actions);
  }

  static async sourceRoot(): Promise<string> {
    return File.expandPath(sourceRoot());
  }

  wrongArity(_required: unknown): void {}
}

describe("Thor::Actions::Directory", () => {
  let invoker_: Generator | null;
  let revoker_: Generator | null;

  beforeEach(() => {
    FileUtils.rmRf(destinationRoot());
    invoker_ = null;
    revoker_ = null;
    invoker().fileName = () => "rdoc";
  });

  function invoker(): Generator {
    return (invoker_ ??= new WhinyGenerator(
      [1, 2],
      {},
      {
        destinationRoot: destinationRoot(),
      },
    ) as unknown as Generator);
  }

  function revoker(): Generator {
    return (revoker_ ??= new WhinyGenerator(
      [1, 2],
      {},
      {
        destinationRoot: destinationRoot(),
        behavior: "revoke",
      },
    ) as unknown as Generator);
  }

  function invokeBang(...args: unknown[]): Promise<string> {
    return capture(":stdout", () => invoker().directory(...args));
  }

  function revokeBang(...args: unknown[]): Promise<string> {
    return capture(":stdout", () => revoker().directory(...args));
  }

  function isExistsAndIdentical(sourcePath: string, destinationPath: string): void {
    for (const file of ["config.rb", "README"]) {
      const source = File.join(sourceRoot(), sourcePath, file);
      const destination = File.join(destinationRoot(), destinationPath, file);

      expect(File.isExist(destination)).toBe(true);
      expect(File.read(destination)).toBe(File.read(source));
    }
  }

  describe("#invoke!", () => {
    it("raises an error if the source does not exist", async () => {
      await expect(invokeBang("unknown")).rejects.toThrow(Error);
      await expect(invokeBang("unknown")).rejects.toThrow(
        /Could not find "unknown" in any of your source paths/,
      );
    });

    it("does not create a directory in pretend mode", async () => {
      await invokeBang("doc", "ghost", { pretend: true });
      expect(File.isExist("ghost")).toBe(false);
    });

    it("copies the whole directory recursively to the default destination", async () => {
      await invokeBang("doc");
      isExistsAndIdentical("doc", "doc");
    });

    it("copies the whole directory recursively to the specified destination", async () => {
      await invokeBang("doc", "docs");
      isExistsAndIdentical("doc", "docs");
    });

    it("copies only the first level files if recursive", async () => {
      await invokeBang(".", "commands", { recursive: false });

      let file = File.join(destinationRoot(), "commands", "group.thor");
      expect(File.isExist(file)).toBe(true);

      file = File.join(destinationRoot(), "commands", "doc");
      expect(File.isExist(file)).toBe(false);

      file = File.join(destinationRoot(), "commands", "doc", "README");
      expect(File.isExist(file)).toBe(false);
    });

    it("ignores files within excluding/ directories when exclude_pattern is provided", async () => {
      await invokeBang("doc", "docs", { excludePattern: /excluding\// });
      const file = File.join(destinationRoot(), "docs", "excluding", "rdoc.rb");
      expect(File.isExist(file)).toBe(false);
    });

    it("copies and evaluates files within excluding/ directory when no exclude_pattern is present", async () => {
      await invokeBang("doc", "docs");
      const file = File.join(destinationRoot(), "docs", "excluding", "rdoc.rb");
      expect(File.isExist(file)).toBe(true);
      expect(File.read(file)).toBe("BAR = BAR\n");
    });

    it("copies files from the source relative to the current path", async () => {
      await invoker().inside("doc", {}, async () => {
        await invokeBang(".");
      });
      isExistsAndIdentical("doc", "doc");
    });

    it("copies and evaluates templates", async () => {
      await invokeBang("doc", "docs");
      const file = File.join(destinationRoot(), "docs", "rdoc.rb");
      expect(File.isExist(file)).toBe(true);
      expect(File.read(file)).toBe("FOO = FOO\n");
    });

    it("copies directories and preserves file mode", async () => {
      await invokeBang("preserve", "preserved", { mode: "preserve" });
      const original = File.join(sourceRoot(), "preserve", "script.sh");
      const copy = File.join(destinationRoot(), "preserved", "script.sh");
      expect(File.stat(original).mode).toBe(File.stat(copy).mode);
    });

    it("copies directories", async () => {
      await invokeBang("doc", "docs");
      const file = File.join(destinationRoot(), "docs", "components");
      expect(File.isExist(file)).toBe(true);
      expect(File.isDirectory(file)).toBe(true);
    });

    it("does not copy .empty_directory files", async () => {
      await invokeBang("doc", "docs");
      const file = File.join(destinationRoot(), "docs", "components", ".empty_directory");
      expect(File.isExist(file)).toBe(false);
    });

    it("copies directories even if they are empty", async () => {
      await invokeBang("doc/components", "docs/components");
      const file = File.join(destinationRoot(), "docs", "components");
      expect(File.isExist(file)).toBe(true);
    });

    it("does not copy empty directories twice", async () => {
      const content = await invokeBang("doc/components", "docs/components");
      expect(content).not.toMatch(/exist/);
    });

    it("logs status", async () => {
      const content = await invokeBang("doc");
      expect(content).toMatch(/create {2}doc\/README/);
      expect(content).toMatch(/create {2}doc\/config\.rb/);
      expect(content).toMatch(/create {2}doc\/rdoc\.rb/);
      expect(content).toMatch(/create {2}doc\/components/);
    });

    it("yields a block", async () => {
      let checked = false;
      await invokeBang("doc", (content: string) => {
        checked ||= /FOO/.test(content);
        return content;
      });
      expect(checked).toBe(true);
    });

    it("works with glob characters in the path", async () => {
      const content = await invokeBang("app{1}");
      expect(content).toMatch(/create {2}app\{1\}\/README/);
    });

    describe.skipIf(!isWindows())("windows temp directories", () => {
      let tempDir: string;
      const specDir = (): string => File.join(tempDir, "spec");

      beforeEach(() => {
        tempDir = Dir.mktmpdir("thor");
        Dir.mkdir(specDir());
        File.write(File.join(specDir(), "spec_helper.rb"), "");
        return () => FileUtils.rmRf(tempDir);
      });

      it("works with windows temp dir", async () => {
        await invokeBang(specDir(), "specs");
        const file = File.join(destinationRoot(), "specs");
        expect(File.isExist(file)).toBe(true);
        expect(File.isDirectory(file)).toBe(true);
      });
    });
  });

  describe("#revoke!", () => {
    it("removes the destination file", async () => {
      await invokeBang("doc");
      await revokeBang("doc");

      expect(File.isExist(File.join(destinationRoot(), "doc", "README"))).toBe(false);
      expect(File.isExist(File.join(destinationRoot(), "doc", "config.rb"))).toBe(false);
      expect(File.isExist(File.join(destinationRoot(), "doc", "components"))).toBe(false);
    });

    it("works with glob characters in the path", async () => {
      await invokeBang("app{1}");
      expect(File.isExist(File.join(destinationRoot(), "app{1}", "README"))).toBe(true);

      await revokeBang("app{1}");
      expect(File.isExist(File.join(destinationRoot(), "app{1}", "README"))).toBe(false);
    });
  });
});
