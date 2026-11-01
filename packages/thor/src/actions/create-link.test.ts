import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils, Pathname, Tempfile } from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { MyCounter as MyCounterFixture } from "../test-helpers/fixtures/group.js";
import { capture, isWindows } from "../test-helpers/helper.js";
import { CreateLink } from "./create-link.js";

const MyCounter = MyCounterFixture as unknown as new (...args: unknown[]) => ActionsHost;

let destinationRoot: string;

beforeAll(() => {
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
});
afterAll(() => {
  FileUtils.rmRf(destinationRoot);
});

describe.skipIf(isWindows())("Thor::Actions::CreateLink", () => {
  let hardlinkTo: string;
  let config: Record<string, unknown>;
  let options: Record<string, unknown>;
  let destination: string;
  let source: () => string;
  let _base: ActionsHost | undefined;
  let _tempfile: Tempfile | undefined;
  let _action: CreateLink | undefined;

  const base = (): ActionsHost => {
    if (_base == null) {
      _base = new MyCounter([1, 2], options, { destinationRoot });
      Object.assign(_base, { fileName: () => "rdoc" });
    }
    return _base;
  };
  const tempfile = () => (_tempfile ??= Tempfile.new("config.rb"));
  const action = () => (_action ??= new CreateLink(base(), destination, source(), config));
  const invokeBang = () => capture(":stdout", () => action().invokeBang());
  const revokeBang = () => capture(":stdout", () => action().revokeBang());

  beforeEach(() => {
    hardlinkTo = File.join(Dir.tmpdir(), "linkdest.rb");
    FileUtils.rmRf(destinationRoot);
    FileUtils.rmRf(hardlinkTo);
    config = {};
    options = {};
    destination = "doc/config.rb";
    source = () => tempfile().path()!;
    _base = _tempfile = _action = undefined;
  });

  describe("#invoke!", () => {
    describe("specifying :symbolic => true", () => {
      beforeEach(() => {
        config = { symbolic: true };
      });

      it("creates a symbolic link", async () => {
        await invokeBang();
        const destinationPath = File.join(destinationRoot, "doc/config.rb");
        expect(File.isExist(destinationPath)).toBe(true);
        expect(File.isSymlink(destinationPath)).toBe(true);
      });
    });

    describe("specifying :symbolic => false", () => {
      beforeEach(() => {
        config = { symbolic: false };
        destination = hardlinkTo;
      });

      it("creates a hard link", async () => {
        await invokeBang();
        const destinationPath = hardlinkTo;
        expect(File.isExist(destinationPath)).toBe(true);
        expect(File.isSymlink(destinationPath)).toBe(false);
      });
    });

    it("creates a symbolic link by default", async () => {
      await invokeBang();
      const destinationPath = File.join(destinationRoot, "doc/config.rb");
      expect(File.isExist(destinationPath)).toBe(true);
      expect(File.isSymlink(destinationPath)).toBe(true);
    });

    describe("specifying :pretend => true", () => {
      beforeEach(() => {
        options = { pretend: true };
      });

      it("does not create a link", async () => {
        await invokeBang();
        expect(File.isExist(File.join(destinationRoot, "doc/config.rb"))).toBe(false);
      });
    });

    it("shows created status to the user", async () => {
      expect(await invokeBang()).toEqual("      create  doc/config.rb\n");
    });

    describe("specifying :verbose => false", () => {
      beforeEach(() => {
        config = { verbose: false };
      });

      it("does not show any information", async () => {
        expect(await invokeBang()).toBeEmpty();
      });
    });
  });

  describe("#identical?", () => {
    it("returns true if the destination link exists and is identical", async () => {
      expect(await action().isIdentical()).toBe(false);
      await invokeBang();
      expect(await action().isIdentical()).toBe(true);
    });

    describe("with source path relative to destination", () => {
      beforeEach(() => {
        const superSource = source;
        source = () => {
          const destinationPath = File.dirname(File.join(destinationRoot, destination));
          return new Pathname(superSource())
            .relativePathFrom(new Pathname(destinationPath))
            .toString();
        };
      });

      it("returns true if the destination link exists and is identical", async () => {
        expect(await action().isIdentical()).toBe(false);
        await invokeBang();
        expect(await action().isIdentical()).toBe(true);
      });
    });
  });

  describe("#revoke!", () => {
    it("removes the symbolic link of non-existent destination", async () => {
      await invokeBang();
      File.delete(tempfile().path()!);
      await revokeBang();
      expect(File.isSymlink(action().destination)).toBe(false);
    });
  });
});
