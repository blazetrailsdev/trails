import { describe, it, expect } from "vitest";
import { AppBase, type AppBaseOptions } from "./app-base.js";

class T extends AppBase {}
const build = (o: Partial<AppBaseOptions> = {}) =>
  new T({ cwd: "/tmp/x", output: () => {}, appPath: "myapp", ...o });

describe("AppBase", () => {
  it("defaults to sqlite3 with keeps and system tests", () => {
    const g = build();
    expect(g.sqlite3()).toBe(true);
    expect(g.database.name).toBe("sqlite3");
    expect(g.keeps()).toBe(true);
    expect(g.dependsOnSystemTest()).toBe(true);
  });

  it("skip(what) reads skip<What> options", () => {
    const g = build({ skipActionCable: true, skipKeeps: true, devcontainer: true });
    expect(g.skip("ActionCable")).toBe(true);
    expect(g.keeps()).toBe(false);
    expect(g.devcontainer()).toBe(true);
    expect(g.skipDevcontainer()).toBe(false);
  });

  it("postgres database delegate", () => {
    const g = build({ database: "postgresql" });
    expect(g.database.name).toBe("postgres");
    expect(g.sqlite3()).toBe(false);
  });

  it("skipActiveRecord implies skipActiveStorage and onward", () => {
    const g = build({ skipActiveRecord: true });
    expect(g.skip("ActiveStorage")).toBe(true);
    expect(g.skip("ActionMailbox")).toBe(true);
    expect(g.skip("ActionText")).toBe(true);
  });

  it("explicit skipActiveStorage=false revokes the implication", () => {
    const g = build({ skipActiveRecord: true, skipActiveStorage: false });
    expect(g.skip("ActiveStorage")).toBe(false);
  });

  it("dependsOnSystemTest false when api or skipTest", () => {
    expect(build({ api: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipTest: true }).dependsOnSystemTest()).toBe(false);
    expect(build({ skipSystemTest: true }).dependsOnSystemTest()).toBe(false);
  });
});
