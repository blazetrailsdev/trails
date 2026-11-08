import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, extend, File, FileUtils } from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { MyCounter as MyCounterFixture } from "../test-helpers/fixtures/group.js";
import { capture } from "../test-helpers/helper.js";
import { EmptyDirectory } from "./empty-directory.js";

type CounterInstance = ActionsHost & {
  inside<T>(dir: string, config: object, block: () => T | Promise<T>): Promise<T>;
};
const MyCounter = MyCounterFixture as unknown as new (...args: unknown[]) => CounterInstance;

let destinationRoot: string;

beforeAll(() => {
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
});
afterAll(() => {
  FileUtils.rmRf(destinationRoot);
});

describe("Thor::Actions::EmptyDirectory", () => {
  let _base: CounterInstance | undefined;
  let _action: EmptyDirectory;

  beforeEach(() => {
    _base = undefined;
    FileUtils.rmRf(destinationRoot);
  });

  const base = () => (_base ??= new MyCounter([1, 2], {}, { destinationRoot }));
  const emptyDirectory = (destination: string) =>
    (_action = new EmptyDirectory(base(), destination));
  const invokeBang = () => capture(":stdout", () => _action.invokeBang());
  const revokeBang = () => capture(":stdout", () => _action.revokeBang());
  const convertEncodedInstructions = (filename: string): string =>
    (
      _action as unknown as { convertEncodedInstructions(filename: string): string }
    ).convertEncodedInstructions(filename);

  describe("#destination", () => {
    it("returns the full destination with the destination_root", () => {
      expect(emptyDirectory("doc").destination).toEqual(File.join(destinationRoot, "doc"));
    });

    it("takes relative root into account", async () => {
      await base().inside("doc", {}, () => {
        expect(emptyDirectory("contents").destination).toEqual(
          File.join(destinationRoot, "doc", "contents"),
        );
      });
    });
  });

  describe("#relative_destination", () => {
    it("returns the relative destination to the original destination root", async () => {
      await base().inside("doc", {}, () => {
        expect(emptyDirectory("contents").relativeDestination).toEqual("doc/contents");
      });
    });
  });

  describe("#given_destination", () => {
    it("returns the destination supplied by the user", async () => {
      await base().inside("doc", {}, () => {
        expect(emptyDirectory("contents").givenDestination).toEqual("contents");
      });
    });
  });

  describe("#invoke!", () => {
    it("copies the file to the specified destination", async () => {
      emptyDirectory("doc");
      await invokeBang();
      expect(File.isExist(File.join(destinationRoot, "doc"))).toBe(true);
    });

    it("shows created status to the user", async () => {
      emptyDirectory("doc");
      expect(await invokeBang()).toEqual("      create  doc\n");
    });

    it("does not create a directory if pretending", async () => {
      await base().inside("foo", { pretend: true }, () => {
        emptyDirectory("ghost");
      });
      expect(File.isExist(File.join(base().destinationRoot, "ghost"))).toBe(false);
    });

    describe("when directory exists", () => {
      it("shows exist status", async () => {
        emptyDirectory("doc");
        await invokeBang();
        expect(await invokeBang()).toEqual("       exist  doc\n");
      });
    });
  });

  describe("#revoke!", () => {
    it("removes the destination file", async () => {
      emptyDirectory("doc");
      await invokeBang();
      await revokeBang();
      expect(File.isExist(_action.destination)).toBe(false);
    });
  });

  describe("#exists?", () => {
    it("returns true if the destination file exists", async () => {
      emptyDirectory("doc");
      expect(await _action.isExists()).toBe(false);
      await invokeBang();
      expect(await _action.isExists()).toBe(true);
    });
  });

  describe("protected methods", () => {
    describe("#convert_encoded_instructions", () => {
      beforeEach(() => {
        emptyDirectory("test_dir");
        Object.assign(_action.base, { fileName: () => "expected" });
      });

      it("accepts and executes a 'legal' %\\w+% encoded instruction", () => {
        expect(convertEncodedInstructions("%file_name%.txt")).toEqual("expected.txt");
      });

      it("accepts and executes a private %\\w+% encoded instruction", () => {
        extend(_action.base, {
          privateFileName() {
            return "expected";
          },
        });
        expect(convertEncodedInstructions("%private_file_name%.txt")).toEqual("expected.txt");
      });

      it("ignores an 'illegal' %\\w+% encoded instruction", () => {
        expect(convertEncodedInstructions("%some_name%.txt")).toEqual("%some_name%.txt");
      });

      it("ignores incorrectly encoded instruction", () => {
        expect(convertEncodedInstructions("%some.name%.txt")).toEqual("%some.name%.txt");
      });
    });
  });
});
