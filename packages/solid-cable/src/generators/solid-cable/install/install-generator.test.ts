import { beforeEach, describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { InstallGenerator } from "./install-generator.js";

describe("SolidCable::InstallGeneratorTest", () => {
  let destinationRoot: string;

  beforeEach(async () => {
    destinationRoot = Dir.mktmpdir();
    await InstallGenerator.start([], { destinationRoot });
  });

  it("cable_schema exists", () => {
    expect(File.isExist(File.join(destinationRoot, "db/cable_schema.ts"))).toBe(true);
  });

  it("cable.yml exists", () => {
    expect(File.isExist(File.join(destinationRoot, "config/cable.ts"))).toBe(true);
  });
});
