import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";
import type { Handler } from "./handler.js";
import type { Token } from "./token.js";

describe("TestHandler", () => {
  let selfDefinitions: Record<string, Handler[]> | undefined;

  beforeEach(() => {
    Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  function definitions(): Record<string, Handler[]> {
    return (selfDefinitions ??= new Chronic.Parser().definitions());
  }

  it("handler class 1", () => {
    const handler = new Chronic.Handler([":repeater"], "handler");

    const tokens: Token[] = [new Chronic.Token("friday")];
    tokens[0].tag(new Chronic.RepeaterDayName("friday"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("afternoon"));
    tokens[1].tag(new Chronic.RepeaterDayPortion("afternoon"));

    expect(!handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 2", () => {
    const handler = new Chronic.Handler([":repeater", ":repeater?"], "handler");

    const tokens: Token[] = [new Chronic.Token("friday")];
    tokens[0].tag(new Chronic.RepeaterDayName("friday"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("afternoon"));
    tokens[1].tag(new Chronic.RepeaterDayPortion("afternoon"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("afternoon"));
    tokens[2].tag(new Chronic.RepeaterDayPortion("afternoon"));

    expect(!handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 3", () => {
    const handler = new Chronic.Handler([":repeater", "time?"], "handler");

    const tokens: Token[] = [new Chronic.Token("friday")];
    tokens[0].tag(new Chronic.RepeaterDayName("friday"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("afternoon"));
    tokens[1].tag(new Chronic.RepeaterDayPortion("afternoon"));

    expect(!handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 4", () => {
    const handler = new Chronic.Handler(
      [":repeater_month_name", ":scalar_day", "time?"],
      "handler",
    );

    const tokens: Token[] = [new Chronic.Token("may")];
    tokens[0].tag(new Chronic.RepeaterMonthName("may"));

    expect(!handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("27"));
    tokens[1].tag(new Chronic.ScalarDay(27));

    expect(handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 5", () => {
    const handler = new Chronic.Handler([":repeater", "time?"], "handler");

    const tokens: Token[] = [new Chronic.Token("friday")];
    tokens[0].tag(new Chronic.RepeaterDayName("friday"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("5:00"));
    tokens[1].tag(new Chronic.RepeaterTime("5:00"));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens.push(new Chronic.Token("pm"));
    tokens[2].tag(new Chronic.RepeaterDayPortion("pm"));

    expect(handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 6", () => {
    const handler = new Chronic.Handler([":scalar", ":repeater", ":pointer"], "handler");

    const tokens = [new Chronic.Token("3"), new Chronic.Token("years"), new Chronic.Token("past")];

    tokens[0].tag(new Chronic.Scalar(3));
    tokens[1].tag(new Chronic.RepeaterYear("year"));
    tokens[2].tag(new Chronic.Pointer("past"));

    expect(handler.match(tokens, definitions())).toBeTruthy();
  });

  it("handler class 7", () => {
    const handler = new Chronic.Handler([[":separator_on", ":separator_at"], ":scalar"], "handler");

    let tokens = [new Chronic.Token("at"), new Chronic.Token("14")];

    tokens[0].tag(new Chronic.SeparatorAt("at"));
    tokens[1].tag(new Chronic.Scalar(14));

    expect(handler.match(tokens, definitions())).toBeTruthy();

    tokens = [new Chronic.Token("on"), new Chronic.Token("15")];

    tokens[0].tag(new Chronic.SeparatorOn("on"));
    tokens[1].tag(new Chronic.Scalar(15));

    expect(handler.match(tokens, definitions())).toBeTruthy();
  });
});
