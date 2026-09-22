import { describe, expect, it } from "vitest";
import type { CallSkeleton } from "./compare.js";
import { isSetterDispatchPortedAsDirectWrite } from "./setter-dispatch.js";

function pair(ruby: string[], ts: string[], extra: Partial<CallSkeleton> = {}): CallSkeleton {
  return {
    rubyFile: "active_record/persistence.rb",
    rubyName: "update_attribute",
    tsFile: "persistence.ts",
    tsName: "updateAttribute",
    ruby,
    ts,
    ...extra,
  };
}

describe("isSetterDispatchPortedAsDirectWrite", () => {
  it("lists a setter dispatch ported as writeAttribute", () => {
    expect(
      isSetterDispatchPortedAsDirectWrite(
        pair(["ref:public_send", "send:setter"], ["ref:writeAttribute"]),
      ),
    ).toBe(true);
  });

  it("does not list the faithful computed-member assignment", () => {
    expect(
      isSetterDispatchPortedAsDirectWrite(
        pair(["ref:public_send", "send:setter"], ["assign:computed", "ref:writeAttribute"]),
      ),
    ).toBe(false);
  });

  it("credits a computed assignment in a same-file helper", () => {
    expect(
      isSetterDispatchPortedAsDirectWrite(
        pair(["send:setter"], ["ref:assign", "ref:_writeAttribute"], {
          tsHelpers: { assign: ["assign:computed"] },
        }),
      ),
    ).toBe(false);
  });

  it("needs the Ruby mark and a direct write", () => {
    expect(isSetterDispatchPortedAsDirectWrite(pair(["ref:send"], ["ref:writeAttribute"]))).toBe(
      false,
    );
    expect(isSetterDispatchPortedAsDirectWrite(pair(["send:setter"], ["ref:save"]))).toBe(false);
  });
});
