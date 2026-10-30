import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils, isEmpty, NameError, rbFBinding } from "@blazetrails/ruby-compat";
import { capture, isWindows, sourceRoot } from "../test-helpers/helper.js";
import { MyCounter } from "../test-helpers/fixtures/group.js";

type Runner = Record<string, any>;

function assertEmpty(obj: string): void {
  if (!isEmpty(obj)) throw new globalThis.Error(`Expected ${JSON.stringify(obj)} to be empty.`);
}

describe("Thor::Actions", () => {
  let destinationRoot_: string;
  const destinationRoot = (): string => destinationRoot_;
  let runner_: Runner | null;

  function runner(options: object = {}, behavior = "invoke"): Runner {
    return (runner_ ??= new (MyCounter as unknown as new (...args: unknown[]) => Runner)(
      [1],
      options,
      { destinationRoot: destinationRoot(), behavior },
    ));
  }

  function action(name: string, ...args: unknown[]): Promise<string> {
    return capture(":stdout", () => runner()[name](...args));
  }

  function isExistsAndIdentical(source: string, destination: string): void {
    destination = File.join(destinationRoot(), destination);
    expect(File.isExist(destination)).toBe(true);

    source = File.join(sourceRoot(), source);
    expect(File.read(source) === File.read(destination)).toBeTruthy();
  }

  function file(): string {
    return File.join(destinationRoot(), "foo");
  }

  beforeEach(() => {
    destinationRoot_ = Dir.mktmpdir("thor-sandbox-");
    runner_ = null;
  });

  afterEach(() => {
    FileUtils.rmRf(destinationRoot());
    vi.restoreAllMocks();
  });

  describe("#chmod", () => {
    it("executes the command given", async () => {
      const chmodR = vi.spyOn(FileUtils, "chmodRAsync").mockResolvedValue(undefined as never);
      await action("chmod", "foo", 0o755);
      expect(chmodR).toHaveBeenCalledWith(0o755, file());
    });

    it("does not execute the command if pretending", async () => {
      const chmodR = vi.spyOn(FileUtils, "chmodRAsync").mockResolvedValue(undefined as never);
      runner({ pretend: true });
      await action("chmod", "foo", 0o755);
      expect(chmodR).not.toHaveBeenCalled();
    });

    it("logs status", async () => {
      const chmodR = vi.spyOn(FileUtils, "chmodRAsync").mockResolvedValue(undefined as never);
      expect(await action("chmod", "foo", 0o755)).toEqual("       chmod  foo\n");
      expect(chmodR).toHaveBeenCalledWith(0o755, file());
    });

    it("does not log status if required", async () => {
      const chmodR = vi.spyOn(FileUtils, "chmodRAsync").mockResolvedValue(undefined as never);
      assertEmpty(await action("chmod", "foo", 0o755, { verbose: false }));
      expect(chmodR).toHaveBeenCalledWith(0o755, file());
    });
  });

  describe("#copy_file", () => {
    it("copies file from source to default destination", async () => {
      await action("copyFile", "command.thor");
      isExistsAndIdentical("command.thor", "command.thor");
    });

    it("copies file from source to the specified destination", async () => {
      await action("copyFile", "command.thor", "foo.thor");
      isExistsAndIdentical("command.thor", "foo.thor");
    });

    it("copies file from the source relative to the current path", async () => {
      await runner().inside("doc", {}, () => action("copyFile", "README"));
      isExistsAndIdentical("doc/README", "doc/README");
    });

    it("copies file from source to default destination and preserves file mode", async () => {
      await action("copyFile", "preserve/script.sh", { mode: "preserve" });
      const original = File.join(sourceRoot(), "preserve/script.sh");
      const copy = File.join(destinationRoot(), "preserve/script.sh");
      expect(File.stat(original).mode).toEqual(File.stat(copy).mode);
    });

    it("copies file from source to default destination and preserves file mode for templated filenames", async () => {
      const filename = vi.fn(() => "app");
      runner().filename = filename;
      await action("copyFile", "preserve/%filename%.sh", { mode: "preserve" });
      const original = File.join(sourceRoot(), "preserve/%filename%.sh");
      const copy = File.join(destinationRoot(), "preserve/app.sh");
      expect(File.stat(original).mode).toEqual(File.stat(copy).mode);
      expect(filename).toHaveBeenCalled();
    });

    it("logs status", async () => {
      expect(await action("copyFile", "command.thor")).toEqual("      create  command.thor\n");
    });

    it("accepts a block to change output", async () => {
      await action(
        "copyFile",
        "command.thor",
        (content: Uint8Array) => "OMG" + new TextDecoder().decode(content),
      );
      expect(File.read(File.join(destinationRoot(), "command.thor"))).toMatch(/^OMG/);
    });
  });

  describe.skipIf(isWindows())("#link_file", () => {
    it("links file from source to default destination", async () => {
      await action("linkFile", "command.thor");
      isExistsAndIdentical("command.thor", "command.thor");
    });

    it("links file from source to the specified destination", async () => {
      await action("linkFile", "command.thor", "foo.thor");
      isExistsAndIdentical("command.thor", "foo.thor");
    });

    it("links file from the source relative to the current path", async () => {
      await runner().inside("doc", {}, () => action("linkFile", "README"));
      isExistsAndIdentical("doc/README", "doc/README");
    });

    it("logs status", async () => {
      expect(await action("linkFile", "command.thor")).toEqual("      create  command.thor\n");
    });
  });

  describe("#get", () => {
    function stubRequest(body: string) {
      return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => new Response(body) as never);
    }

    it("copies file from source to the specified destination", async () => {
      await action("get", "doc/README", "docs/README");
      isExistsAndIdentical("doc/README", "docs/README");
    });

    it("uses just the source basename as destination if none is specified", async () => {
      await action("get", "doc/README");
      isExistsAndIdentical("doc/README", "README");
    });

    it("allows the destination to be set as a block result", async () => {
      await action("get", "doc/README", () => "docs/README");
      isExistsAndIdentical("doc/README", "docs/README");
    });

    it("yields file content to a block", async () => {
      let yielded: unknown;
      await action("get", "doc/README", (content: Uint8Array) => {
        yielded = new TextDecoder().decode(content);
        return "README";
      });
      expect(yielded).toEqual("__start__\nREADME\n__end__\n");
    });

    it("logs status", async () => {
      expect(await action("get", "doc/README", "docs/README")).toEqual(
        "      create  docs/README\n",
      );
    });

    it("accepts http remote sources", async () => {
      const body = "__start__\nHTTPFILE\n__end__\n";
      const request = stubRequest(body);
      let yielded: unknown;
      await action("get", "http://example.com/file.txt", (content: Uint8Array) => {
        expect(request).toHaveBeenCalledWith("http://example.com/file.txt", expect.anything());
        yielded = new TextDecoder().decode(content);
        return "file.txt";
      });
      expect(yielded).toEqual(body);
    });

    it("accepts https remote sources", async () => {
      const body = "__start__\nHTTPSFILE\n__end__\n";
      const request = stubRequest(body);
      let yielded: unknown;
      await action("get", "https://example.com/file.txt", (content: Uint8Array) => {
        expect(request).toHaveBeenCalledWith("https://example.com/file.txt", expect.anything());
        yielded = new TextDecoder().decode(content);
        return "file.txt";
      });
      expect(yielded).toEqual(body);
    });

    it("accepts http headers", async () => {
      const body = "__start__\nHTTPFILE\n__end__\n";
      const headers = { "Content-Type": "application/json" };
      const request = stubRequest(body);
      let yielded: unknown;
      await action(
        "get",
        "https://example.com/file.txt",
        { httpHeaders: headers },
        (content: Uint8Array) => {
          expect(request).toHaveBeenCalledWith("https://example.com/file.txt", { headers });
          yielded = new TextDecoder().decode(content);
          return "file.txt";
        },
      );
      expect(yielded).toEqual(body);
    });
  });

  describe("#template", () => {
    it("allows using block helpers in the template", async () => {
      await action("template", "doc/block_helper.rb");

      const file = File.join(destinationRoot(), "doc/block_helper.rb");
      expect(File.read(file)).toEqual("Hello world!");
    });

    it("evaluates the template given as source", async () => {
      runner().klass = "Config";
      await action("template", "doc/config.rb");

      const file = File.join(destinationRoot(), "doc/config.rb");
      expect(File.read(file)).toEqual("class Config; end\n");
    });

    it("copies the template to the specified destination", async () => {
      runner().klass = "Config";
      await action("template", "doc/config.rb", "doc/configuration.rb");
      const file = File.join(destinationRoot(), "doc/configuration.rb");
      expect(File.isExist(file)).toBe(true);
    });

    it("converts encoded instructions", async () => {
      const fileName = vi.fn(() => "rdoc");
      runner().fileName = fileName;
      await action("template", "doc/%fileName%.rb.tt");
      const file = File.join(destinationRoot(), "doc/rdoc.rb");
      expect(File.isExist(file)).toBe(true);
      expect(fileName).toHaveBeenCalled();
    });

    it("accepts filename without .tt for template method", async () => {
      const fileName = vi.fn(() => "rdoc");
      runner().fileName = fileName;
      await action("template", "doc/%fileName%.rb");
      const file = File.join(destinationRoot(), "doc/rdoc.rb");
      expect(File.isExist(file)).toBe(true);
      expect(fileName).toHaveBeenCalled();
    });

    it("logs status", async () => {
      runner().klass = "Config";
      expect(await capture(":stdout", () => runner().template("doc/config.rb"))).toEqual(
        "      create  doc/config.rb\n",
      );
    });

    it("accepts a block to change output", async () => {
      runner().klass = "Config";
      await action("template", "doc/config.rb", (content: string) => "OMG" + content);
      expect(File.read(File.join(destinationRoot(), "doc/config.rb"))).toMatch(/^OMG/);
    });

    it("accepts a context to use as the binding", async () => {
      const self = { klass: "FooBar" };
      await action("template", "doc/config.rb", { context: rbFBinding(self) });
      expect(File.read(File.join(destinationRoot(), "doc/config.rb"))).toEqual(
        "class FooBar; end\n",
      );
    });

    it("guesses the destination name when given only a source", async () => {
      await action("template", "doc/config.yaml.tt");

      const file = File.join(destinationRoot(), "doc/config.yaml");
      expect(File.isExist(file)).toBe(true);
    });

    // BLOCKED: thor-template-raises-name-error-at-source-mapped-line
    it.skip("has proper TSE stacktraces", async () => {
      let error: unknown = null;
      try {
        await action("template", "template/bad_config.yaml.tt");
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(NameError);
      expect(String((error as Error).stack)).toContain("bad_config.yaml.tt:2");
    });
  });
});
