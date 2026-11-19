import { Concern, delegate, extend } from "@blazetrails/activesupport";
import { RecordIdentifier } from "@blazetrails/actionview/record-identifier.js";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Turbo } from "./turbo-trails.js";

type Block = ((selected: unknown) => unknown) | null;
type TestAssertionsHost = {
  domId(recordOrClass: unknown, prefix?: string | null): string;
  assertSelect(...args: unknown[]): unknown;
  assertTurboFrame(...args: unknown[]): unknown;
};

export const TestAssertions = {
  assertTurboStream(
    this: TestAssertionsHost,
    {
      action,
      target = null,
      targets = null,
      count = 1,
    }: { action: string; target?: unknown; targets?: string | null; count?: number },
    block: Block = null,
  ): unknown {
    let selector = `turbo-stream[action="${action}"]`;
    if (target != null)
      selector += `[target="${rbObjRespondTo(target, "toKey") ? this.domId(target) : target}"]`;
    if (targets != null) selector += `[targets="${targets}"]`;
    return this.assertSelect(selector, { count }, ...(block ? [block] : []));
  },

  assertNoTurboStream(
    this: TestAssertionsHost,
    {
      action,
      target = null,
      targets = null,
    }: { action: string; target?: unknown; targets?: string | null },
  ): unknown {
    let selector = `turbo-stream[action="${action}"]`;
    if (target != null)
      selector += `[target="${rbObjRespondTo(target, "toKey") ? this.domId(target) : target}"]`;
    if (targets != null) selector += `[targets="${targets}"]`;
    return this.assertSelect(selector, { count: 0 });
  },

  assertTurboFrame(this: TestAssertionsHost, ...args: unknown[]): unknown {
    const block = typeof args.at(-1) === "function" ? (args.pop() as Block) : null;
    const last = args.at(-1);
    const options = (
      last != null && Object.getPrototypeOf(last) === Object.prototype ? args.pop() : {}
    ) as { loading?: string | null; src?: string | null; target?: string | null; count?: number };
    const { loading = null, src = null, target = null, count = 1 } = options;
    const ids = args;
    const id = rbObjRespondTo(ids[0], "toKey")
      ? RecordIdentifier.domId(...(ids as [unknown, string?]))
      : ids.join("_");
    let selector = `turbo-frame[id="${id}"]`;
    if (loading != null) selector += `[loading="${loading}"]`;
    if (src != null) selector += `[src="${src}"]`;
    if (target != null) selector += `[target="${target}"]`;
    return this.assertSelect(selector, { count }, ...(block ? [block] : []));
  },

  assertNoTurboFrame(this: TestAssertionsHost, ...args: unknown[]): unknown {
    const block = typeof args.at(-1) === "function" ? args.pop() : null;
    const last = args.at(-1);
    const options =
      last != null && Object.getPrototypeOf(last) === Object.prototype ? args.pop() : {};
    return this.assertTurboFrame(
      ...args,
      { ...(options as object), count: 0 },
      ...(block ? [block] : []),
    );
  },
};
extend(TestAssertions, Concern);
(
  TestAssertions as unknown as {
    included(base: null, block: (this: { prototype: object }) => void): void;
  }
).included(null, function (this: { prototype: object }) {
  delegate.call(this.prototype, "domId", "domClass", { to: RecordIdentifier });
});
Object.assign(Turbo, { TestAssertions });
