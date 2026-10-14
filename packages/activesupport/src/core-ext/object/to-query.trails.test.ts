import { describe, it } from "vitest";
import { assertEqual } from "../../testing/assertions.js";
import { toQuery } from "../../hash-utils.js";

describe("ToQueryTest", () => {
  it("a value that defines to_query is sent it with its key", () => {
    class Value {
      toQuery(key: string): string {
        return `${key}=own`;
      }
    }

    assertEqual("root=own", toQuery({ root: new Value() }));
    assertEqual("a[b]=own", toQuery({ a: { b: new Value() } }));
    assertEqual("a[]=own&a[]=own", toQuery({ a: [new Value(), new Value()] }));
  });

  it("a value that does not define to_query keeps the escaped key and param", () => {
    assertEqual("a%5Bb%5D=1&c=x+y&d=", toQuery({ a: { b: 1 }, c: "x y", d: null }));
  });
});
