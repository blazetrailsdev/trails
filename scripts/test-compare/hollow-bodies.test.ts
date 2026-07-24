import { describe, it, expect } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";
import { findHollowTests, worstOffenders } from "./hollow-bodies.js";
import type { HollowFinding } from "./hollow-bodies.js";

function sweep(source: string): HollowFinding[] {
  return findHollowTests(extractTestsFromSource(source, "x.test.ts").testCases);
}

describe("hollow-body detector", () => {
  // The regression the detector exists for: the pre-#4892 body of
  // `instrument yields the payload for further modification` passed no block at
  // all and asserted the payload came back unchanged, so it passed against an
  // `instrument` that never yielded.
  it("flags the pre-#4892 notifications body", () => {
    const findings = sweep(`
      it("instrument yields the payload for further modification", () => {
        const events = [];
        Notifications.subscribe("modify", (e) => events.push(e));
        Notifications.instrument("modify", { original: true });
        expect(events[0].payload.original).toBe(true);
      });
    `);
    expect(findings.map((f) => f.reason)).toEqual(["no-mutation"]);
  });

  it("clears the fixed body that writes to the yielded payload", () => {
    const findings = sweep(`
      it("instrument yields the payload for further modification", () => {
        const events = [];
        Notifications.subscribe("modify", (e) => events.push(e));
        Notifications.instrument("modify", { original: true }, (payload) => {
          payload.added = "later";
        });
        expect(events[0].payload.added).toBe("later");
      });
    `);
    expect(findings).toEqual([]);
  });

  it("flags a no-op block where the name promises the block yields", () => {
    const findings = sweep(`
      it("instrumenter yields the payload for further modification", () => {
        instrumenter.instrument("name", payload, () => {});
        expect(payload.title).toBe("t");
      });
    `);
    expect(findings.map((f) => f.reason)).toEqual(["empty-callback"]);
  });

  it("flags a behaviour-promising test that asserts nothing", () => {
    const findings = sweep(`
      it("raises when the record is dirty", async () => {
        await person.lockBang();
      });
    `);
    expect(findings.map((f) => f.reason)).toEqual(["no-assertions"]);
  });

  it("ignores a name that promises nothing", () => {
    expect(sweep(`it("has a name", () => { setUp(); });`)).toEqual([]);
  });

  it("ignores pending tests", () => {
    expect(sweep(`it.skip("raises when the record is dirty");`)).toEqual([]);
  });

  // Rails' own body for a negated promise is an `assert_nothing_raised` or a
  // no-op block, so an assertion-free body is the faithful port.
  it("ignores negated promises", () => {
    const source = `
      it("does not raise when the object is not dirty", async () => {
        await person.lockBang();
      });
      it("after commit does not mutate the if options array", () => {
        Model.afterCommit(() => {}, opts);
        expect(opts.if).toEqual(original);
      });
    `;
    expect(sweep(source)).toEqual([]);
  });

  // "instrument" ends in "nt" — an apostrophe-less `\\w+n't` negation pattern
  // would swallow the very tests this detector exists to catch.
  it("does not read instrument as a negation", () => {
    const findings = sweep(`
      it("instrument yields the payload for further modification", () => {
        Notifications.subscribe("m", (e) => events.push(e));
        Notifications.instrument("m", {});
        expect(events).toHaveLength(1);
      });
    `);
    expect(findings).toHaveLength(1);
  });

  it("ignores bang methods that mutate by the call", () => {
    const findings = sweep(`
      it("deep transform keys with bang mutates", () => {
        deepTransformKeysBang(h, (k) => k.toUpperCase());
        expect(h).toEqual({ A: 1 });
      });
    `);
    expect(findings).toEqual([]);
  });

  it("ignores no-op callbacks handed to test doubles", () => {
    const findings = sweep(`
      it("yields completion sentinel", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const chunks = await collect(renderer.renderStream(ctx, (c) => c.write("x")));
        expect(chunks).toEqual([""]);
      });
    `);
    expect(findings).toEqual([]);
  });

  it("ranks offenders by finding count", () => {
    const findings: HollowFinding[] = [
      { path: "a", file: "one.ts", line: 1, reason: "no-assertions" },
      { path: "b", file: "two.ts", line: 2, reason: "no-assertions" },
      { path: "c", file: "two.ts", line: 3, reason: "empty-callback" },
    ];
    expect(worstOffenders(findings)).toEqual([
      { file: "two.ts", count: 2 },
      { file: "one.ts", count: 1 },
    ]);
  });
});
