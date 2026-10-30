import { beforeEach, describe, expect, it } from "vitest";
import { cmp, sortByBang } from "@blazetrails/ruby-compat";
import { Base } from "./shell.js";
import type { Basic } from "./shell/basic.js";
import { capture } from "./test-helpers/helper.js";
import { Thor, type ThorClass } from "./thor.js";

describe("Thor", () => {
  let _shell: Basic | undefined;
  function shell(): Basic {
    return (_shell ??= new (Base.shell as unknown as new () => Basic)());
  }

  describe("#sort - default", () => {
    const myScript = class extends Thor {
      static {
        (this as unknown as ThorClass).desc("a", "First Command");
        (this as unknown as ThorClass).methodAdded("a");

        (this as unknown as ThorClass).desc("z", "Last Command");
        (this as unknown as ThorClass).methodAdded("z");
      }

      a() {}

      z() {}
    } as unknown as ThorClass;

    let content: string;
    beforeEach(async () => {
      content = await capture(":stdout", () => myScript.help(shell()));
    });

    it("sorts them lexicographillay", () => {
      expect(content).toMatch(/:a.+:help.+:z/s);
    });
  });

  describe("#sort - simple override", () => {
    const myScript = class extends Thor {
      static {
        (this as unknown as ThorClass).desc("a", "First Command");
        (this as unknown as ThorClass).methodAdded("a");

        (this as unknown as ThorClass).desc("z", "Last Command");
        (this as unknown as ThorClass).methodAdded("z");
      }

      a() {}

      z() {}

      static sortCommandsBang(list: string[][]): string[][] {
        list.sort();
        return list.reverse();
      }
    } as unknown as ThorClass;

    let content: string;
    beforeEach(async () => {
      content = await capture(":stdout", () => myScript.help(shell()));
    });

    it("sorts them in reverse", () => {
      expect(content).toMatch(/:z.+:help.+:a/s);
    });
  });

  describe("#sort - simple override", () => {
    const myScript = class extends Thor {
      static {
        (this as unknown as ThorClass).desc("a", "First Command");
        (this as unknown as ThorClass).methodAdded("a");

        (this as unknown as ThorClass).desc("z", "Last Command");
        (this as unknown as ThorClass).methodAdded("z");
      }

      a() {}

      z() {}

      static sortCommandsBang(list: string[][]): string[][] {
        return sortByBang(list, (a: string[], b?: string[]) =>
          a[0] === ":help" ? -1 : cmp(a[0], b?.[0]),
        );
      }
    } as unknown as ThorClass;

    let content: string;
    beforeEach(async () => {
      content = await capture(":stdout", () => myScript.help(shell()));
    });

    it("puts help first then sorts them lexicographillay", () => {
      expect(content).toMatch(/:help.+:a.+:z/s);
    });
  });
});
