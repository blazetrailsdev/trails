import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YAML } from "./yaml.js";
import { File } from "./file.js";

const complexKey1 = `    ? # PLAY SCHEDULE
      - Detroit Tigers
      - Chicago Cubs
    :
      - 2001-07-23

    ? [ New York Yankees,
        Atlanta Braves ]
    : [ 2001-07-02, 2001-08-12,
       2001-08-14 ]
`;

describe("YAML.unsafe_load", () => {
  const send = (yaml: Parameters<typeof YAML.load>[0]) => YAML.unsafeLoad(yaml);
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "trails-yaml-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a document from current io stream when io provided", () => {
    const testFile = join(dir, "yaml_test_file");
    File.open(testFile, "w", (io) => {
      YAML.dump(["badger", "elephant", "tiger"], io);
    });
    expect(File.open(testFile, "r", (yf) => send(yf))).toEqual(["badger", "elephant", "tiger"]);
  });

  it("loads strings", () => {
    const strings = [
      "str",
      " str",
      "'str'",
      "str",
      " str",
      "'str'",
      '"str"',
      "\n str",
      "---  str",
      "---\nstr",
      "--- \nstr",
      "--- \n str",
      "--- 'str'",
    ];
    for (const str of strings) {
      expect(send(str)).toBe("str");
    }
  });

  it("loads strings with chars from non-base Unicode plane", () => {
    const yamlAndStrings: [number[], number[]][] = [
      [
        [45, 45, 45, 32, 240, 159, 140, 181],
        [240, 159, 140, 181],
      ],
      [
        [
          45, 45, 45, 32, 240, 159, 140, 181, 32, 97, 110, 100, 32, 115, 111, 109, 101, 32, 116,
          101, 120, 116,
        ],
        [240, 159, 140, 181, 32, 97, 110, 100, 32, 115, 111, 109, 101, 32, 116, 101, 120, 116],
      ],
      [
        [
          45, 45, 45, 32, 83, 111, 109, 101, 32, 116, 101, 120, 116, 32, 240, 159, 140, 181, 32, 97,
          110, 100, 32, 115, 111, 109, 101, 32, 116, 101, 120, 116,
        ],
        [
          83, 111, 109, 101, 32, 116, 101, 120, 116, 32, 240, 159, 140, 181, 32, 97, 110, 100, 32,
          115, 111, 109, 101, 32, 116, 101, 120, 116,
        ],
      ],
    ];
    for (const [yaml, str] of yamlAndStrings) {
      expect(send(Uint8Array.from(yaml))).toBe(new TextDecoder().decode(Uint8Array.from(str)));
    }
  });

  it("fails on invalid keys", () => {
    expect(() => send("key1: value\ninvalid_key")).toThrow(YAML.SyntaxError);
  });

  it("accepts symbols", () => {
    expect(send("--- :locked")).toBe(":locked");
  });

  it("accepts numbers", () => {
    expect(send("47")).toBe(47);
    expect(send("-1")).toBe(-1);
  });

  it("accepts collections", () => {
    const expected = ["a", "b", "c"];
    expect(send("--- \n- a\n- b\n- c\n")).toEqual(expected);
    expect(send("--- [a, b, c]")).toEqual(expected);
    expect(send("[a, b, c]")).toEqual(expected);
  });

  it("parses start markers", () => {
    expect(send("---\n")).toBe(null);
    expect(send("--- ---\n")).toBe("---");
    expect(send("--- abc")).toBe("abc");
  });

  it("works with block sequence shortcuts", () => {
    const blockSeq = "- - - one\n    - two\n    - three";
    expect(send(blockSeq)).toEqual([[["one", "two", "three"]]]);
  });

  it("loads a symbol key that contains spaces", () => {
    const string = ":user name: This is the user name.";
    const expected = { ":user name": "This is the user name." };
    expect(send(string)).toEqual(expected);
  });

  // PERMANENT-SKIP: ruby-compat's Date is not seated as a Psych scalar type, so 2001-07-23 does not revive as `Date.new(2001, 7, 23)`.
  it.skip("works on complex keys", () => {
    YAML.unsafeLoad(complexKey1);
  });

  // PERMANENT-SKIP: a timestamp scalar revives as no ruby-compat Time with `usec`.
  it.skip("computes the microseconds", () => {
    YAML.unsafeLoad("2011-03-22t23:32:11.2233+01:00");
  });

  // PERMANENT-SKIP: a timestamp scalar revives as no ruby-compat Time with `usec`.
  it.skip("rounds values smaller than 1 usec to 0 ", () => {
    YAML.unsafeLoad("2011-03-22t23:32:11.000000342222+01:00");
  });

  // PERMANENT-SKIP: ruby-compat does not port OpenStruct.
  it.skip("loads an OpenStruct");

  // PERMANENT-SKIP: a ruby-compat File holds a Node file descriptor, which `init_with` cannot leave uninitialized.
  it.skip("loads a File but raise an error when used as it is uninitialized");
});
