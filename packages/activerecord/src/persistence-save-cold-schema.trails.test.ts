import { describe, it, expect } from "vitest";
import { Base, RecordInvalid } from "./index.js";
import { fixtures } from "./test-fixtures.js";

describe("Persistence#save on a record built against a cold schema cache (trails)", () => {
  fixtures([]);

  it("save runs the validations and reports the blank attribute", async () => {
    class Topic extends Base {
      static {
        this.validates("title", { presence: true });
      }
    }
    Base.connectionPool().schemaCache.clearBang();
    const topic = new Topic();
    expect(topic.hasAttribute("title")).toBe(false);

    expect(await topic.save()).toBe(false);
    expect(topic.errors.fullMessages).toEqual(["Title can't be blank"]);
  });

  it("save! raises RecordInvalid for the blank attribute", async () => {
    class Topic extends Base {
      static {
        this.validates("title", { presence: true });
      }
    }
    Base.connectionPool().schemaCache.clearBang();
    const topic = new Topic();
    expect(topic.hasAttribute("title")).toBe(false);

    await expect(topic.saveBang()).rejects.toBeInstanceOf(RecordInvalid);
  });
});
