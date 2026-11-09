import { Dir, File } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { HelperGenerator } from "../../../../lib/generators/trails/helper/helper-generator.js";

let root: string;

beforeEach(() => {
  root = Dir.mktmpdir();
});

describe("HelperGenerator", () => {
  it("strips a trailing dashed helper suffix", async () => {
    File.write(File.join(root, "tsconfig.json"), "{}");
    await new HelperGenerator(
      ["account-helper"],
      {},
      { destinationRoot: root },
    ).createHelperFiles();
    expect(File.isExist(File.join(root, "app/helpers/account-helper.ts"))).toBe(true);
  });

  it("exports the leaf constant from a namespaced file", async () => {
    File.write(File.join(root, "tsconfig.json"), "{}");
    await new HelperGenerator(["admin/account"], {}, { destinationRoot: root }).createHelperFiles();
    expect(File.read(File.join(root, "app/helpers/admin/account-helper.ts"))).toContain(
      "export const AccountHelper",
    );
  });

  it("generates .js helper for JS projects", async () => {
    await new HelperGenerator(["Posts"], {}, { destinationRoot: root }).createHelperFiles();
    expect(File.isExist(File.join(root, "app/helpers/posts-helper.js"))).toBe(true);
  });
});
