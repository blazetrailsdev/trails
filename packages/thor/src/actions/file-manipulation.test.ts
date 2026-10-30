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

  describe("when changing existent files", () => {
    beforeEach(() => {
      FileUtils.rmRf(destinationRoot());
      FileUtils.copyEntry(sourceRoot(), destinationRoot());
    });

    const file = () => File.join(destinationRoot(), "doc", "README");

    describe("#remove_file", () => {
      it("removes the file given", async () => {
        await action("removeFile", "doc/README");
        expect(File.isExist(file())).toBe(false);
      });

      it("removes broken symlinks too", async () => {
        const linkPath = File.join(destinationRoot(), "broken_symlink");
        await File.symlinkAsync("invalid_reference", linkPath);
        await action("removeFile", "broken_symlink");
        expect(File.isSymlink(linkPath) || File.isExist(linkPath)).toBe(false);
      });

      it("removes directories too", async () => {
        await action("removeDir", "doc");
        expect(File.isExist(File.join(destinationRoot(), "doc"))).toBe(false);
      });

      it("does not remove if pretending", async () => {
        runner({ pretend: true });
        await action("removeFile", "doc/README");
        expect(File.isExist(file())).toBe(true);
      });

      it("logs status", async () => {
        expect(await action("removeFile", "doc/README")).toEqual("      remove  doc/README\n");
      });

      it("does not log status if required", async () => {
        expect(await action("removeFile", "doc/README", { verbose: false })).toBeEmpty();
      });
    });

    describe("#gsub_file", () => {
      describe("with invoke behavior", () => {
        it("replaces the content in the file", async () => {
          await action("gsubFile", "doc/README", "__start__", "START");
          expect(File.read(file())).toEqual("START\nREADME\n__end__\n");
        });

        it("does not replace if pretending", async () => {
          runner({ pretend: true });
          await action("gsubFile", "doc/README", "__start__", "START");
          expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
        });

        it("accepts a block", async () => {
          await action("gsubFile", "doc/README", "__start__", (match: string) =>
            match.replaceAll("__", "").toUpperCase(),
          );
          expect(File.read(file())).toEqual("START\nREADME\n__end__\n");
        });

        it("logs status", async () => {
          expect(await action("gsubFile", "doc/README", "__start__", "START")).toEqual(
            "        gsub  doc/README\n",
          );
        });

        it("does not log status if required", async () => {
          expect(
            await action("gsubFile", file(), "__", { verbose: false }, (match: string) =>
              match.repeat(2),
            ),
          ).toBeEmpty();
        });
      });

      describe("with revoke behavior", () => {
        describe("and no force option", () => {
          it("does not replace the content in the file", async () => {
            runner({}, "revoke");
            await action("gsubFile", "doc/README", "__start__", "START");
            expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
          });

          it("does not replace if pretending", async () => {
            runner({ pretend: true }, "revoke");
            await action("gsubFile", "doc/README", "__start__", "START");
            expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
          });

          it("does not replace the content in the file when given a block", async () => {
            runner({}, "revoke");
            await action("gsubFile", "doc/README", "__start__", (match: string) =>
              match.replaceAll("__", "").toUpperCase(),
            );
            expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
          });

          it("does not log status", async () => {
            runner({}, "revoke");
            expect(await action("gsubFile", "doc/README", "__start__", "START")).toBeEmpty();
          });

          it("does not log status if required", async () => {
            runner({}, "revoke");
            expect(
              await action("gsubFile", file(), "__", { verbose: false }, (match: string) =>
                match.repeat(2),
              ),
            ).toBeEmpty();
          });
        });

        describe("and force option", () => {
          it("replaces the content in the file", async () => {
            runner({}, "revoke");
            await action("gsubFile", "doc/README", "__start__", "START", { force: true });
            expect(File.read(file())).toEqual("START\nREADME\n__end__\n");
          });

          it("does not replace if pretending", async () => {
            runner({ pretend: true }, "revoke");
            await action("gsubFile", "doc/README", "__start__", "START", { force: true });
            expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
          });

          it("replaces the content in the file when given a block", async () => {
            runner({}, "revoke");
            await action("gsubFile", "doc/README", "__start__", { force: true }, (match: string) =>
              match.replaceAll("__", "").toUpperCase(),
            );
            expect(File.read(file())).toEqual("START\nREADME\n__end__\n");
          });

          it("logs status", async () => {
            runner({}, "revoke");
            expect(
              await action("gsubFile", "doc/README", "__start__", "START", { force: true }),
            ).toEqual("        gsub  doc/README\n");
          });

          it("does not log status if required", async () => {
            runner({}, "revoke");
            expect(
              await action(
                "gsubFile",
                file(),
                "__",
                { verbose: false, force: true },
                (match: string) => match.repeat(2),
              ),
            ).toBeEmpty();
          });
        });
      });
    });

    describe("#append_to_file", () => {
      it("appends content to the file", async () => {
        await action("appendToFile", "doc/README", "END\n");
        expect(File.read(file())).toEqual("__start__\nREADME\n__end__\nEND\n");
      });

      it("accepts a block", async () => {
        await action("appendToFile", "doc/README", () => "END\n");
        expect(File.read(file())).toEqual("__start__\nREADME\n__end__\nEND\n");
      });

      it("logs status", async () => {
        expect(await action("appendToFile", "doc/README", "END")).toEqual(
          "      append  doc/README\n",
        );
      });
    });

    describe("#prepend_to_file", () => {
      it("prepends content to the file", async () => {
        await action("prependToFile", "doc/README", "START\n");
        expect(File.read(file())).toEqual("START\n__start__\nREADME\n__end__\n");
      });

      it("accepts a block", async () => {
        await action("prependToFile", "doc/README", () => "START\n");
        expect(File.read(file())).toEqual("START\n__start__\nREADME\n__end__\n");
      });

      it("logs status", async () => {
        expect(await action("prependToFile", "doc/README", "START")).toEqual(
          "     prepend  doc/README\n",
        );
      });
    });

    describe("#inject_into_class", () => {
      const file = () => File.join(destinationRoot(), "application.rb");

      it("appends content to a class", async () => {
        await action(
          "injectIntoClass",
          "application.rb",
          "Application",
          "  filter_parameters :password\n",
        );
        expect(File.read(file())).toEqual(
          "class Application < Base\n  filter_parameters :password\nend\n",
        );
      });

      it("accepts a block", async () => {
        await action(
          "injectIntoClass",
          "application.rb",
          "Application",
          () => "  filter_parameters :password\n",
        );
        expect(File.read(file())).toEqual(
          "class Application < Base\n  filter_parameters :password\nend\n",
        );
      });

      it("logs status", async () => {
        expect(
          await action(
            "injectIntoClass",
            "application.rb",
            "Application",
            "  filter_parameters :password\n",
          ),
        ).toEqual("      insert  application.rb\n");
      });

      it("does not append if class name does not match", async () => {
        await action("injectIntoClass", "application.rb", "App", "  filter_parameters :password\n");
        expect(File.read(file())).toEqual("class Application < Base\nend\n");
      });
    });

    describe("#inject_into_module", () => {
      const file = () => File.join(destinationRoot(), "application_helper.rb");

      it("appends content to a module", async () => {
        await action(
          "injectIntoModule",
          "application_helper.rb",
          "ApplicationHelper",
          "  def help; 'help'; end\n",
        );
        expect(File.read(file())).toEqual(
          "module ApplicationHelper\n  def help; 'help'; end\nend\n",
        );
      });

      it("accepts a block", async () => {
        await action(
          "injectIntoModule",
          "application_helper.rb",
          "ApplicationHelper",
          () => "  def help; 'help'; end\n",
        );
        expect(File.read(file())).toEqual(
          "module ApplicationHelper\n  def help; 'help'; end\nend\n",
        );
      });

      it("logs status", async () => {
        expect(
          await action(
            "injectIntoModule",
            "application_helper.rb",
            "ApplicationHelper",
            "  def help; 'help'; end\n",
          ),
        ).toEqual("      insert  application_helper.rb\n");
      });

      it("does not append if module name does not match", async () => {
        await action(
          "injectIntoModule",
          "application_helper.rb",
          "App",
          "  def help; 'help'; end\n",
        );
        expect(File.read(file())).toEqual("module ApplicationHelper\nend\n");
      });
    });
  });

  describe("when adjusting comments", () => {
    beforeEach(() => {
      FileUtils.rmRf(destinationRoot());
      FileUtils.copyEntry(sourceRoot(), destinationRoot());
    });

    const file = () => File.join(destinationRoot(), "doc", "COMMENTER");

    const unmodifiedCommentsFile =
      /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\norange\n {4}purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/;

    describe("#uncomment_lines", () => {
      it("uncomments all matching lines in the file", async () => {
        await action("uncommentLines", "doc/COMMENTER", "green");
        expect(File.read(file())).toMatch(
          /__start__\n greenblue\n#\n# yellowblue\n#yellowred\n greenred\norange\n {4}purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );

        await action("uncommentLines", "doc/COMMENTER", "red");
        expect(File.read(file())).toMatch(
          /__start__\n greenblue\n#\n# yellowblue\nyellowred\n greenred\norange\n {4}purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );
      });

      it("correctly uncomments lines with hashes in them", async () => {
        await action("uncommentLines", "doc/COMMENTER", "ind#igo");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\norange\n {4}purple\n {2}ind#igo\n {2}ind#igo\n {2}# {3}spaces_between\n__end__/,
        );
      });

      it("will leave the space which existed before the comment hash in tact", async () => {
        await action("uncommentLines", "doc/COMMENTER", "ind#igo");
        await action("uncommentLines", "doc/COMMENTER", "spaces_between");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\norange\n {4}purple\n {2}ind#igo\n {2}ind#igo\n {4}spaces_between\n__end__/,
        );
      });

      it("does not modify already uncommented lines in the file", async () => {
        await action("uncommentLines", "doc/COMMENTER", "orange");
        await action("uncommentLines", "doc/COMMENTER", "purple");
        expect(File.read(file())).toMatch(unmodifiedCommentsFile);
      });

      it("does not uncomment the wrong line when uncommenting lines preceded by blank commented line", async () => {
        await action("uncommentLines", "doc/COMMENTER", "yellow");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\nyellowblue\nyellowred\n #greenred\norange\n {4}purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );
      });
    });

    describe("#comment_lines", () => {
      it("comments lines which are not commented", async () => {
        await action("commentLines", "doc/COMMENTER", "orange");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\n# orange\n {4}purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );

        await action("commentLines", "doc/COMMENTER", "purple");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\n# orange\n {4}# purple\n {2}ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );
      });

      it("correctly comments lines with hashes in them", async () => {
        await action("commentLines", "doc/COMMENTER", "ind#igo");
        expect(File.read(file())).toMatch(
          /__start__\n # greenblue\n#\n# yellowblue\n#yellowred\n #greenred\norange\n {4}purple\n {2}# ind#igo\n {2}# ind#igo\n {2}# {3}spaces_between\n__end__/,
        );
      });

      it("does not modify already commented lines", async () => {
        await action("commentLines", "doc/COMMENTER", "green");
        expect(File.read(file())).toMatch(unmodifiedCommentsFile);
      });
    });
  });
});
