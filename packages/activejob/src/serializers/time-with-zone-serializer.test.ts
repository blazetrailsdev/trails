import "../test-helpers/helper.js";
import { zone, setZone } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { Time as RubyTime } from "@blazetrails/date";
import { rbFSend, rbModName, registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "../codegen-runtime.js";
import { TimeWithZoneSerializer } from "../serializers/time-with-zone-serializer.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("TimeWithZoneSerializerTest", () => {
  class TimeWithZoneSerializerTest extends TestHost {}
  registerConstant("TimeWithZoneSerializerTest", TimeWithZoneSerializerTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("#deserialize preserves serialized time zone", async ({ testCase }: any) => {
    let timeZoneBefore: any, timeWithZone: any, serialized: any, deserialized: any;
    try {
      timeZoneBefore = await zone();
      setZone("America/Los_Angeles");
      timeWithZone = await rbFSend(await RubyTime.parse("08:00"), "inTimeZone");
      expect(await rbModName(await (await timeWithZone.timeZone).tzinfo)).toEqual(
        "America/Los_Angeles",
      );
      serialized = await TimeWithZoneSerializer.serialize(timeWithZone);
      setZone("Europe/London");
      deserialized = await TimeWithZoneSerializer.deserialize(serialized);
      expect(await rbModName(await (await deserialized.timeZone).tzinfo)).toEqual(
        "America/Los_Angeles",
      );
      expect(deserialized).toEqual(timeWithZone);
    } finally {
      setZone(timeZoneBefore);
    }
  });
});
