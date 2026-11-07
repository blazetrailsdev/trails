import { capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { GeneratorError } from "../../../../generated-attribute.js";
import { TestCase } from "../../../../test-case.js";
import { ChangeGenerator } from "./change-generator.js";

class ChangeGeneratorTrailsTest extends TestCase {}
ChangeGeneratorTrailsTest.destination(File.join(Dir.mktmpdir(), "tmp"));
ChangeGeneratorTrailsTest.tests(ChangeGenerator);
registerSpecType(/^ChangeGenerator$/, ChangeGeneratorTrailsTest);
let t: TestCase;

function write(relative: string, content: string): void {
  const full = File.join(t.destinationRoot, relative);
  FileUtils.mkdirP(File.dirname(full));
  File.write(full, content);
}

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  write("tsconfig.json", "{}");
  write("package.json", JSON.stringify({ dependencies: { "better-sqlite3": "^13.0.3" } }) + "\n");
});

describe("ChangeGenerator", () => {
  it("raises GeneratorError for an invalid --to option", () => {
    expect(() => new ChangeGenerator([], { to: "invalid-db" })).toThrow(GeneratorError);
  });

  it("removes the previous database package from package.json", async () => {
    write("package.json", JSON.stringify({ dependencies: { pg: "^8.19.0" } }) + "\n");
    await t.runGenerator(["--to", "sqlite3"]);
    const pkg = JSON.parse(File.read(File.join(t.destinationRoot, "package.json")));
    expect(pkg.dependencies["better-sqlite3"]).toBe("^13.0.3");
    expect(pkg.dependencies.pg).toBeUndefined();
  });

  it("no Dockerfile is a no-op", async () => {
    await t.runGenerator(["--to", "mysql"]);
    t.assertNoFile("Dockerfile");
    await t.assertFile("config/database.ts");
  });

  it("editDatabaseConfig fallback honors isTypeScript()", async () => {
    File.delete(File.join(t.destinationRoot, "tsconfig.json"));
    await t.runGenerator(["--to", "postgresql"]);
    await t.assertFile("config/database.js");
    t.assertNoFile("config/database.ts");
  });

  it("editDockerfile prefers longest-match alternation", async () => {
    write("Dockerfile", "RUN apt-get install -y build-essential git libpq-dev\n");
    await t.runGenerator(["--to", "mysql"]);
    await t.assertFile(
      "Dockerfile",
      "RUN apt-get install -y build-essential default-libmysqlclient-dev git\n",
    );
  });

  it("editDockerfile does not match inside a longer word token", async () => {
    write("Dockerfile", "RUN apt-get install -y build-essential gitlab-cli\n");
    await t.runGenerator(["--to", "postgresql"]);
    await t.assertFile("Dockerfile", "RUN apt-get install -y build-essential gitlab-cli\n");
  });

  it("editDockerfile is a no-op when no DB package lines match", async () => {
    write("Dockerfile", "FROM node:22-slim\nRUN echo hello\n");
    const output = await capture("stdout", () => t.runGenerator(["--to", "mysql"]));
    await t.assertFile("Dockerfile", "FROM node:22-slim\nRUN echo hello\n");
    expect(output).not.toContain("Dockerfile");
  });

  it("editDevcontainerFiles skipped when no .devcontainer dir", async () => {
    await t.runGenerator(["--to", "postgresql"]);
    t.assertNoFile(".devcontainer/devcontainer.json");
  });
});
