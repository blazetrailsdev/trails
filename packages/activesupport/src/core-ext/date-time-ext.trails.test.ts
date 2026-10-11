import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import "./date-time/conversions.js";
import "./date/conversions.js";

describe("DateTime#usec on a Temporal receiver", () => {
  it("is answered by a DateTime and a Time, and not by a Date", () => {
    const datetime = Temporal.PlainDateTime.from("2005-02-21T14:30:00.123456");
    const time = datetime.toZonedDateTime("UTC");

    expect(rbObjRespondTo(datetime, "usec")).toBe(true);
    expect(rbObjRespondTo(time, "usec")).toBe(true);
    expect(rbObjRespondTo(datetime.toPlainDate(), "usec")).toBe(false);
    expect(rbFSend(datetime, "usec")).toBe(123456);
    expect(rbFSend(time, "usec")).toBe(123456);
  });
});
