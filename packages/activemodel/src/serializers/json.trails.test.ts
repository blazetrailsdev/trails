import { describe, it, expect } from "vitest";
import { setParseJsonTimes } from "@blazetrails/activesupport";
import { JSON as JSONHost } from "./json.js";

describe("Serializers::JSON decoding (trails)", () => {
  class Event extends JSONHost {
    static {
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
