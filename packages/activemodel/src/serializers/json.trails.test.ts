/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   The model below spells `include ActiveModel::Serializers::JSON` in its class body, the way the
   Rails test model it mirrors does (test/models/contact.rb:5); the class/interface merge beside it
   is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include, setParseJsonTimes } from "@blazetrails/activesupport";
import { JSON as JSONHost } from "./json.js";

describe("Serializers::JSON decoding (trails)", () => {
  class Event {
    static {
      include(this, JSONHost);
      Object.defineProperty(this.prototype, "attributes", {
        get(this: Event) {
          return { occurredAt: this._occurredAt };
        },
        configurable: true,
      });
    }

    _occurredAt: unknown = null;

    setAttributes(hash: unknown): void {
      const { occurredAt } = hash as { occurredAt?: unknown };
      this._occurredAt = occurredAt;
    }

    get occurredAt(): unknown {
      return this._occurredAt;
    }
  }
  interface Event extends JSONHost {}

  it("fromJson converts a date string when parseJsonTimes is on", () => {
    setParseJsonTimes(true);
    try {
      const event = new Event().fromJson('{"occurredAt":"2012-01-01"}');
      expect(typeof event._occurredAt).not.toBe("string");
    } finally {
      setParseJsonTimes(undefined);
    }
  });

  it("fromJson leaves the string alone when parseJsonTimes is off", () => {
    const event = new Event().fromJson('{"occurredAt":"2012-01-01"}');
    expect(event._occurredAt).toBe("2012-01-01");
  });
});
