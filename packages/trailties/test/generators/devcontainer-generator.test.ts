import { Dir, File } from "@blazetrails/ruby-compat";
import { sole } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeEach, describe, expect, it } from "vitest";
import { DevcontainerGenerator } from "../../lib/generators/trails/devcontainer/devcontainer-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";
import { Generators } from "../../lib/generators.js";
import {
  assertComposeFile,
  assertDevcontainerJsonFile,
  copyApplicationSystemTestCase,
} from "./generators-test-helper.js";

class DevcontainerGeneratorTest extends TestCase {}
DevcontainerGeneratorTest.destination(Dir.mktmpdir());
DevcontainerGeneratorTest.tests(DevcontainerGenerator);
registerSpecType(/^DevcontainerGeneratorTest$/, DevcontainerGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
});

const plain = (value: unknown): any => JSON.parse(JSON.stringify(value));

async function testCommonConfig(): Promise<void> {
  const nodeVersion = (
    await File.readAsync(File.expandPath("../../../../.node-version", import.meta.dirname))
  ).trim();
  await t.assertFile(".devcontainer/Dockerfile", (dockerfile) => {
    expect(dockerfile).toMatch(new RegExp(`ARG NODE_VERSION=${nodeVersion}`));
  });

  await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
    expect(Object.keys(devcontainerJson.features)).toContain(
      "ghcr.io/devcontainers/features/github-cli:1",
    );
    expect(devcontainerJson.forwardPorts).toContain(3000);
  });

  await assertComposeFile.call(t, (compose) => {
    const expectedAppConfig = {
      build: {
        context: "..",
        dockerfile: ".devcontainer/Dockerfile",
      },
      volumes: ["../..:/workspaces:cached"],
      command: "sleep infinity",
    };
    const { depends_on: _dependsOn, ...actualIndependentConfig } = plain(
      compose.get("services").get("trails-app"),
    );
    expect(actualIndependentConfig).toEqual(expectedAppConfig);
  });
}

describe("DevcontainerGeneratorTest", () => {
  it("creates devcontainer files", async () => {
    await t.runGenerator();

    await t.assertFile(".devcontainer/compose.yaml");
    await t.assertFile(".devcontainer/Dockerfile");
    await t.assertFile(".devcontainer/devcontainer.json");
    await testCommonConfig();
  });

  it("active storage option default", async () => {
    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/rails/devcontainer/features/activestorage",
      );
    });
  });

  it("active storage option skip", async () => {
    await t.runGenerator(["--skip-active-storage"]);

    await testCommonConfig();
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(
        devcontainerJson.features["ghcr.io/rails/devcontainer/features/activestorage"],
      ).toBeUndefined();
    });
  });

  it("app name option default", async () => {
    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.name).toBe("trails_app");
    });

    await assertComposeFile.call(t, (compose) => {
      expect(compose.get("name")).toBe("trails_app");
    });
  });

  it("app name option", async () => {
    await t.runGenerator(["--app-name", "my-TestApp_name"]);

    await testCommonConfig();
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.name).toBe("my-TestApp_name");
    });

    await assertComposeFile.call(t, (compose) => {
      expect(compose.get("name")).toBe("my-TestApp_name");
    });
  });

  it("database default sqlite3", async () => {
    await t.runGenerator();

    t.assertNoFile("config/database.ts");
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/rails/devcontainer/features/sqlite3",
      );
    });
  });

  it("database mariadb mysql", async () => {
    await t.runGenerator(["--database", "mariadb-mysql"]);

    await testCommonConfig();
    t.assertNoFile("config/database.ts");
    await assertComposeFile.call(t, (compose) => {
      const expectedMariadbConfig = {
        image: "mariadb:10.5",
        restart: "unless-stopped",
        networks: ["default"],
        volumes: ["mariadb-data:/var/lib/mysql"],
        environment: {
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "true",
        },
      };
      expect(plain(compose.get("services").get("mariadb"))).toEqual(expectedMariadbConfig);
      expect(compose.get("volumes").keys()).toContain("mariadb-data");
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).toContain(
        "mariadb",
      );
    });

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.DB_HOST).toBe("mariadb");
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
      expect(devcontainerJson.forwardPorts).toContain(3306);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)".
  it.skip("database mariadb trilogy", () => {});

  it("database mysql", async () => {
    await t.runGenerator(["--database", "mysql"]);

    await testCommonConfig();
    t.assertNoFile("config/database.ts");
    await assertComposeFile.call(t, (compose) => {
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
      expect(plain(compose.get("services").get("mysql"))).toEqual(expectedMysqlConfig);
      expect(compose.get("volumes").keys()).toContain("mysql-data");
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).toContain("mysql");
    });

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.DB_HOST).toBe("mysql");
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/rails/devcontainer/features/mysql-client",
      );
      expect(devcontainerJson.forwardPorts).toContain(3306);
    });
  });

  it("database postgresql", async () => {
    await t.runGenerator(["--database", "postgresql"]);

    await testCommonConfig();

    await t.assertFile("config/database.ts", (dbConfig) => {
      expect(dbConfig).toMatch(/host: process\.env\.DB_HOST/);
      expect(dbConfig).toMatch(/username: "postgres"/);
      expect(dbConfig).toMatch(/password: "postgres"/);
    });

    await assertComposeFile.call(t, (compose) => {
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
      expect(plain(compose.get("services").get("postgres"))).toEqual(expectedPostgresConfig);
      expect(compose.get("volumes").keys()).toContain("postgres-data");
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).toContain(
        "postgres",
      );
    });

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.DB_HOST).toBe("postgres");
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/rails/devcontainer/features/postgres-client",
      );
      expect(devcontainerJson.forwardPorts).toContain(5432);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "Trilogy is out of scope (`trilogy_adapter.rb`, `adapters/trilogy/`)".
  it.skip("database trilogy", () => {});

  it("dev option default", async () => {
    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.mounts).toBeUndefined();
    });
  });

  it("dev option", async () => {
    await t.runGenerator(["--dev"]);

    await testCommonConfig();
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      const mounts = sole(devcontainerJson.mounts as Record<string, string>[]);

      expect(mounts.type).toBe("bind");
      expect(mounts.source).toBe(Generators.TRAILS_DEV_PATH);
      expect(mounts.target).toBe(Generators.TRAILS_DEV_PATH);
    });
  });

  it("node option default", async () => {
    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).not.toContain(
        "ghcr.io/devcontainers/features/node:1",
      );
    });
  });

  it("node option", async () => {
    await t.runGenerator(["--node"]);

    await testCommonConfig();
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/devcontainers/features/node:1",
      );
    });
  });

  it("redis option default", async () => {
    await t.runGenerator();

    await assertComposeFile.call(t, (compose) => {
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).toContain("redis");
      const expectedRedisConfig = {
        image: "redis:7.2",
        restart: "unless-stopped",
        volumes: ["redis-data:/data"],
      };
      expect(plain(compose.get("services").get("redis"))).toEqual(expectedRedisConfig);
      expect(compose.get("volumes").keys()).toEqual(["redis-data"]);
    });

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.REDIS_URL).toBe("redis://redis:6379/1");
      expect(devcontainerJson.forwardPorts).toContain(6379);
    });
  });

  it("redis option skip", async () => {
    await t.runGenerator(["--skip-redis"]);

    await testCommonConfig();
    await assertComposeFile.call(t, (compose) => {
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).not.toContain(
        "redis",
      );
      expect(compose.get("services").get("redis")).toBeUndefined();
      expect(compose.get("volumes")).toBeUndefined();
    });

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.forwardPorts).not.toContain(6379);
    });
  });

  it("kamal option default", async () => {
    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).toContain(
        "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
      );
      expect(devcontainerJson.containerEnv.KAMAL_REGISTRY_PASSWORD).toBe(
        "$KAMAL_REGISTRY_PASSWORD",
      );
    });
  });

  it("kamal option skip", async () => {
    await t.runGenerator(["--skip-kamal"]);

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(Object.keys(devcontainerJson.features)).not.toContain(
        "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
      );
      expect(Object.keys(devcontainerJson.containerEnv)).not.toContain("KAMAL_REGISTRY_PASSWORD");
    });
  });

  it("system test option default", async () => {
    await copyApplicationSystemTestCase.call(t);

    await t.runGenerator();

    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.CAPYBARA_SERVER_PORT).toBe("45678");
      expect(devcontainerJson.containerEnv.SELENIUM_HOST).toBe("selenium");
    });

    await t.assertFile("test/application-system-test-case.ts", (systemTestCase) => {
      expect(systemTestCase).toMatch(/^ {4}if \(process\.env\.CAPYBARA_SERVER_PORT\)/m);
      expect(systemTestCase).toMatch(
        /^ {6}this\.servedBy\(\{ host: "trails-app", port: process\.env\.CAPYBARA_SERVER_PORT \}\)/m,
      );
      expect(systemTestCase).toMatch(
        /^ {6}this\.drivenBy\("selenium", \{ using: "headless_chrome", screenSize: \[1400, 1400\], options: \{$/m,
      );
      expect(systemTestCase).toMatch(/^ {8}browser: "remote",$/m);
      expect(systemTestCase).toMatch(
        /^ {8}url: `http:\/\/\$\{process\.env\.SELENIUM_HOST\}:4444`$/m,
      );
    });
  });

  it("system test option does not create new file", async () => {
    await t.runGenerator(["--system-test"]);

    await testCommonConfig();
    t.assertNoFile("test/application-system-test-case.ts");
  });

  it("system test option skip", async () => {
    await copyApplicationSystemTestCase.call(t);

    await t.runGenerator(["--skip-system-test", "--force"]);

    await testCommonConfig();
    await assertComposeFile.call(t, (compose) => {
      expect(compose.get("services").get("trails-app").get("depends_on") ?? []).not.toContain(
        "selenium",
      );
      expect(compose.get("services").keys()).not.toContain("selenium");
    });
    await assertDevcontainerJsonFile.call(t, (devcontainerJson) => {
      expect(devcontainerJson.containerEnv.CAPYBARA_SERVER_PORT).toBeUndefined();
    });
  });
});
