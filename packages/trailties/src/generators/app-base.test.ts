import { describe, it, expect } from "vitest";
import { AppBase, type AppBaseOptions } from "./app-base.js";

class T extends AppBase {}
const build = (o: Partial<AppBaseOptions> = {}) =>
  new T({ cwd: "/work", output: () => {}, appPath: "blog", ...o });

describe("AppBase", () => {
  it("defaults: sqlite3, keeps, system tests, destinationRoot joins cwd+appPath", () => {
    const g = build();
    expect(g.sqlite3()).toBe(true);
    expect(g.database.name).toBe("sqlite3");
    expect(g.keeps()).toBe(true);
    expect(g.dependsOnSystemTest()).toBe(true);
    expect(g.destinationRoot).toBe("/work/blog");
    expect(g.cwd).toBe("/work/blog");
    expect(build({ appPath: "/abs/blog" }).destinationRoot).toBe("/abs/blog");
  });

  it("skip(what), devcontainer, postgres delegate", () => {
    const g = build({ skipActionCable: true, skipKeeps: true, devcontainer: true });
    expect(g.skip("ActionCable")).toBe(true);
    expect(g.keeps()).toBe(false);
    expect(g.devcontainer()).toBe(true);
    expect(g.skipDevcontainer()).toBe(false);
    expect(build({ database: "postgresql" }).database.name).toBe("postgres");
    expect(build({ database: "postgresql" }).sqlite3()).toBe(false);
  });

  it("option implications: skipActiveRecord ⇒ skipActiveStorage ⇒ skipActionMailbox/Text", () => {
    const g = build({ skipActiveRecord: true });
    expect(g.skip("ActiveStorage")).toBe(true);
    expect(g.skip("ActionMailbox")).toBe(true);
    expect(g.skip("ActionText")).toBe(true);
    expect(build({ skipActiveRecord: true, skipActiveStorage: false }).skip("ActiveStorage")).toBe(
      false,
    );
  });

  it("dependsOnSystemTest false when api or skipTest or skipSystemTest", () => {
    expect(build({ api: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipTest: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipSystemTest: true }).dependsOnSystemTest()).toBe(false);
  });
});
