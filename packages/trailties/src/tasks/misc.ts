import { TimeZone, getEnv } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { DSL } from "@blazetrails/rake";
import { STDOUT, block, rbStrToF } from "@blazetrails/ruby-compat";
import { InvalidCountryCode } from "@blazetrails/tzinfo";
import type { Task, TaskArguments } from "@blazetrails/rake";

DSL.namespace("time", () => {
  DSL.desc(
    "List all time zones, list by two-letter country code (`bin/rails time:zones[US]`), or list by UTC offset (`bin/rails time:zones[-8]`)",
  );
  DSL.task(
    "zones",
    "country_or_offset",
    block((_t: Task, args: TaskArguments) => {
      let zones = TimeZone.all();
      let offset: string | null = null;

      const countryOrOffset = args.get("country_or_offset") as string | null;
      if (countryOrOffset != null) {
        try {
          zones = TimeZone.countryZones(countryOrOffset);
        } catch (e) {
          if (!(e instanceof InvalidCountryCode)) throw e;
          offset = countryOrOffset;
        }
      }

      buildTimeZoneList(zones, offset);
    }),
  );

  DSL.namespace("zones", () => {
    DSL.task(
      "all",
      block(() => {
        buildTimeZoneList(TimeZone.all());
      }),
    );

    DSL.task(
      "us",
      block(() => {
        buildTimeZoneList(TimeZone.usZones());
      }),
    );

    DSL.task(
      "local",
      block(() => {
        const janOffset = (Time.now().beginningOfYear() as Time).utcOffset;
        const julOffset = (Time.now().beginningOfYear() as Time).change({ month: 7 }).utcOffset;
        const offset = janOffset < julOffset ? janOffset : julOffset;

        buildTimeZoneList(TimeZone.all(), offset);
      }),
    );
  });
});

function buildTimeZoneList(
  zones: TimeZone[],
  offset: string | number | null | undefined = getEnv("OFFSET"),
): void {
  if (offset != null) {
    const match = /(\+|-)?(\d+):(\d+)/.exec(String(offset));
    if (match != null) {
      const sign = match[1] === "-" ? -1 : 1;
      const [hours, minutes] = [rbStrToF(match[2]), rbStrToF(match[3])];
      offset = (hours * 3600 + minutes * 60) * sign;
    } else if (Math.abs(rbStrToF(String(offset))) <= 13) {
      offset = rbStrToF(String(offset)) * 3600;
    } else {
      offset = rbStrToF(String(offset));
    }
  }
  let previousOffset: number | null = null;
  for (const zone of zones) {
    if (offset == null || offset === zone.utcOffset) {
      if (zone.utcOffset !== previousOffset) STDOUT.puts(`\n* UTC ${zone.formattedOffset()} *`);
      STDOUT.puts(zone.name);
      previousOffset = zone.utcOffset;
    }
  }
  STDOUT.puts("\n");
}
