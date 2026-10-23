import { beforeEach, describe, expect, it } from "vitest";
import { EOFError, rbObjRespondTo, StringIO } from "@blazetrails/ruby-compat";
import { Buffer } from "../index.js";

const bin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function cat(...strings: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(strings.reduce((size, string) => size + string.length, 0));
  let offset = 0;
  for (const string of strings) {
    all.set(string, offset);
    offset += string.length;
  }
  return all;
}

function same(x: Uint8Array | null, ex: Uint8Array | null): boolean {
  if (x == null || ex == null) return x === ex;
  if (x.length !== ex.length) return false;
  for (let i = 0; i < ex.length; i++) if (x[i] !== ex[i]) return false;
  return true;
}

const rand = (max: number) => Math.floor(Math.random() * max);

let pool: Uint8Array<ArrayBuffer> | null = null;

function bytes(n: number): Uint8Array {
  if (pool == null) {
    pool = new Uint8Array(1024 * 1400 * 2);
    for (let i = 0; i < pool.length; i += 0x8000) {
      crypto.getRandomValues(pool.subarray(i, i + 0x8000));
    }
  }
  const offset = rand(pool.length - n);
  return pool.subarray(offset, offset + n);
}

describe("MessagePack::Buffer", () => {
  const STATIC_EXAMPLES: Record<string, Uint8Array> = {};
  STATIC_EXAMPLES.empty01 = bin("");
  STATIC_EXAMPLES.empty02 = bin("");
  STATIC_EXAMPLES.copy01 = bin("short");
  STATIC_EXAMPLES.copy02 = bin("short".repeat(2));
  STATIC_EXAMPLES.ref01 = bin("short".repeat(128));
  STATIC_EXAMPLES.ref02 = bin("short".repeat(128 * 2));
  STATIC_EXAMPLES.ref03 = bin("a".repeat((1024 * 1024 + 2) * 2));
  STATIC_EXAMPLES.refcopy01 = bin("short".repeat(128));
  STATIC_EXAMPLES.expand01 = bin("short".repeat(1024));
  STATIC_EXAMPLES.expand02 = bin("short".repeat(127 + 1024));
  STATIC_EXAMPLES.offset01 = bin("ort" + "short");
  STATIC_EXAMPLES.offset02 = bin("ort" + "short".repeat(127));
  STATIC_EXAMPLES.offset03 = bin("ort" + "short".repeat(126 + 1024));

  let memo: {
    randomCasesExamples?: [Record<string, Buffer>, Record<string, Uint8Array>];
    cases?: Record<string, Buffer>;
    examples?: Record<string, Uint8Array>;
  };

  beforeEach(() => {
    memo = {};
  });

  const randomCasesExamples = () =>
    (memo.randomCasesExamples ??= (() => {
      const cases: Record<string, Buffer> = {};
      const examples: Record<string, Uint8Array> = {};

      for (let i = 0; i < 10; i++) {
        const b = new Buffer();
        let s = bytes(0);
        for (let j = rand(3); j > 0; j--) {
          const n = rand(1024 * 1400);
          const x = bytes(n);
          s = cat(s, x);
          b.append(x);
        }
        for (let j = rand(2); j > 0; j--) {
          const n = rand(1024 * 1400);
          b.read(n);
          s = s.subarray(n);
        }
        const key = `random${String(i).padStart(2, "0")}`;
        cases[key] = b;
        examples[key] = s;
      }

      return [cases, examples];
    })());

  const staticCases = () => {
    const map: Record<string, Buffer> = {};
    map.empty01 = empty01();
    map.empty02 = empty02();
    map.copy01 = copy01();
    map.copy02 = copy02();
    map.ref01 = ref01();
    map.ref02 = ref02();
    map.ref03 = ref03();
    map.refcopy01 = refcopy01();
    map.expand01 = expand01();
    map.expand02 = expand02();
    map.offset01 = offset01();
    map.offset02 = offset02();
    map.offset03 = offset03();
    return map;
  };

  const staticExamples = () => STATIC_EXAMPLES;
  const randomCases = () => randomCasesExamples()[0];
  const randomExamples = () => randomCasesExamples()[1];
  const cases = () => (memo.cases ??= { ...staticCases(), ...randomCases() });
  const examples = () => (memo.examples ??= { ...staticExamples(), ...randomExamples() });
  const caseKeys = () => Object.keys(examples());

  const empty01 = () => new Buffer();

  const empty02 = () => {
    const b = new Buffer();
    b.append("a");
    b.readAll(1);
    return b;
  };

  const copy01 = () => {
    const b = new Buffer();
    b.append("short");
    return b;
  };

  const copy02 = () => {
    const b = new Buffer();
    b.append("short");
    b.append("short");
    return b;
  };

  const ref01 = () => {
    const b = new Buffer();
    b.append("short".repeat(128));
    b.toS();
    return b;
  };

  const ref02 = () => {
    const b = new Buffer();
    b.append("short".repeat(128));
    b.toS();
    b.append("short".repeat(128));
    b.toA();
    return b;
  };

  const ref03 = () => {
    const b = new Buffer();
    b.append("a".repeat(1024 * 1024 + 2));
    b.append("a".repeat(1024 * 1024 + 2));
    return b;
  };

  const refcopy01 = () => {
    const b = new Buffer();
    b.append("short".repeat(127));
    b.toS();
    b.append("short");
    return b;
  };

  const expand01 = () => {
    const b = new Buffer();
    for (let i = 0; i < 1024; i++) {
      b.append("short");
    }
    return b;
  };

  const expand02 = () => {
    const b = new Buffer();
    b.append("short".repeat(127));
    b.toS();
    for (let i = 0; i < 1024; i++) {
      b.append("short");
    }
    return b;
  };

  const offset01 = () => {
    const b = new Buffer();
    b.append("short");
    b.append("short");
    b.skip(2);
    return b;
  };

  const offset02 = () => {
    const b = new Buffer();
    b.append("short".repeat(127));
    b.toS();
    b.skip(2);
    b.append("short");
    return b;
  };

  const offset03 = () => {
    const b = new Buffer();
    b.append("short".repeat(127));
    b.toS();
    for (let i = 0; i < 1024; i++) {
      b.append("short");
    }
    b.skip(2);
    return b;
  };

  it("empty?", () => {
    expect(empty01().isEmpty()).toBe(true);
    expect(empty02().isEmpty()).toBe(true);
  });

  it("size", () => {
    for (const k of caseKeys()) {
      expect(cases()[k].size()).toBe(examples()[k].length);
    }
  });

  it("short write increments size", () => {
    for (const k of caseKeys()) {
      let sz = examples()[k].length;
      for (let i = 0; i < 10; i++) {
        cases()[k].write("short");
        sz += "short".length;
        expect(cases()[k].size()).toBe(sz);
      }
    }
  });

  it("read with limit decrements size", () => {
    for (const k of caseKeys()) {
      let sz = examples()[k].length;
      if (sz < 2) continue;

      expect(same(cases()[k].read(1), examples()[k].subarray(0, 1))).toBe(true);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);

      expect(same(cases()[k].read(1), examples()[k].subarray(1, 2))).toBe(true);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("read_all with limit decrements size", () => {
    for (const k of caseKeys()) {
      let sz = examples()[k].length;
      if (sz < 2) continue;

      expect(same(cases()[k].readAll(1), examples()[k].subarray(0, 1))).toBe(true);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);

      expect(same(cases()[k].readAll(1), examples()[k].subarray(1, 2))).toBe(true);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("skip decrements size", () => {
    for (const k of caseKeys()) {
      let sz = examples()[k].length;
      if (sz < 2) continue;

      expect(cases()[k].skip(1)).toBe(1);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);

      expect(cases()[k].skip(1)).toBe(1);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("skip_all decrements size", () => {
    for (const k of caseKeys()) {
      let sz = examples()[k].length;
      if (sz < 2) continue;

      cases()[k].skipAll(1);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);

      cases()[k].skipAll(1);
      sz -= 1;
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("read_all against insufficient buffer raises EOFError and consumes nothing", () => {
    for (const k of caseKeys()) {
      const sz = examples()[k].length;
      expect(() => {
        cases()[k].readAll(sz + 1);
      }).toThrow(EOFError);
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("skip_all against insufficient buffer raises EOFError and consumes nothing", () => {
    for (const k of caseKeys()) {
      const sz = examples()[k].length;
      expect(() => {
        cases()[k].skipAll(sz + 1);
      }).toThrow(EOFError);
      expect(cases()[k].size()).toBe(sz);
    }
  });

  it("read against insufficient buffer consumes all buffer or return nil", () => {
    for (const k of caseKeys()) {
      const sz = examples()[k].length;
      if (sz === 0) {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(cases()[k].read(sz + 1)).toBe(null);
      } else {
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(same(cases()[k].read(sz + 1), examples()[k])).toBe(true);
      }
      expect(cases()[k].size()).toBe(0);
    }
  });

  it("skip against insufficient buffer consumes all buffer", () => {
    for (const k of caseKeys()) {
      const sz = examples()[k].length;
      expect(cases()[k].skip(sz + 1)).toBe(examples()[k].length);
      expect(cases()[k].size()).toBe(0);
    }
  });

  it("read with no arguments consumes all buffer and returns string and do not return nil", () => {
    for (const k of caseKeys()) {
      expect(same(cases()[k].readAll(), examples()[k])).toBe(true);
      expect(cases()[k].size()).toBe(0);
    }
  });

  it("read_all with no arguments consumes all buffer and returns string", () => {
    for (const k of caseKeys()) {
      expect(same(cases()[k].readAll(), examples()[k])).toBe(true);
      expect(cases()[k].size()).toBe(0);
    }
  });

  it("to_s returns a string and consume nothing", () => {
    for (const k of caseKeys()) {
      expect(same(cases()[k].toS(), examples()[k])).toBe(true);
      expect(cases()[k].size()).toBe(examples()[k].length);
    }
  });

  it("to_s and modify", () => {
    for (const k of caseKeys()) {
      const s = cases()[k].toS();
      cat(s, bin("x"));
      expect(same(cases()[k].toS(), examples()[k])).toBe(true);
    }
  });

  it("big write and modify reference", () => {
    const big2 = bin("a".repeat(1024 * 1024 + 2));

    for (const k of caseKeys()) {
      const big1 = bin("a".repeat(1024 * 1024 + 2));
      cases()[k].write(big1);
      big1[big1.length - 1] = "x".charCodeAt(0);
      expect(same(cases()[k].read(), cat(examples()[k], big2))).toBe(true);
    }
  });

  it("big write -> short write", () => {
    const big1 = bin("a".repeat(1024 * 1024 + 2));

    for (const k of caseKeys()) {
      const sz = examples()[k].length;

      cases()[k].write(big1);
      expect(cases()[k].size()).toBe(sz + big1.length);

      cases()[k].write("c");
      expect(cases()[k].size()).toBe(sz + big1.length + 1);

      expect(same(cases()[k].readAll(), cat(examples()[k], big1, bin("c")))).toBe(true);
      expect(cases()[k].size()).toBe(0);
      expect(cases()[k].isEmpty()).toBe(true);
    }
  });

  it("big write 2", () => {
    const big1 = bin("a".repeat(1024 * 1024 + 2));
    const big2 = bin("b".repeat(1024 * 1024 + 2));

    for (const k of caseKeys()) {
      const sz = examples()[k].length;

      cases()[k].write(big1);
      cases()[k].write(big2);
      expect(cases()[k].size()).toBe(sz + big1.length + big2.length);

      expect(same(cases()[k].readAll(sz + big1.length), cat(examples()[k], big1))).toBe(true);
      expect(cases()[k].size()).toBe(big2.length);

      expect(same(cases()[k].read(), big2)).toBe(true);
      expect(cases()[k].size()).toBe(0);
      expect(cases()[k].isEmpty()).toBe(true);
    }
  });

  it("read 0", () => {
    for (const k of caseKeys()) {
      expect(same(cases()[k].read(0), bin(""))).toBe(true);
      expect(same(cases()[k].read(), examples()[k])).toBe(true);
    }
  });

  it("skip 0", () => {
    for (const k of caseKeys()) {
      expect(cases()[k].skip(0)).toBe(0);
      expect(same(cases()[k].read(), examples()[k])).toBe(true);
    }
  });

  it("read_all 0", () => {
    for (const k of caseKeys()) {
      expect(same(cases()[k].readAll(0), bin(""))).toBe(true);
      expect(same(cases()[k].readAll(), examples()[k])).toBe(true);
    }
  });

  it("skip_all 0", () => {
    for (const k of caseKeys()) {
      cases()[k].skipAll(0);
      expect(same(cases()[k].readAll(), examples()[k])).toBe(true);
    }
  });

  it("write_to", () => {
    for (const k of caseKeys()) {
      const sio = new StringIO(new Uint8Array(0));
      expect(cases()[k].writeTo(sio)).toBe(examples()[k].length);
      expect(cases()[k].size()).toBe(0);
      expect(same(sio.string(), examples()[k])).toBe(true);
    }
  });

  it("random read/write", () => {
    let s = bytes(0);
    const b = new Buffer();

    for (let i = 0; i < 10; i++) {
      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s = cat(s, x);
        b.write(x);
      }

      for (let j = rand(3); j > 0; j--) {
        const n = rand(1024 * 1400);
        let ex: Uint8Array | null = s.subarray(0, n);
        s = s.subarray(n);
        if (ex.length === 0) ex = null;
        const x = b.read(n);
        expect(same(x, ex)).toBe(true);
        expect(b.size()).toBe(s.length);
      }
    }
  });

  it("random read_all/write", () => {
    let s = bytes(0);
    const b = new Buffer();

    for (let i = 0; i < 10; i++) {
      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s = cat(s, x);
        b.write(x);
      }

      for (let j = rand(3); j > 0; j--) {
        const n = rand(1024 * 1400);
        try {
          const x = b.readAll(n);
          const ex = s.subarray(0, n);
          s = s.subarray(n);
          expect(same(x, ex)).toBe(true);
          expect(b.size()).toBe(s.length);
        } catch (error) {
          if (!(error instanceof EOFError)) throw error;
          // eslint-disable-next-line vitest/no-conditional-expect
          expect(b.size()).toBe(s.length);
          // eslint-disable-next-line vitest/no-conditional-expect
          expect(same(b.read(), s)).toBe(true);
          s = bytes(0);
          break;
        }
      }
    }
  });

  it("random skip write", () => {
    let s = bytes(0);
    const b = new Buffer();

    for (let i = 0; i < 10; i++) {
      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s = cat(s, x);
        b.write(x);
      }

      for (let j = rand(3); j > 0; j--) {
        const n = rand(1024 * 1400);
        const ex = s.subarray(0, n);
        s = s.subarray(n);
        expect(b.skip(n)).toBe(ex.length);
        expect(b.size()).toBe(s.length);
      }
    }
  });

  it("random skip_all write", () => {
    let s = bytes(0);
    const b = new Buffer();

    for (let i = 0; i < 10; i++) {
      for (let j = rand(4); j > 0; j--) {
        const n = rand(1024 * 1400);
        const x = bytes(n);
        s = cat(s, x);
        b.write(x);
      }

      for (let j = rand(3); j > 0; j--) {
        const n = rand(1024 * 1400);
        try {
          b.skipAll(n);
          s = s.subarray(n);
          expect(b.size()).toBe(s.length);
        } finally {
          expect(b.size()).toBe(s.length);
          expect(same(b.read(), s)).toBe(true);
          s = bytes(0);
          // eslint-disable-next-line no-unsafe-finally
          break;
        }
      }
    }
  });

  // PERMANENT-SKIP: V8 exposes no per-object allocation size, as on JRuby (buffer_spec.rb:576).
  it.skip("defines a function for ObjectSpace.memsize_of", () => {});

  it("doesn't allow #dup or #clone", () => {
    const subject = new Buffer();
    expect(rbObjRespondTo(subject, "dup")).toBe(false);
    expect(rbObjRespondTo(subject, "clone")).toBe(false);
  });

  it("doesn't crash when marking an uninitialized buffer", () => {
    new Buffer();
  });
});
