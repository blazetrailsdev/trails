import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils, rbFSystem } from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { MyCounter as MyCounterFixture } from "../test-helpers/fixtures/group.js";
import { capture } from "../test-helpers/helper.js";
import { CreateFile } from "./create-file.js";

const { readline } = vi.hoisted(() => ({ readline: vi.fn() }));

vi.mock("../line-editor.js", () => ({ readline }));
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rbFSystem: vi.fn(),
}));

const MyCounter = MyCounterFixture as unknown as new (...args: unknown[]) => ActionsHost;

let destinationRoot: string;

beforeAll(() => {
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
});
afterAll(() => {
  FileUtils.rmRf(destinationRoot);
});

describe("Thor::Actions::CreateFile", () => {
  let _silence: boolean;
  let _base: ActionsHost;
  let _action: CreateFile;

  beforeEach(() => {
    _silence = false;
    readline.mockReset();
    vi.mocked(rbFSystem).mockReset();
    FileUtils.rmRf(destinationRoot);
  });

  const createFile = (
    destination: string | null = null,
    config: Record<string, unknown> = {},
    options: Record<string, unknown> = {},
    contents = "CONFIGURATION",
  ): CreateFile => {
    _base = new MyCounter([1, 2], options, { destinationRoot });
    Object.assign(_base, { fileName: () => "rdoc" });

    return (_action = new CreateFile(_base, destination, contents, {
      verbose: !_silence,
      ...config,
    }));
  };
  const invokeBang = () => capture(":stdout", () => _action.invokeBang());
  const revokeBang = () => capture(":stdout", () => _action.revokeBang());
  const silenceBang = () => {
    _silence = true;
  };

  describe("#invoke!", () => {
    it("creates a file", async () => {
      createFile("doc/config.rb");
      await invokeBang();
      expect(File.isExist(File.join(destinationRoot, "doc/config.rb"))).toBe(true);
    });

    it("allows setting file permissions", async () => {
      createFile("config/private.key", { perm: 0o600 });
      await invokeBang();

      const stat = File.stat(File.join(destinationRoot, "config/private.key"));
      expect(stat.mode.toString(8)).toEqual("100600");
    });

    it("does not create a file if pretending", async () => {
      createFile("doc/config.rb", {}, { pretend: true });
      await invokeBang();
      expect(File.isExist(File.join(destinationRoot, "doc/config.rb"))).toBe(false);
    });

    it("shows created status to the user", async () => {
      createFile("doc/config.rb");
      expect(await invokeBang()).toEqual("      create  doc/config.rb\n");
    });

    it("does not show any information if log status is false", async () => {
      silenceBang();
      createFile("doc/config.rb");
      expect(await invokeBang()).toBeEmpty();
    });

    it("returns the given destination", async () => {
      await capture(":stdout", async () => {
        expect(await createFile("doc/config.rb").invokeBang()).toEqual("doc/config.rb");
      });
    });

    it("converts encoded instructions", async () => {
      createFile("doc/%file_name%.rb.tt");
      await invokeBang();
      expect(File.isExist(File.join(destinationRoot, "doc/rdoc.rb.tt"))).toBe(true);
    });

    describe("when file exists", () => {
      beforeEach(async () => {
        createFile("doc/config.rb");
        await invokeBang();
      });

      describe("and is identical", () => {
        it("shows identical status", async () => {
          createFile("doc/config.rb");
          await invokeBang();
          expect(await invokeBang()).toEqual("   identical  doc/config.rb\n");
        });
      });

      describe("and is not identical", () => {
        beforeEach(() => {
          File.write(File.join(destinationRoot, "doc/config.rb"), "FOO = 3");
        });

        it("shows forced status to the user if force is given", async () => {
          expect(await createFile("doc/config.rb", {}, { force: true }).isIdentical()).toBeFalsy();
          expect(await invokeBang()).toEqual("       force  doc/config.rb\n");
        });

        it("shows skipped status to the user if skip is given", async () => {
          expect(await createFile("doc/config.rb", {}, { skip: true }).isIdentical()).toBeFalsy();
          expect(await invokeBang()).toEqual("        skip  doc/config.rb\n");
        });

        it("shows forced status to the user if force is configured", async () => {
          expect(await createFile("doc/config.rb", { force: true }).isIdentical()).toBeFalsy();
          expect(await invokeBang()).toEqual("       force  doc/config.rb\n");
        });

        it("shows skipped status to the user if skip is configured", async () => {
          expect(await createFile("doc/config.rb", { skip: true }).isIdentical()).toBeFalsy();
          expect(await invokeBang()).toEqual("        skip  doc/config.rb\n");
        });

        it("shows conflict status to the user", async () => {
          const file = File.join(destinationRoot, "doc/config.rb");
          expect(await createFile("doc/config.rb").isIdentical()).toBeFalsy();
          readline.mockReturnValueOnce("s");

          const content = await invokeBang();
          expect(readline).toHaveBeenCalledExactlyOnceWith(
            `Overwrite ${file}? (enter "h" for help) [Ynaqdhm] `,
            expect.anything(),
          );
          expect(content).toMatch(/conflict {2}doc\/config\.rb/);
          expect(content).toMatch(/skip {2}doc\/config\.rb/);
        });

        it("creates the file if the file collision menu returns true", async () => {
          createFile("doc/config.rb");
          readline.mockReturnValueOnce("y");
          expect(await invokeBang()).toMatch(/force {2}doc\/config\.rb/);
          expect(readline).toHaveBeenCalledTimes(1);
        });

        it("skips the file if the file collision menu returns false", async () => {
          createFile("doc/config.rb");
          readline.mockReturnValueOnce("n");
          expect(await invokeBang()).toMatch(/skip {2}doc\/config\.rb/);
          expect(readline).toHaveBeenCalledTimes(1);
        });

        it("executes the block given to show file content", async () => {
          createFile("doc/config.rb");
          readline.mockReturnValueOnce("d").mockReturnValueOnce("n");
          await invokeBang();
          expect(readline).toHaveBeenCalledTimes(2);
          expect(rbFSystem).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/diff -u/));
        });

        it("executes the block given to run merge tool", async () => {
          createFile("doc/config.rb");
          Object.assign(_base.shell, { mergeTool: async () => "meld" });
          readline.mockReturnValueOnce("m");
          await invokeBang();
          expect(readline).toHaveBeenCalledTimes(1);
          expect(rbFSystem).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/meld/));
        });
      });
    });

    describe("when file exists and it causes a file clash", () => {
      beforeEach(async () => {
        createFile("doc/config");
        await invokeBang();
      });

      it("generates a file clash", async () => {
        createFile("doc/config/config.rb");
        expect(await invokeBang()).toEqual("  file_clash  doc/config/config.rb\n");
      });
    });

    describe("when directory exists and it causes a file clash", () => {
      beforeEach(async () => {
        createFile("doc/config/hello");
        await invokeBang();
      });

      it("generates a file clash", async () => {
        createFile("doc/config");
        expect(await invokeBang()).toEqual("  file_clash  doc/config\n");
      });
    });
  });

  describe("#revoke!", () => {
    it("removes the destination file", async () => {
      createFile("doc/config.rb");
      await invokeBang();
      await revokeBang();
      expect(File.isExist(_action.destination)).toBe(false);
    });

    it("does not raise an error if the file does not exist", async () => {
      createFile("doc/config.rb");
      await revokeBang();
      expect(File.isExist(_action.destination)).toBe(false);
    });
  });

  describe("#exists?", () => {
    it("returns true if the destination file exists", async () => {
      createFile("doc/config.rb");
      expect(await _action.isExists()).toBe(false);
      await invokeBang();
      expect(await _action.isExists()).toBe(true);
    });
  });

  describe("#identical?", () => {
    it("returns true if the destination file exists and is identical", async () => {
      createFile("doc/config.rb");
      expect(await _action.isIdentical()).toBe(false);
      await invokeBang();
      expect(await _action.isIdentical()).toBe(true);
    });

    it("returns true if the destination file exists and is identical and contains multi-byte UTF-8 codepoints", async () => {
      createFile("doc/config.rb", {}, {}, "€");
      expect(await _action.isIdentical()).toBe(false);
      await invokeBang();
      expect(await _action.isIdentical()).toBe(true);
    });
  });
});
