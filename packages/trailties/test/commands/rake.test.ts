import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { RakeCommand } from "../../lib/commands/rake.js";

describe("Trails::Command::RakeTest", () => {
  const originalCwd = Dir.pwd();
  let appPath: string;

  beforeEach(() => {
    appPath = Dir.mktmpdir("rake-command-test");
    Dir.chdir(appPath);
  });

  afterEach(async () => {
    Dir.chdir(originalCwd);
    await Base.connectionHandler.clearAllConnectionsBang("all");
    FileUtils.rmRf(appPath);
  });

  it("leaves no connection open after the rake task finishes", async () => {
    File.write(
      "Rakefile.ts",
      `import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/activerecord";
DSL.task("connects", block(async () => {
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  await (await Base.leaseConnection()).execute("SELECT 1");
}));`,
    );

    await RakeCommand.perform("connects", [], {});

    expect(
      Base.connectionHandler.connectionPoolList("all").filter((pool) => pool.isConnected()),
    ).toEqual([]);
  }, 30_000);
});
