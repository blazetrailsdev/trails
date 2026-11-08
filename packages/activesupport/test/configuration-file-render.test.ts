import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rbFBinding, TopLevel } from "@blazetrails/ruby-compat";
import { ConfigurationFile } from "../lib/configuration-file.js";

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
      ConfigurationFile.parse(path, {
        context: rbFBinding({ adapter: "sqlite3", name: "trails" }),
      }),
    ).toEqual({ adapter: "sqlite3", database: "trails_test" });
  });

  it("reads self's members and top-level constants through a binding", () => {
    const constants = TopLevel as Record<string, unknown>;
    constants.RenderShared = "constant";
    constants.RenderOnly = "top";
    try {
      const path = writeYaml("a: <%= RenderShared %>\nb: <%= RenderOnly %>\nc: <%= who() %>\n");
      const self = {
        RenderShared: "member",
        who() {
          return this === self ? "self" : "other";
        },
      };
      expect(ConfigurationFile.parse(path, { context: rbFBinding(self) })).toEqual({
        a: "member",
        b: "top",
        c: "self",
      });
    } finally {
      delete constants.RenderShared;
      delete constants.RenderOnly;
    }
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

describe("ConfigurationFile loader options", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function writeYaml(content: string): string {
    dir = mkdtempSync(join(tmpdir(), "config-options-"));
    const path = join(dir, "database.yml");
    writeFileSync(path, content);
    return path;
  }

  const merged =
    "default: &default\n  adapter: sqlite3\ndevelopment:\n  <<: *default\n  database: dev\n";

  it("forwards loader options to the YAML load", () => {
    const path = writeYaml(merged);

    expect(ConfigurationFile.parse(path, { merge: true })).toEqual({
      default: { adapter: "sqlite3" },
      development: { adapter: "sqlite3", database: "dev" },
    });
  });

  it("forwards loader options through the rendered branch", () => {
    const path = writeYaml(`<% /* nothing */ %>${merged}`);

    expect(
      (ConfigurationFile.parse(path, { merge: true }) as Record<string, unknown>).development,
    ).toEqual({
      adapter: "sqlite3",
      database: "dev",
    });
  });

  it("without the option the merge key is an ordinary key", () => {
    const path = writeYaml(merged);

    expect((ConfigurationFile.parse(path) as Record<string, unknown>).development).toEqual({
      "<<": { adapter: "sqlite3" },
      database: "dev",
    });
  });
});
