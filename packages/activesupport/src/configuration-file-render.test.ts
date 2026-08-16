import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigurationFile } from "./configuration-file.js";

/**
 * trails-only coverage for `ConfigurationFile#render` (configuration_file.rb:54-58)
 * and `parse`'s `@content.include?("<%")` branch (:22). Rails' own
 * `ConfigurationFileTest` only exercises render through the two backtrace tests,
 * which assert on a template that raises; nothing there covers a template that
 * renders successfully before the YAML parse.
 */
describe("ConfigurationFile render", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function writeYaml(content: string): string {
    dir = mkdtempSync(join(tmpdir(), "config-render-"));
    const path = join(dir, "database.yml");
    writeFileSync(path, content);
    return path;
  }

  it("evaluates the template before parsing the YAML", () => {
    const path = writeYaml("pool: <%= 2 * 3 %>\n");
    expect(ConfigurationFile.parse(path)).toEqual({ pool: 6 });
  });

  it("evaluates against the given context", () => {
    const path = writeYaml("adapter: <%= adapter %>\ndatabase: <%= name %>_test\n");
    expect(
      ConfigurationFile.parse(path, { context: { adapter: "sqlite3", name: "trails" } }),
    ).toEqual({ adapter: "sqlite3", database: "trails_test" });
  });

  it("evaluates code tags for control flow", () => {
    const path = writeYaml("shards:\n<% for (const i of [1, 2]) { %>  - shard_<%= i %>\n<% } %>");
    expect(ConfigurationFile.parse(path)).toEqual({ shards: ["shard_1", "shard_2"] });
  });

  it("leaves a file without tags untouched", () => {
    const path = writeYaml("ok: 42\n");
    expect(ConfigurationFile.parse(path)).toEqual({ ok: 42 });
  });
});
