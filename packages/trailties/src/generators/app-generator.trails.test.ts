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

  it("guards each namespaced environment setting the way the Rails templates do", async () => {
    await new AppGenerator({
      cwd: tmpDir,
      output: () => {},
      appPath: "my-app",
      database: "sqlite",
      api: true,
      skipActiveRecord: true,
    }).run();

    const read = (env: string) =>
      File.read(File.join(tmpDir, "my-app", "config", "environments", `${env}.ts`));
    for (const env of ["development", "test", "production"]) {
      expect(read(env)).not.toMatch(/actionController\.performCaching = true/);
      expect(read(env)).not.toMatch(/activeRecord|actionMailer|activeStorage|activeJob/);
    }
    expect(read("development")).toMatch(/actionController\.performCaching = false/);
    expect(read("production")).toMatch(/this\.config\.i18n\.fallbacks = true;/);
    expect(read("production")).toMatch(
      /this\.config\.logger = TaggedLogging\.logger\(process\.stdout\);/,
    );
  });
});
