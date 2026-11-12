import { describe, it, expect } from "vitest";
import { Base, RecordInvalid } from "../../lib/index.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";

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

  it("save completes the column attributes of a record built before the schema loaded", async () => {
    class Bird extends Base {}
    Base.connectionPool().schemaCache.clearBang();
    const bird = new Bird();
    expect(await bird.save()).toBe(true);
    expect(bird.id).not.toBeNull();
  });

  it("save! completes a timestamped record built before the schema loaded", async () => {
    class Topic extends Base {}
    Base.connectionPool().schemaCache.clearBang();
    const topic = new Topic();
    await topic.saveBang();
    expect(topic.readAttribute("created_at")).not.toBeNull();
    expect((await Topic.find(topic.id)).id).toEqual(topic.id);
  });
});
