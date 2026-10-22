import { describe, expect, it } from "vitest";
import { Attributes } from "./attributes.js";
import { Model } from "./model.js";
import { JSON as JSONSerializer } from "./serializers/json.js";

describe("Included<> mixin members are overridable with methods", () => {
  it("a model subclass overrides runCallbacks and validatesWith", async () => {
    const seen: string[] = [];
    class Audit extends Model {
      override runCallbacks(...args: Parameters<Model["runCallbacks"]>): unknown {
        seen.push(args[0]);
        return super.runCallbacks(...args);
      }
      override async validatesWith(...args: Parameters<Model["validatesWith"]>): Promise<void> {
        seen.push("validatesWith");
        return super.validatesWith(...args);
      }
    }
    expect(await new Audit().isValid()).toBe(true);
    await new Audit().validatesWith();
    expect(seen).toContain("validate");
    expect(seen).toContain("validatesWith");
  });

  it("a serializer subclass overrides toJSON, serializableHash and readAttributeForSerialization", () => {
    class Card extends JSONSerializer {
      name = "ace";
      attributes = { name: "ace" };
      override serializableHash(): Record<string, unknown> {
        return { name: this.readAttributeForSerialization("name") };
      }
      override readAttributeForSerialization(key: string): unknown {
        return key.toUpperCase();
      }
      override toJSON(): string {
        return "card";
      }
    }
    const card = new Card();
    expect(card.serializableHash()).toEqual({ name: "NAME" });
    expect(card.toJSON()).toBe("card");
  });

  it("an Attributes subclass overrides isRespondTo and methodMissing", () => {
    class Row extends Attributes {
      override isRespondTo(...args: Parameters<Attributes["isRespondTo"]>): boolean {
        return args[0] === "anything" || super.isRespondTo(...args);
      }
      override methodMissing(method: string): unknown {
        return method;
      }
    }
    const row = new Row();
    expect(row.isRespondTo("anything")).toBe(true);
    expect(row.methodMissing("x")).toBe("x");
  });
});
