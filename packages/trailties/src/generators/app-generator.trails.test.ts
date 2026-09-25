import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dir, File, FileUtils, SecureRandom } from "@blazetrails/ruby-compat";
import { AppGenerator } from "./app-generator.js";

describe("AppGenerator (trails-only)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = File.join(Dir.tmpdir(), `trails-app-generator-${SecureRandom.hex(8)}`);
    FileUtils.mkdirP(tmpDir);
  });

  afterEach(() => {
    FileUtils.rmRf(tmpDir);
  });

  it("builds with trails-tsc against db/schema.ts so models need no declares", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
    }).run();

    const pkg = JSON.parse(File.read(File.join(tmpDir, "my-app", "package.json")));
    expect(pkg.scripts.build).toBe("trails-tsc --schema db/schema.ts");
    expect(pkg.devDependencies["@blazetrails/activerecord-cli"]).toBeDefined();
    expect(File.isExist(File.join(tmpDir, "my-app", "db", "schema.ts"))).toBe(true);
  });
});
