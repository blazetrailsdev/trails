import { describe, it, expect } from "vitest";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { TimeZone } from "../values/time-zone.js";
import { setZone, zone as timeZone } from "../time-zone-config.js";
import { ActiveSupportJSON, parseJsonTimes, setParseJsonTimes } from "../json.js";

function withParseJsonTimes<T>(value: boolean, fn: () => T): T {
  const oldValue = parseJsonTimes;
  setParseJsonTimes(value);
  try {
    return fn();
  } finally {
    setParseJsonTimes(oldValue);
  }
}

expect.addEqualityTesters([
  (a: unknown, b: unknown) => {
    if (a instanceof Time) return a.compareWithCoercion(b) === 0;
    if (b instanceof Time) return b.compareWithCoercion(a) === 0;
    return undefined;
  },
]);

function withTzDefault<T>(tz: TimeZone | string | null, fn: () => T): T {
  const oldTz = timeZone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}

describe("TestJSONDecoding", () => {
  const TESTS: [string, unknown][] = [
    ['{"returnTo":{"\\/categories":"\\/"}}', { returnTo: { "/categories": "/" } }],
    ['{"return\\"To\\":":{"\\/categories":"\\/"}}', { 'return"To":': { "/categories": "/" } }],
    ['{"returnTo":{"\\/categories":1}}', { returnTo: { "/categories": 1 } }],
    ['{"returnTo":[1,"a"]}', { returnTo: [1, "a"] }],
    ['{"returnTo":[1,"\\"a\\",", "b"]}', { returnTo: [1, '"a",', "b"] }],
    ['{"a": "\'", "b": "5,000"}', { a: "'", b: "5,000" }],
    ['{"a": "a\'s, b\'s and c\'s", "b": "5,000"}', { a: "a's, b's and c's", b: "5,000" }],
    ['{"matzue": "松江", "asakusa": "浅草"}', { matzue: "松江", asakusa: "浅草" }],
    ['{"a": "2007-01-01"}', { a: RubyDate.civil(2007, 1, 1) }],
    ['{"a": "2007-01-01 01:12:34 Z"}', { a: Time.utc(2007, 1, 1, 1, 12, 34) }],
    ['["2007-01-01 01:12:34 Z"]', [Time.utc(2007, 1, 1, 1, 12, 34)]],
    [
      '["2007-01-01 01:12:34 Z", "2007-01-01 01:12:35 Z"]',
      [Time.utc(2007, 1, 1, 1, 12, 34), Time.utc(2007, 1, 1, 1, 12, 35)],
    ],
    ['{"a": "2007-01-01 01:12:34"}', { a: Time.new(2007, 1, 1, 1, 12, 34, "-05:00") }],
    ['{"a": "1089-10-40"}', { a: "1089-10-40" }],
    ['{"a": "2009-08-10T19:01:02"}', { a: Time.new(2009, 8, 10, 19, 1, 2, "-04:00") }],
    ['{"a": "2009-08-10T19:01:02Z"}', { a: Time.utc(2009, 8, 10, 19, 1, 2) }],
    ['{"a": "2009-08-10T19:01:02+02:00"}', { a: Time.utc(2009, 8, 10, 17, 1, 2) }],
    ['{"a": "2009-08-10T19:01:02-05:00"}', { a: Time.utc(2009, 8, 11, 0, 1, 2) }],
    ['{"a": " 2007-01-01 01:12:34 Z "}', { a: " 2007-01-01 01:12:34 Z " }],
    ['{"a": "2007-01-01 : it\'s your birthday"}', { a: "2007-01-01 : it's your birthday" }],
    ['{"a": "Today is:\\n2020-05-21"}', { a: "Today is:\n2020-05-21" }],
    [
      '{"a": "2007-01-01 01:12:34 Z\\nwas my birthday"}',
      { a: "2007-01-01 01:12:34 Z\nwas my birthday" },
    ],
    ["[]", []],
    ["{}", {}],
    ['{"a":1}', { a: 1 }],
    ['{"a": ""}', { a: "" }],
    ['{"a":"\\""}', { a: '"' }],
    ['{"a": null}', { a: null }],
    ['{"a": true}', { a: true }],
    ['{"a": false}', { a: false }],
    ['{"bad":"\\\\","trailing":""}', { bad: "\\", trailing: "" }],
    ['{"a": "http:\\/\\/test.host\\/posts\\/1"}', { a: "http://test.host/posts/1" }],
    ['{"a": "\\u003cunicode\\u0020escape\\u003e"}', { a: "<unicode escape>" }],
    ['{"a": "\\\\u0020skip double backslashes"}', { a: "\\u0020skip double backslashes" }],
    ['{"a": "\\u003cbr /\\u003e"}', { a: "<br />" }],
    ['{"b":["\\u003ci\\u003e","\\u003cb\\u003e","\\u003cu\\u003e"]}', { b: ["<i>", "<b>", "<u>"] }],
    [
      '[{"d":"1970-01-01", "s":"\\u0020escape"},{"d":"1970-01-01", "s":"\\u0020escape"}]',
      [
        { d: RubyDate.civil(1970, 1, 1), s: " escape" },
        { d: RubyDate.civil(1970, 1, 1), s: " escape" },
      ],
    ],
    [
      '[{"d":"1970-01-01","s":"http:\\/\\/example.com"},{"d":"1970-01-01","s":"http:\\/\\/example.com"}]',
      [
        { d: RubyDate.civil(1970, 1, 1), s: "http://example.com" },
        { d: RubyDate.civil(1970, 1, 1), s: "http://example.com" },
      ],
    ],
    ['{"a":"\\n"}', { a: "\n" }],
    ['{"a":"\\u000a"}', { a: "\n" }],
    ['{"a":"Line1\\u000aLine2"}', { a: "Line1\nLine2" }],
    ['{"json_class":"TestJSONDecoding::Foo"}', { json_class: "TestJSONDecoding::Foo" }],
    ['"a string"', "a string"],
    ["1.1", 1.1],
    ["1", 1],
    ["-1", -1],
    ["true", true],
    ["false", false],
    ["null", null],
  ];

  it("JSON decodes ", () => {
    for (const [json, expected] of TESTS) {
      const failMessage = `JSON decoding failed for ${json}`;

      withTzDefault("Eastern Time (US & Canada)", () => {
        withParseJsonTimes(true, () => {
          if (expected == null) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect(ActiveSupportJSON.decode(json), failMessage).toBeNull();
          } else {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect(ActiveSupportJSON.decode(json), failMessage).toEqual(expected);
          }
        });
      });
    }
  });

  it("JSON decodes time JSON with time parsing disabled", () => {
    withParseJsonTimes(false, () => {
      const expected = { a: "2007-01-01 01:12:34 Z" };
      expect(ActiveSupportJSON.decode('{"a": "2007-01-01 01:12:34 Z"}')).toEqual(expected);
    });
  });

  it("failed json decoding", () => {
    expect(() => ActiveSupportJSON.decode("undefined")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("{a: 1}")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("{: 1}")).toThrow(ActiveSupportJSON.parseError());
    expect(() => ActiveSupportJSON.decode("")).toThrow(ActiveSupportJSON.parseError());
  });

  it("cannot pass unsupported options", () => {
    const decode = (json: string, options?: Record<string, unknown>) => {
      if (options && "create_additions" in options) {
        throw new Error("Unsupported option: create_additions");
      }
      return ActiveSupportJSON.decode(json);
    };
    expect(() => decode("", { create_additions: true })).toThrow();
  });
});
