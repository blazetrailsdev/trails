import { describe, it, expect } from "vitest";
import { UrlConfig } from "./url-config.js";

describe("DatabaseConfigurations", () => {
  describe("UrlConfigTest", () => {
    it.skip("schema dump parsing", () => {
      // BLOCKED: connection-pool — database configuration parsing gap in url-config
      // ROOT-CAUSE: database-configurations.ts or connection-url-resolver.ts missing Rails parity for config resolution
      // SCOPE: ~30–50 LOC fix in database-configurations.ts; affects ~5–34 tests in url-config.test.ts
    });
    it.skip("query cache parsing", () => {
      // BLOCKED: connection-pool — database configuration parsing gap in url-config
      // ROOT-CAUSE: database-configurations.ts or connection-url-resolver.ts missing Rails parity for config resolution
      // SCOPE: ~30–50 LOC fix in database-configurations.ts; affects ~5–34 tests in url-config.test.ts
    });
    it.skip("replica parsing", () => {
      // BLOCKED: connection-pool — database configuration parsing gap in url-config
      // ROOT-CAUSE: database-configurations.ts or connection-url-resolver.ts missing Rails parity for config resolution
      // SCOPE: ~30–50 LOC fix in database-configurations.ts; affects ~5–34 tests in url-config.test.ts
    });
    it.skip("database tasks parsing", () => {
      // BLOCKED: connection-pool — database configuration parsing gap in url-config
      // ROOT-CAUSE: database-configurations.ts or connection-url-resolver.ts missing Rails parity for config resolution
      // SCOPE: ~30–50 LOC fix in database-configurations.ts; affects ~5–34 tests in url-config.test.ts
    });

    // Mirrors Rails' UrlConfig#database — when the configuration hash
    // doesn't carry an explicit `database`, fall back to the URL path.
    it("derives database from a parseable URL when configuration.database is unset", () => {
      const cfg = new UrlConfig("test", "primary", "postgres://h/mydb");
      expect(cfg.database).toBe("mydb");
    });

    it("treats a bare filesystem path as the database name", () => {
      // No URL scheme → buildUrlHash passes through; the override falls
      // back to the URL string itself (matches Rails' raw-path handling).
      const cfg = new UrlConfig("test", "primary", "test/db/primary.sqlite3");
      expect(cfg.database).toBe("test/db/primary.sqlite3");
    });
  });
});
