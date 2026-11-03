import "@blazetrails/vitest-matchers/setup";
import "@blazetrails/vitest-matchers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Loader } from "./loader.js";
import { get, newLoader, teardown, withSetup } from "./test-helpers/loader-test.js";

describe("TestTopLevel", () => {
  class Namespace {}

  let loader: Loader;

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
  });
  afterEach(teardown);

  it("autoloads a simple constant in a top-level file (Object)", async () => {
    await withSetup(loader, [["x.ts", "export const X = true"]], {}, async () => {
      expect(await get(Object, "X")).toBeTruthy();
    });
  });

  it("autoloads a simple constant in a top-level file (Namespace)", async () => {
    const files: [string, string][] = [["x.ts", "export const X = true"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      expect(await get(Namespace, "X")).toBeTruthy();
    });
  });

  it("autoloads a simple class in a top-level file (Object)", async () => {
    await withSetup(loader, [["user.ts", "export class User {}"]], {}, async () => {
      expect(await get(Object, "User")).toBeTruthy();
    });
  });

  it("autoloads a simple class in a top-level file (Namespace)", async () => {
    const files: [string, string][] = [["user.ts", "export class User {}"]];
    await withSetup(loader, files, { namespace: Namespace }, async () => {
      expect(await get(Namespace, "User")).toBeTruthy();
    });
  });

  it("autoloads several top-level classes", async () => {
    const files: [string, string][] = [
      ["rd1/user.ts", "export class User {}"],
      [
        "rd2/users_controller.ts",
        'export class UsersController {}; await globalThis.$get("User");',
      ],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(Object, "UsersController")).toBeTruthy();
    });
  });

  it("autoloads only the first of multiple occurrences", async () => {
    const files: [string, string][] = [
      ["rd1/user.ts", 'export const User = "model"'],
      ["rd2/user.ts", 'export const User = "decorator"'],
    ];
    await withSetup(loader, files, {}, async () => {
      expect(await get(Object, "User")).toEqual("model");
    });
  });

  it("anything other than Ruby and visible directories is ignored", async () => {
    const files: [string, string][] = [
      ["x.txt", ""],
      ["x.lua", ""],
      ["x.yaml", ""],
      ["x.json", ""],
      ["x.tse", ""],
      ["x.jpg", ""],
      ["x.ts~", ""],
      ["#x.ts#", ""],
      [".filename.swp", ""],
      ["4913", ""],
      [".idea/workspace.xml", ""],
    ];
    await withSetup(loader, files, {}, () => {
      expect(loader.autoloads).toBeEmpty();
    });
  });
});
