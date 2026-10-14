import { describe, it, expect } from "vitest";
import { UrlConfig } from "./url-config.js";

describe("DatabaseConfigurations", () => {
  describe("UrlConfigTest", () => {
    it("schema dump parsing", () => {
      let config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?schema_dump=false",
        {},
      );
      expect(config.schemaDump()).toBeNull();

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?schema_dump=db/foo_schema.rb",
        {},
      );
      expect(config.schemaDump()).toBe("db/foo_schema.rb");

      config = new UrlConfig("default_env", "primary", "postgres://localhost/foo", {});
      expect(config.schemaDump()).toBe("schema.ts");
    });

    it("query cache parsing", () => {
      let config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?query_cache=false",
        {},
      );
      expect(config.queryCache).toBe(false);

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?query_cache=42",
        {},
      );
      expect(config.queryCache).toBe("42");
    });

    it("replica parsing", () => {
      let config = new UrlConfig("default_env", "primary", "postgres://localhost/foo", {});
      expect(config.replica).toBeUndefined();

      config = new UrlConfig("default_env", "primary", "postgres://localhost/foo?replica=true", {});
      expect(config.replica).toBe(true);

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?replica=false",
        {},
      );
      expect(config.replica).toBe(false);

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?replica=random",
        {},
      );
      expect(config.replica).toBe(true);
    });

    it("database tasks parsing", () => {
      let config = new UrlConfig("default_env", "primary", "postgres://localhost/foo", {});
      expect(config.databaseTasks()).toBe(true);

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?database_tasks=random",
        {},
      );
      expect(config.databaseTasks()).toBe(true);

      config = new UrlConfig(
        "default_env",
        "primary",
        "postgres://localhost/foo?database_tasks=false",
        {},
      );
      expect(config.databaseTasks()).toBe(false);
    });
  });
});
