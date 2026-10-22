import { describe, it } from "vitest";
import {
  assertEqual,
  setZone,
  type TimeWithZone,
  type TimeZone,
  zone,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import "../test-helpers/helper.js";
import { ActiveJob } from "../namespaces.js";
import "../serializers.js";

describe("TimeWithZoneSerializerTest", () => {
  it("#deserialize preserves serialized time zone", () => {
    const timeZoneBefore = zone();

    try {
      setZone("America/Los_Angeles");
      const timeWithZone = Time.parse("08:00").inTimeZone() as TimeWithZone;

      assertEqual("America/Los_Angeles", (timeWithZone.timeZone as TimeZone).tzinfo.name);

      const serialized = ActiveJob.Serializers.TimeWithZoneSerializer.serialize(timeWithZone);
      setZone("Europe/London");
      const deserialized = ActiveJob.Serializers.TimeWithZoneSerializer.deserialize(
        serialized,
      ) as TimeWithZone;

      assertEqual("America/Los_Angeles", (deserialized.timeZone as TimeZone).tzinfo.name);
      assertEqual(timeWithZone, deserialized);
    } finally {
      setZone(timeZoneBefore);
    }
  });
});
