import { quotingHost } from "../../support/quoting-host.js";
import { Temporal } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { typeCast as abstractTypeCast } from "../abstract/quoting.js";
import { quotedDate as mysqlQuotedDate } from "./quoting.js";

// MySQL/MariaDB datetime columns now use the base AR DateTime type (matching
// Rails' `register_class_with_precision m, %r(datetime)i, Type::DateTime`);
// value_for_database yields the cast Temporal.Instant and the mysql2 bind layer
// renders the SQL literal with the 6-digit fractional cap that DATETIME(6)
// enforces. These cases pin that bind-string formatting.
describe("MySQL datetime bind formatting", () => {
  // Rails' `type_cast` dispatches `quoted_date` on the connection
  // (abstract/quoting.rb:104), so the MySQL cap comes from the receiver.
  const bind = (v: unknown) =>
    abstractTypeCast.call(quotingHost({ quotedDate: mysqlQuotedDate }), v);

  it("emits YYYY-MM-DD HH:MM:SS.ffffff without T or Z", () => {
    const instant = Temporal.Instant.from("2026-05-08T14:32:00.123456Z");
    expect(bind(instant)).toBe("2026-05-08 14:32:00.123456");
  });

  it("zero-pads years below 1000", () => {
    // Realistic case: year 44 CE — ensure 4-digit year, not 2-digit (MySQL
    // 2-digit-year rules would misinterpret "44-01-01 00:00:00")
    const instant = Temporal.Instant.from("0044-01-01T00:00:00Z");
    expect(bind(instant) as string).toMatch(/^0044-/);
  });

  it("caps fractional seconds at 6 digits (DATETIME(6) strict mode)", () => {
    const instant = Temporal.Instant.from("2026-05-08T14:32:00.123456789Z");
    expect(bind(instant)).toBe("2026-05-08 14:32:00.123456");
  });

  it("strips fractional seconds when microseconds are zero", () => {
    const instant = Temporal.Instant.from("2026-05-08T14:32:00Z");
    const result = bind(instant) as string;
    expect(result).not.toContain("T");
    expect(result).not.toContain("Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
