import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OrderedOptions, resetLoadHooks } from "@blazetrails/activesupport";
import { env, RuntimeError, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { Trails, _resetTrailsEnv } from "../rails.js";

function switchEnv(key: string, value: string | undefined, block: () => void): void {
  const old = env[key];
  setEnv(key, value);
  try {
    block();
  } finally {
    setEnv(key, old);
  }
}

function withRailsEnv(railsEnv: string | undefined, block: () => void): void {
  _resetTrailsEnv();
  switchEnv("TRAILS_ENV", railsEnv, () => switchEnv("NODE_ENV", undefined, block));
}

function withRackEnv(rackEnv: string | undefined, block: () => void): void {
  _resetTrailsEnv();
  switchEnv("NODE_ENV", rackEnv, () => switchEnv("TRAILS_ENV", undefined, block));
}

let appPath: string;

async function setCustomConfig(contents: string): Promise<void> {
  await writeFile(join(appPath, "config", "custom.ts"), contents);
}

async function app(railsEnv: string): Promise<Application> {
  setEnv("TRAILS_ENV", railsEnv);
  _resetTrailsEnv();
  class A extends Application {}
  A.calledFrom(appPath);
  Application.register(A);
  return A.instance();
}

describe("ConfigurationTest", () => {
  const trailsEnv = env.TRAILS_ENV;

  beforeEach(async () => {
    resetLoadHooks();
    appPath = await mkdtemp(join(tmpdir(), "trails-config-for-"));
    await mkdir(join(appPath, "config"));
    await writeFile(join(appPath, "config.ts"), "");
  });

  afterEach(async () => {
    Application.appClass = null;
    resetLoadHooks();
    setEnv("TRAILS_ENV", trailsEnv);
    _resetTrailsEnv();
    await rm(appPath, { recursive: true, force: true });
  });

  it("Rails.env falls back to development if RAILS_ENV is blank and RACK_ENV is nil", () => {
    withRailsEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });

  it("Rails.env falls back to development if RACK_ENV is blank and RAILS_ENV is nil", () => {
    withRackEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });

  it("config_for loads custom configuration from YAML accessible as symbol or string", async () => {
    await setCustomConfig(`export default { development: { foo: "bar" } };`);

    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;

    expect(myCustomConfig.get("foo")).toBe("bar");
    expect(myCustomConfig.get("foo")).toBe("bar");
  });

  it("config_for loads nested custom configuration from YAML as symbol keys", async () => {
    await setCustomConfig(`export default { development: { foo: { bar: { baz: 1 } } } };`);

    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;

    expect((myCustomConfig.get("foo") as { bar: { baz: number } }).bar.baz).toBe(1);
  });

  it("config_for does not assume config is a hash", async () => {
    await setCustomConfig(`export default { development: ["foo", "bar"] };`);

    expect(await (await app("development")).configFor("custom")).toEqual(["foo", "bar"]);
  });

  it("config_for works with only a shared root array", async () => {
    await setCustomConfig(`export default { shared: ["foo", "bar"] };`);

    expect(await (await app("development")).configFor("custom")).toEqual(["foo", "bar"]);
  });

  it("config_for returns only the env array when shared is an array", async () => {
    await setCustomConfig(`export default { development: ["baz"], shared: ["foo", "bar"] };`);

    expect(await (await app("development")).configFor("custom")).toEqual(["baz"]);
  });

  it("config_for raises an exception if the file does not exist", async () => {
    const application = await app("development");

    const exception = await application.configFor("custom").then(
      () => null,
      (error: unknown) => error,
    );
    expect(exception).toBeInstanceOf(RuntimeError);
    expect((exception as Error).message).toBe(
      `Could not load configuration. No such file - ${appPath}/config/custom.ts`,
    );
  });

  it("config_for without the environment configured returns nil", async () => {
    await setCustomConfig(`export default { test: { key: "custom key" } };`);

    expect(await (await app("development")).configFor("custom")).toBeNull();
  });

  it("config_for shared config is overridden", async () => {
    await setCustomConfig(
      `export default { shared: { foo: ":from_shared" }, test: { foo: ":from_env" } };`,
    );

    const myCustomConfig = (await (await app("test")).configFor("custom")) as OrderedOptions;

    expect(myCustomConfig.get("foo")).toBe(":from_env");
  });

  it("config_for shared config is returned when environment is missing", async () => {
    await setCustomConfig(
      `export default { shared: { foo: ":from_shared" }, test: { foo: ":from_env" } };`,
    );

    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;

    expect(myCustomConfig.get("foo")).toBe(":from_shared");
  });

  it("config_for merges shared configuration deeply", async () => {
    await setCustomConfig(
      `export default { shared: { foo: { bar: { baz: 1 } } }, development: { foo: { bar: { qux: 2 } } } };`,
    );

    const myCustomConfig = (await (await app("development")).configFor("custom")) as OrderedOptions;

    expect((myCustomConfig.get("foo") as { bar: unknown }).bar).toEqual({ baz: 1, qux: 2 });
  });

  it("config_for with empty file returns nil", async () => {
    await setCustomConfig("");

    expect(await (await app("development")).configFor("custom")).toBeNull();
  });

  it("config_for allows overriding the environment", async () => {
    await setCustomConfig(
      `export default { test: { key: "walrus" }, production: { key: "unicorn" } };`,
    );

    const myCustomConfig = (await (
      await app("test")
    ).configFor("custom", { env: "production" })) as OrderedOptions;

    expect(myCustomConfig.get("key")).toBe("unicorn");
  });

  it("config_for returns a ActiveSupport::OrderedOptions", async () => {
    await setCustomConfig(
      `export default { shared: { some_key: "default" }, development: { some_key: "value" }, test: null };`,
    );

    const application = await app("development");

    let config = (await application.configFor("custom")) as OrderedOptions;
    expect(config.constructor).toBe(OrderedOptions);
    expect(config.get("some_key")).toBe("value");

    config = (await application.configFor("custom", { env: "test" })) as OrderedOptions;
    expect(config.constructor).toBe(OrderedOptions);
    expect(config.get("some_key")).toBe("default");
  });
});
