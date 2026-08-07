import { describe, it, expect, beforeEach } from "vitest";
import { withOptions } from "./core-ext/object/with-options.js";
import { OptionMerger } from "./option-merger.js";

/**
 * Port of activesupport/test/option_merger_test.rb.
 *
 * Rails' test case *is* the receiver, and `context` below carries its private
 * helpers `method_with_options` / `method_with_args`
 * (option_merger_test.rb:139-155). Ruby's kwargs variants collapse onto one
 * TypeScript shape — a trailing options object — so `method_with_kwargs` /
 * `method_with_kwargs_only` have no separate form, and the assertions naming
 * them fold into their `method_with_options` siblings.
 */
describe("OptionMergerTest", () => {
  const context = {
    methodWithArgs(...args: unknown[]): unknown[] {
      return args;
    },
    methodWithOptions(options: Record<string, unknown> = {}): Record<string, unknown> {
      return options;
    },
  };

  let options: Record<string, unknown>;

  beforeEach(() => {
    options = { hello: "world" };
  });

  it("method with options merges string options", () => {
    const localOptions = { cool: true };

    withOptions(context, options, (o) => {
      expect(context.methodWithOptions(localOptions)).toEqual(localOptions);
      expect(o.methodWithOptions(localOptions)).toEqual({ ...options, ...localOptions });
    });
  });

  it("method with options merges options when options are present", () => {
    const localOptions = { cool: true };

    withOptions(context, options, (o) => {
      expect(context.methodWithOptions(localOptions)).toEqual(localOptions);
      expect(o.methodWithOptions(localOptions)).toEqual({ ...options, ...localOptions });
    });
  });

  it("method with options appends options when options are missing", () => {
    withOptions(context, options, (o) => {
      expect(context.methodWithOptions()).toEqual({});
      expect(o.methodWithOptions()).toEqual(options);
    });
  });

  it("method with options copies options when options are missing", () => {
    withOptions(context, options, (o) => {
      expect(o.methodWithOptions()).not.toBe(options);
    });
  });

  it("method with options allows to overwrite options", () => {
    const localOptions = { hello: "moon" };
    expect(Object.keys(options)).toEqual(Object.keys(localOptions));

    withOptions(context, options, (o) => {
      expect(context.methodWithOptions(localOptions)).toEqual(localOptions);
      expect(o.methodWithOptions(localOptions)).toEqual({ ...options, ...localOptions });
      expect(o.methodWithOptions(localOptions)).toEqual(localOptions);
    });
    withOptions(context, localOptions, (o) => {
      expect(o.methodWithOptions(options)).toEqual({ ...localOptions, ...options });
    });
  });

  it("nested method with options containing hashes merge", () => {
    withOptions(context, { conditions: { method: ":get" } }, (outer) => {
      withOptions(outer, { conditions: { domain: "www" } }, (inner) => {
        const expected = { conditions: { method: ":get", domain: "www" } };
        expect(inner.methodWithOptions()).toEqual(expected);
      });
    });
  });

  it("nested method with options containing hashes overwrite", () => {
    withOptions(context, { conditions: { method: ":get", domain: "www" } }, (outer) => {
      withOptions(outer, { conditions: { method: ":post" } }, (inner) => {
        const expected = { conditions: { method: ":post", domain: "www" } };
        expect(inner.methodWithOptions()).toEqual(expected);
      });
    });
  });

  it("nested method with options containing hashes going deep", () => {
    withOptions(
      context,
      { html: { class: "foo", style: { margin: 0, display: "block" } } },
      (outer) => {
        withOptions(
          outer,
          { html: { title: "bar", style: { margin: "1em", color: "#fff" } } },
          (inner) => {
            const expected = {
              html: {
                class: "foo",
                title: "bar",
                style: { margin: "1em", display: "block", color: "#fff" },
              },
            };
            expect(inner.methodWithOptions()).toEqual(expected);
          },
        );
      },
    );
  });

  it("nested method with options using lambda as only argument", () => {
    const localLambda = () => ({ lambda: true });
    withOptions(context, options, (o) => {
      const merged = o.methodWithOptions(localLambda as never) as unknown as () => unknown;
      expect(merged()).toEqual({ ...options, ...localLambda() });
    });
  });

  it("proc as first argument with other options should still merge options", () => {
    const localProc = () => {};
    const localOptions = { cool: true };

    withOptions(context, options, (o) => {
      expect(o.methodWithArgs(localProc, localOptions)).toEqual([
        localProc,
        { ...options, ...localOptions },
      ]);
    });
  });

  it("option merger class method", () => {
    expect(new OptionMerger({}, {})).toBeInstanceOf(OptionMerger);
  });

  it("with options hash like", () => {
    class HashLike {
      constructor(hash: Record<string, unknown>) {
        Object.assign(this, hash);
      }
    }
    const localOptions = { cool: true };
    const scope = withOptions(context, new HashLike(options) as Record<string, unknown>);

    expect(context.methodWithOptions(localOptions)).toEqual(localOptions);
    expect(scope.methodWithOptions(localOptions)).toEqual({ ...options, ...localOptions });
  });

  it("with options no block", () => {
    const localOptions = { cool: true };
    const scope = withOptions(context, options);

    expect(context.methodWithOptions(localOptions)).toEqual(localOptions);
    expect(scope.methodWithOptions(localOptions)).toEqual({ ...options, ...localOptions });
  });
});
