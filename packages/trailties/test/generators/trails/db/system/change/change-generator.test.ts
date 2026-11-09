import { capture } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Dir, File, type Hash } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "../../../../../../lib/generators/test-case.js";
import {
  assertComposeFile,
  assertDevcontainerJsonFile,
  copyDevcontainerFiles,
  copyDockerfile,
  copyMinimalDevcontainerComposeFile,
} from "../../../../generators-test-helper.js";
import { ChangeGenerator } from "../../../../../../lib/generators/trails/db/system/change/change-generator.js";

class ChangeGeneratorTest extends TestCase {}
ChangeGeneratorTest.destination(File.join(Dir.mktmpdir(), "tmp"));
ChangeGeneratorTest.tests(ChangeGenerator);
registerSpecType(/^ChangeGeneratorTest$/, ChangeGeneratorTest);
let t: TestCase;

type ComposeConfig = Hash<string, any>;

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  File.write(
    File.join(t.destinationRoot, "package.json"),
    JSON.stringify({ name: "tmp", dependencies: { "better-sqlite3": "^13.0.3" } }, null, 2) + "\n",
  );

  await copyDockerfile.call(t);
  await copyDevcontainerFiles.call(t);
});

describe("ChangeGeneratorTest", () => {
  it("change to invalid database", async () => {
    const output = await capture("stderr", () => t.runGenerator(["--to", "invalid-db"]));

    expect(output).toMatch(
      "Invalid value for --to option. Supported preconfigurations are: mysql, postgresql, sqlite3, mariadb-mysql.",
    );
  });

  it("change to postgresql", async () => {
    await t.runGenerator(["--to", "postgresql"]);

    await t.assertFile("config/database.ts", (content) => {
      expect(content).toMatch('adapter: "postgresql"');
      expect(content).toMatch('database: "tmp_development"');
      expect(content).toMatch('host: process.env.DB_HOST ?? "localhost"');
    });

    await t.assertFile("package.json", (content) => {
      expect(JSON.parse(content).dependencies.pg).toBe("^8.19.0");
    });

    await t.assertFile("Dockerfile", (content) => {
      expect(content).toMatch("build-essential git libpq-dev");
      expect(content).toMatch("curl libvips postgresql-client");
    });

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toBe("postgres");
      expect(Object.keys(content.features)).toContain(
        "ghcr.io/rails/devcontainer/features/postgres-client",
      );
      expect(Object.keys(content.features)).not.toContain(
        "ghcr.io/rails/devcontainer/features/sqlite",
      );
    });

    await assertComposeFile.call(t, (composeConfig: ComposeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain(
        "postgres",
      );

      const expectedPostgresConfig = {
        image: "postgres:16.1",
        restart: "unless-stopped",
        networks: ["default"],
        volumes: ["postgres-data:/var/lib/postgresql/data"],
        environment: {
          POSTGRES_USER: "postgres",
          POSTGRES_PASSWORD: "postgres",
        },
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("postgres")))).toEqual(
        expectedPostgresConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("postgres-data");
    });
  });

  it("change to mysql", async () => {
    await t.runGenerator(["--to", "mysql"]);

    await t.assertFile("config/database.ts", (content) => {
      expect(content).toMatch('adapter: "mysql2"');
      expect(content).toMatch('database: "tmp_development"');
    });

    await t.assertFile("package.json", (content) => {
      expect(JSON.parse(content).dependencies.mysql2).toBe("^3.18.2");
    });

    await t.assertFile("Dockerfile", (content) => {
      expect(content).toMatch("build-essential default-libmysqlclient-dev git");
      expect(content).toMatch("curl default-mysql-client libvips");
    });

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toBe("mysql");
      expect(content.features["ghcr.io/rails/devcontainer/features/mysql-client"]).toEqual({});
    });

    await assertComposeFile.call(t, (composeConfig: ComposeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain("mysql");

      const expectedMysqlConfig = {
        image: "mysql/mysql-server:8.0",
        restart: "unless-stopped",
        environment: {
          MYSQL_ALLOW_EMPTY_PASSWORD: "true",
          MYSQL_ROOT_HOST: "%",
        },
        volumes: ["mysql-data:/var/lib/mysql"],
        networks: ["default"],
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("mysql")))).toEqual(
        expectedMysqlConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("mysql-data");
    });
  });

  it("change to sqlite3", async () => {
    await t.runGenerator(["--to", "sqlite3"]);

    await t.assertFile("config/database.ts", (content) => {
      expect(content).toMatch('adapter: "sqlite3"');
      expect(content).toMatch("storage/development.sqlite3");
    });

    await t.assertFile("package.json", (content) => {
      expect(JSON.parse(content).dependencies["better-sqlite3"]).toBe("^13.0.3");
    });

    await t.assertFile("Dockerfile", (content) => {
      expect(content).toMatch("build-essential git");
      expect(content).toMatch("curl libvips sqlite3");
    });

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(Object.keys(content.containerEnv)).not.toContain("DB_HOST");
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)".
  it.skip("change to trilogy", () => {});

  it("change to mariadb", async () => {
    await t.runGenerator(["--to", "mariadb-mysql"]);

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(content.containerEnv.DB_HOST).toMatch("mariadb");
    });

    await assertComposeFile.call(t, (composeConfig: ComposeConfig) => {
      expect(composeConfig.get("services").get("trails-app").get("depends_on")).toContain(
        "mariadb",
      );

      const expectedMariadbConfig = {
        image: "mariadb:10.5",
        restart: "unless-stopped",
        networks: ["default"],
        volumes: ["mariadb-data:/var/lib/mysql"],
        environment: {
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "true",
        },
      };

      expect(JSON.parse(JSON.stringify(composeConfig.get("services").get("mariadb")))).toEqual(
        expectedMariadbConfig,
      );
      expect(composeConfig.get("volumes").keys()).toContain("mariadb-data");
    });
  });

  it("change from versioned gem to other versioned gem", async () => {
    await t.runGenerator(["--to", "sqlite3"]);
    await t.runGenerator(["--to", "mysql", "--force"]);

    await t.assertFile("config/database.ts", (content) => {
      expect(content).toMatch('adapter: "mysql2"');
      expect(content).toMatch('database: "tmp_development"');
    });

    await t.assertFile("package.json", (content) => {
      expect(JSON.parse(content).dependencies.mysql2).toBe("^3.18.2");
    });
  });

  it("change from db with devcontainer service to one without", async () => {
    await copyMinimalDevcontainerComposeFile.call(t);
    await t.runGenerator(["--to", "mysql"]);
    await t.runGenerator(["--to", "sqlite3", "--force"]);

    await assertDevcontainerJsonFile.call(t, (content) => {
      expect(Object.keys(content.containerEnv)).not.toContain("DB_HOST");
      expect(Object.keys(content.features)).not.toContain(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
    });

    await assertComposeFile.call(t, (composeConfig: ComposeConfig) => {
      expect(composeConfig.get("services").get("trails-app").keys()).not.toContain("depends_on");
      expect(composeConfig.get("services").keys()).not.toContain("mysql");
      expect(composeConfig.keys()).not.toContain("volumes");
    });
  });
});
