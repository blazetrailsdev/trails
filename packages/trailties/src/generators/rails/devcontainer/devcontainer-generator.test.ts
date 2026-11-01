import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import {
  DevcontainerGenerator,
  type DevcontainerGeneratorOptions,
} from "./devcontainer-generator.js";
import { Generators } from "../../../generators.js";
let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-devcontainer-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
type Opts = Partial<DevcontainerGeneratorOptions>;
const run = async (o: Opts = {}) => {
  const generator = new DevcontainerGenerator([], o, { destinationRoot: tmpDir });
  await generator.createDevcontainer();
  await generator.updateApplicationSystemTestCase();
  await generator.updateDatabaseYml();
};
const read = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), "utf-8");
const exists = (rel: string) => fs.existsSync(path.join(tmpDir, rel));
const dc = () =>
  JSON.parse(read(".devcontainer/devcontainer.json").replace(/^\s*\/\/.*$/gm, "")) as Record<
    string,
    unknown
  >;
const cm = () =>
  JSON.parse(JSON.stringify(YAML.load(read(".devcontainer/compose.yaml")))) as Record<
    string,
    unknown
  >;
const features = () => dc().features as Record<string, unknown>;
const env = () => (dc().containerEnv as Record<string, string> | undefined) ?? {};
const services = () => cm().services as Record<string, Record<string, unknown>>;
describe("DevcontainerGeneratorTest", () => {
  it("test_creates_devcontainer_files", async () => {
    await run();
    expect(exists(".devcontainer/compose.yaml")).toBe(true);
    expect(exists(".devcontainer/Dockerfile")).toBe(true);
    expect(exists(".devcontainer/devcontainer.json")).toBe(true);
  });
  it("test_active_storage_option_default", async () => {
    await run();
    expect(features()).toHaveProperty("ghcr.io/rails/devcontainer/features/activestorage");
  });
  it("test_active_storage_option_skip", async () => {
    await run({ activeStorage: false });
    expect(features()).not.toHaveProperty("ghcr.io/rails/devcontainer/features/activestorage");
  });
  it("test_app_name_option_default", async () => {
    await run();
    expect(dc().name).toBe("rails_app");
    expect(cm().name).toBe("rails_app");
  });
  it("test_app_name_option", async () => {
    await run({ appName: "my-TestApp_name" });
    expect(dc().name).toBe("my-TestApp_name");
    expect(cm().name).toBe("my-TestApp_name");
  });
  it("test_database_default_sqlite3", async () => {
    await run();
    expect(exists("config/database.yml")).toBe(false);
    expect(features()).toHaveProperty("ghcr.io/rails/devcontainer/features/sqlite3");
  });
  it("test_database_mariadb_mysql", async () => {
    await run({ database: "mariadb-mysql" });
    expect(services().mariadb).toEqual({
      image: "mariadb:10.5",
      restart: "unless-stopped",
      networks: ["default"],
      volumes: ["mariadb-data:/var/lib/mysql"],
      environment: { MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "true" },
    });
    expect(cm().volumes).toHaveProperty("mariadb-data");
    expect(services()["rails-app"].depends_on).toContain("mariadb");
    expect(env().DB_HOST).toBe("mariadb");
    expect(features()).toHaveProperty("ghcr.io/rails/devcontainer/features/mysql-client");
    expect(dc().forwardPorts).toContain(3306);
  });
  it("test_database_mysql", async () => {
    await run({ database: "mysql" });
    expect(services().mysql).toMatchObject({ image: "mysql/mysql-server:8.0" });
    expect(cm().volumes).toHaveProperty("mysql-data");
    expect(env().DB_HOST).toBe("mysql");
    expect(dc().forwardPorts).toContain(3306);
    expect(exists("config/database.ts")).toBe(false);
  });
  it("test_database_postgresql", async () => {
    await run({ database: "postgresql" });
    expect(services().postgres).toMatchObject({ image: "postgres:16.1" });
    expect(env().DB_HOST).toBe("postgres");
    expect(features()).toHaveProperty("ghcr.io/rails/devcontainer/features/postgres-client");
    expect(dc().forwardPorts).toContain(5432);
    expect(read("config/database.ts")).toMatch(/process\.env\.DB_HOST/);
  });
  it("test_dev_option_default", async () => {
    await run();
    expect(dc().mounts).toBeUndefined();
  });
  it("test_dev_option", async () => {
    await run({ dev: true });
    const m = (dc().mounts as Array<Record<string, string>>)[0];
    expect(m).toEqual({
      type: "bind",
      source: Generators.RAILS_DEV_PATH,
      target: Generators.RAILS_DEV_PATH,
    });
  });
  it("test_node_option_default", async () => {
    await run();
    expect(features()).not.toHaveProperty("ghcr.io/devcontainers/features/node:1");
  });
  it("test_node_option", async () => {
    await run({ node: true });
    expect(features()).toHaveProperty("ghcr.io/devcontainers/features/node:1");
  });
  it("test_redis_option_default", async () => {
    await run();
    expect(services()["rails-app"].depends_on).toContain("redis");
    expect(services().redis).toEqual({
      image: "redis:7.2",
      restart: "unless-stopped",
      volumes: ["redis-data:/data"],
    });
    expect(env().REDIS_URL).toBe("redis://redis:6379/1");
    expect(dc().forwardPorts).toContain(6379);
  });
  it("test_redis_option_skip", async () => {
    await run({ redis: false });
    expect(services()["rails-app"].depends_on ?? []).not.toContain("redis");
    expect(services().redis).toBeUndefined();
    expect(dc().forwardPorts).not.toContain(6379);
  });
  it("test_kamal_option_default", async () => {
    await run();
    expect(features()).toHaveProperty("ghcr.io/devcontainers/features/docker-outside-of-docker:1");
    expect(env().KAMAL_REGISTRY_PASSWORD).toBe("$KAMAL_REGISTRY_PASSWORD");
  });
  it("test_kamal_option_skip", async () => {
    await run({ kamal: false });
    expect(features()).not.toHaveProperty(
      "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
    );
    expect(env()).not.toHaveProperty("KAMAL_REGISTRY_PASSWORD");
  });
  it("test_system_test_option_default", async () => {
    fs.mkdirSync(path.join(tmpDir, "test"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "test/application_system_test_case.ts"),
      '  drivenBy(":selenium", { using: ":headless_chrome" });\n',
    );
    await run();
    expect(env().TRAILS_SYSTEM_TESTING_SERVER_PORT).toBe("45678");
    expect(env().SELENIUM_HOST).toBe("selenium");
    expect(read("test/application_system_test_case.ts")).toMatch(/servedBy/);
  });
  it("test_system_test_option_does_not_create_new_file", async () => {
    await run({ systemTest: true });
    expect(exists("test/application_system_test_case.ts")).toBe(false);
  });
  it("test_system_test_option_skip", async () => {
    await run({ systemTest: false });
    expect(services()["rails-app"].depends_on ?? []).not.toContain("selenium");
    expect(services().selenium).toBeUndefined();
    expect(env().TRAILS_SYSTEM_TESTING_SERVER_PORT).toBeUndefined();
  });
  it("test_dockerfile_content", async () => {
    await run({ nodeVersion: "20.0.0" });
    const dockerfile = read(".devcontainer/Dockerfile");
    expect(dockerfile).toContain("ARG NODE_VERSION=20.0.0");
    expect(dockerfile).toContain(
      "FROM mcr.microsoft.com/devcontainers/javascript-node:1-${NODE_VERSION}",
    );
  });
  it("test_sqlite_driver_node_sqlite", async () => {
    await run({ sqliteDriver: "node-sqlite" });
    expect(features()).not.toHaveProperty("ghcr.io/rails/devcontainer/features/sqlite3");
  });
});
