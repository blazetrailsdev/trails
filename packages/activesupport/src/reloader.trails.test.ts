// Trails-only coverage for the ported `:prepare` callback surface of
// `ActiveSupport::Reloader`. The Rails-mirrored cases live in
// `reloader.test.ts` and stay skipped until `ExecutionWrapper` is ported.
import { describe, it, expect } from "vitest";
import { Reloader } from "./reloader.js";

describe("Reloader (trails)", () => {
  it("runs to_prepare callbacks on prepare!", () => {
    class AppReloader extends Reloader {}
    const ran: string[] = [];
    AppReloader.toPrepare(() => ran.push("first"));
    AppReloader.toPrepare(() => ran.push("second"));

    expect(ran).toEqual([]);
    AppReloader.prepareBang();
    expect(ran).toEqual(["first", "second"]);
    AppReloader.prepareBang();
    expect(ran).toEqual(["first", "second", "first", "second"]);
  });

  it("keeps each subclass's prepare callbacks to itself", () => {
    class OneReloader extends Reloader {}
    class TwoReloader extends Reloader {}
    const ran: string[] = [];
    OneReloader.toPrepare(() => ran.push("one"));

    TwoReloader.prepareBang();
    expect(ran).toEqual([]);
    OneReloader.prepareBang();
    expect(ran).toEqual(["one"]);
  });
});
