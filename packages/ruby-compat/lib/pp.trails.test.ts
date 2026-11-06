import { describe, expect, it } from "vitest";
import { DelegateClass } from "./delegate.js";
import { rbDefineInspectCustom } from "./object.js";
import { PP } from "./pp.js";
import { StringIO } from "./string-io.js";

async function pp(obj: unknown, width?: number): Promise<string> {
  return (await PP.pp(obj, new StringIO(), width)).string();
}

describe("PP", () => {
  it("prints a value by its inspect, followed by a newline", async () => {
    expect(await pp("a")).toBe('"a"\n');
    expect(await pp([1, "b", null])).toBe('[1, "b", nil]\n');
  });

  it("breaks an array that does not fit the width, one element per line", async () => {
    expect(await pp(["aaaa", "bbbb", ["cccc", "dddd"]], 12)).toBe(
      '["aaaa",\n "bbbb",\n ["cccc",\n  "dddd"]]\n',
    );
  });

  it("prints a Hash through pp_hash, breaking a pair that does not fit", async () => {
    expect(await pp({ a: 1 })).toBe('{"a"=>1}\n');
    expect(await pp({ a: 1, bbbb: [1, 2] }, 10)).toBe('{"a"=>1,\n "bbbb"=>\n  [1, 2]}\n');
    expect(await pp(new Map([["a", 1]]))).toBe('{"a"=>1}\n');
    const h: Record<string, unknown> = {};
    h.s = h;
    expect(await pp(h)).toBe('{"s"=>{...}}\n');
  });

  it("prints a Delegator as the object it delegates to", async () => {
    const Mask = DelegateClass(String);
    expect(await pp(new Mask("x"))).toBe('"x"\n');
    expect(await pp([new Mask("y")])).toBe('["y"]\n');
  });

  it("runs a synchronous block in line", () => {
    const out = new StringIO();
    const q = new PP(out);
    q.group(1, "[", "]", () => q.seplist(["a", "b"], null, (v) => q.pp(v)));
    q.flush();
    expect(out.string()).toBe('["a", "b"]');
  });

  it("answers the width of an output with no winsize as 79", () => {
    expect(PP.widthFor(new StringIO())).toBe(79);
  });

  it("dispatches to the receiver's prettyPrint, awaiting an async block", async () => {
    const obj = {
      async prettyPrint(q: PP) {
        await q.group(1, "<", ">", async () => {
          await q.seplist(["x", "y"], null, async (v) => {
            await Promise.resolve();
            q.text(v);
          });
        });
      },
    };
    expect(await pp(obj)).toBe("<x, y>\n");
    expect(await pp(obj, 3)).toBe("<x,\n y>\n");
  });

  it("prints a cycle through pretty_print_cycle", async () => {
    const ary: unknown[] = [1];
    ary.push(ary);
    expect(await pp(ary)).toBe("[1, [...]]\n");

    class Node {
      inspect(): string {
        return "#<Node>";
      }
      prettyPrint(q: PP) {
        return q.objectAddressGroup(this, async () => {
          q.breakable();
          await q.pp(this);
        });
      }
    }
    expect(await pp(new Node())).toMatch(/^#<Node:0x[0-9a-f]+ #<Node:0x[0-9a-f]+ \.\.\.>>\n$/);
  });

  it("restores the indent and the inspect keys when a block raises", async () => {
    const q = new PP(new StringIO());
    const boom = { prettyPrint: () => Promise.reject(new Error("boom")) };
    await expect(q.nest(2, () => q.pp(boom))).rejects.toThrow("boom");
    expect(q.indent).toBe(0);
    expect(q.checkInspectKey(boom)).toBe(false);
  });
});

describe("rbDefineInspectCustom", () => {
  it("routes the nodejs.util.inspect.custom symbol to the class's inspect", () => {
    class Pool {
      secret = "hunter2";
      inspect(): string {
        return "#<Pool env_name=test>";
      }
    }
    rbDefineInspectCustom(Pool);
    class ReadingPool extends Pool {
      override inspect(): string {
        return "#<ReadingPool>";
      }
    }
    const custom = Symbol.for("nodejs.util.inspect.custom");
    const hook = (o: object) => (o as Record<symbol, () => unknown>)[custom]();

    expect(hook(new Pool())).toBe("#<Pool env_name=test>");
    expect(hook(new ReadingPool())).toBe("#<ReadingPool>");
    expect(Object.getOwnPropertySymbols(ReadingPool.prototype)).toEqual([]);
  });
});
