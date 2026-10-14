import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { fixtures } from "./test-helpers/use-fixtures.js";

fixtures(["topics"]);

describe("after_*_commit callbacks fire for their own action only", () => {
  it("afterSaveCommit fires on create and update but not destroy", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterSaveCommit(() => {
          history.push("save_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual(["save_commit"]);
    history.length = 0;

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual(["save_commit"]);
    history.length = 0;

    await t.destroy();
    expect(history).toEqual([]);
  });

  it("afterUpdateCommit fires on update but not create", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterUpdateCommit(() => {
          history.push("update_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual([]);

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual(["update_commit"]);
  });

  it("afterDestroyCommit fires on destroy but not create or update", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterDestroyCommit(() => {
          history.push("destroy_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual([]);

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual([]);

    await t.destroy();
    expect(history).toEqual(["destroy_commit"]);
  });
});

describe("hasTransactionalCallbacks regression", () => {
  it("returns true for a model with only beforeCommit callbacks", () => {
    class Widget extends Base {
      declare title: string;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
      }
    }
    Widget.beforeCommit(() => {});
    const w = new Widget({});
    expect(w.hasTransactionalCallbacks()).toBe(true);
  });
});
