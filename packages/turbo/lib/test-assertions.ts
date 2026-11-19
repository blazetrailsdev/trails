import {
  Concern,
  delegate,
  extend,
  extractOptionsBang,
  included,
} from "@blazetrails/activesupport";
import { RecordIdentifier } from "@blazetrails/actionview/record-identifier.js";
import { rbBlockGivenP, rbObjRespondTo } from "@blazetrails/ruby-compat";
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
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as Block) : null;
    const {
      loading = null,
      src = null,
      target = null,
      count = 1,
    } = extractOptionsBang(args) as {
      loading?: string | null;
      src?: string | null;
      target?: string | null;
      count?: number;
    };
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
    const block = rbBlockGivenP(args.at(-1)) ? args.pop() : null;
    const options = extractOptionsBang(args);
    return this.assertTurboFrame(...args, { ...options, count: 0 }, ...(block ? [block] : []));
  },

  [included](base: { prototype: object }): void {
    delegate.call(base.prototype, "domId", "domClass", { to: RecordIdentifier });
  },
};
extend(TestAssertions, Concern);
Object.assign(Turbo, { TestAssertions });
