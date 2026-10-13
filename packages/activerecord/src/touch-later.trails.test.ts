import { describe, it, expect } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { fixtures } from "./test-helpers/use-fixtures.js";
import "./support/canonical-model-index.js";
import { Invoice } from "./test-helpers/models/invoice.js";
import { surreptitiouslyTouch, touchDeferredAttributes } from "./touch-later.js";

type TouchLaterInternals = Invoice & {
  _touchTime: RubyTime | null;
  _deferTouchAttrs: string[] | null;
  _writeAttribute(attr: string, val: unknown): unknown;
  maxUpdatedColumnTimestamp(): RubyTime;
};

fixtures([]);

describe("surreptitiouslyTouch reads _touchTime from instance (Story K gap 3)", () => {
  it("uses _touchTime stored on the record rather than an explicit argument", async () => {
    const inv = (await Invoice.create()) as TouchLaterInternals;
    const touchTime = RubyTime.at(1000);
    inv._touchTime = touchTime;

    const written: [string, unknown][] = [];
    const origWrite = inv._writeAttribute.bind(inv);
    inv._writeAttribute = (attr: string, val: unknown) => {
      written.push([attr, val]);
      return origWrite(attr, val);
    };

    surreptitiouslyTouch.call(inv as never, ["updated_at"]);

    expect(written).toEqual([["updated_at", touchTime]]);
    expect(inv.attributeChanged("updated_at")).toBe(false);
  });
});

describe("maxUpdatedColumnTimestamp after touchLater", () => {
  it("answers the Time the deferred touch wrote", async () => {
    const invoice = (await Invoice.create()) as TouchLaterInternals;
    await Invoice.transaction(async () => {
      await invoice.touchLater();
      const max = invoice.maxUpdatedColumnTimestamp();
      expect(max).toBeInstanceOf(RubyTime);
      expect(max.compare(invoice._touchTime!)).toBe(0);
    });
    const reloaded = (await Invoice.find(invoice.id)) as TouchLaterInternals;
    expect(reloaded.maxUpdatedColumnTimestamp()).toBeInstanceOf(RubyTime);
  });
});

describe("touchDeferredAttributes delegates to timestampTouch with deferred time (Story K gap 4)", () => {
  it("uses the stored _touchTime and clears deferred state", async () => {
    const inv = (await Invoice.create()) as TouchLaterInternals;

    const fixedTime = RubyTime.at(2_000);
    inv._deferTouchAttrs = ["updated_at"];
    inv._touchTime = fixedTime;

    await touchDeferredAttributes.call(inv as never);

    expect(inv._deferTouchAttrs).toBeNull();
    expect(inv._touchTime).toBeNull();
  });
});
