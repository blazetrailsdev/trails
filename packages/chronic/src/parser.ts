import type { Time as RubyTime } from "@blazetrails/date";
import {
  ArgumentError,
  hashDelete,
  include,
  rbFArray,
  rbInspect,
  STDOUT,
  fixDiv,
  stringSplit,
  type Included,
} from "@blazetrails/ruby-compat";
import { Grabber } from "./grabber.js";
import { Handler } from "./handler.js";
import { Handlers } from "./handlers.js";
import { Chronic } from "./namespaces.js";
import { Numerizer } from "./numerizer.js";
import { Ordinal } from "./ordinal.js";
import { Pointer } from "./pointer.js";
import { Repeater } from "./repeater.js";
import { Scalar } from "./scalar.js";
import {
  Separator,
  SeparatorAnd,
  SeparatorAt,
  SeparatorComma,
  SeparatorDash,
  SeparatorSlash,
} from "./separator.js";
import { Sign } from "./sign.js";
import type { Span } from "./span.js";
import { TimeZone } from "./time-zone.js";
import { Token } from "./token.js";

let definitions: Record<string, Handler[]> | undefined;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Handlers` (`chronic/parser.rb:5`); the class/interface merge is how the mixin surfaces on the type side. */
export interface Parser extends Included<typeof Handlers> {}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above. */
export class Parser {
  static DEFAULT_OPTIONS: Record<string, unknown> = {
    context: "future",
    now: null,
    hours24: null,
    guess: true,
    ambiguousTimeRange: 6,
    endianPrecedence: ["middle", "little"],
    ambiguousYearFutureBias: 50,
  };

  now: RubyTime;
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    this.options = { ...Parser.DEFAULT_OPTIONS, ...options };
    const now = hashDelete(options, "now") as RubyTime | null;
    this.now = now != null && (now as unknown) !== false ? now : Chronic.timeClass.now();
  }

  parse(text: string): RubyTime | Span | null {
    const tokens = this.tokenize(text, this.options);
    const span = this.tokensToSpan(tokens, { ...this.options, text: text });

    if (Chronic.debug) {
      STDOUT.puts(`+${"-".repeat(51)}\n| ${rbInspect(tokens)}\n+${"-".repeat(51)}`);
    }

    if (span) return this.guess(span, this.options.guess);
    return null;
  }

  preNormalize(text: string): string {
    text = String(text).toLowerCase();
    text = text.replace(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g, "$3 / $2 / $1");
    text = text.replace(/\b([ap])\.m\.?/g, "$1m");
    text = text.replace(/(\s+|:\d{2}|:\d{2}\.\d{3})-(\d{2}:?\d{2})\b/g, "$1tzminus$2");
    text = text.replace(/\./g, ":");
    text = text.replace(/([ap]):m:?/g, "$1m");
    text = text.replace(/['"]/g, "");
    text = text.replace(/,/g, " ");
    text = text.replace(/^second /gm, "2nd ");
    text = text.replace(/\bsecond (of|day|month|hour|minute|second)\b/g, "2nd $1");
    text = Numerizer.numerize(text);
    text = text.replace(/([/\-,@])/g, (_m, c: string) => " " + c + " ");
    text = text.replace(/(?:^|\s)0(\d+:\d+\s*pm?\b)/gm, " $1");
    text = text.replace(/\btoday\b/g, "this day");
    text = text.replace(/\btomm?orr?ow\b/g, "next day");
    text = text.replace(/\byesterday\b/g, "last day");
    text = text.replace(/\bnoon\b/g, "12:00pm");
    text = text.replace(/\bmidnight\b/g, "24:00");
    text = text.replace(/\bnow\b/g, "this second");
    text = text.replaceAll("quarter", "15");
    text = text.replaceAll("half", "30");
    text = text.replace(/(\d{1,2}) (to|till|prior to|before)\b/g, "$1 minutes past");
    text = text.replace(/(\d{1,2}) (after|past)\b/g, "$1 minutes future");
    text = text.replace(/\b(?:ago|before(?: now)?)\b/g, "past");
    text = text.replace(/\bthis (?:last|past)\b/g, "last");
    text = text.replace(/\b(?:in|during) the (morning)\b/g, "$1");
    text = text.replace(/\b(?:in the|during the|at) (afternoon|evening|night)\b/g, "$1");
    text = text.replace(/\btonight\b/g, "this night");
    text = text.replace(/\b\d+:?\d*[ap]\b/g, "$&m");
    text = text.replace(/\b(\d{2})(\d{2})(am|pm)\b/g, "$1:$2$3");
    text = text.replace(/(\d)([ap]m|oclock)\b/g, "$1 $2");
    text = text.replace(/\b(hence|after|from)\b/g, "future");
    text = text.replace(/^\s?an? /gim, "1 ");
    text = text.replace(/\b(\d{4}):(\d{2}):(\d{2})\b/g, "$1 / $2 / $3");
    text = text.replace(/\b0(\d+):(\d{2}):(\d{2}) ([ap]m)\b/g, "$1:$2:$3 $4");
    return text;
  }

  guess(span: Span, mode: unknown = "middle"): RubyTime | Span {
    if (!(mode != null && mode !== false)) return span;
    if (span.width() > 1 && (mode === true || mode === "middle")) {
      return span.begin.plus(fixDiv(span.width(), 2));
    }
    if (mode === "end") return span.end;
    return span.begin;
  }

  definitions(options: Record<string, unknown> = {}): Record<string, Handler[]> {
    if (!(options.endianPrecedence != null && options.endianPrecedence !== false)) {
      options.endianPrecedence = ["middle", "little"];
    }

    definitions ??= {
      time: [new Handler([":repeater_time", ":repeater_day_portion?"], null)],

      date: [
        new Handler(
          [
            ":repeater_day_name",
            ":repeater_month_name",
            ":scalar_day",
            ":repeater_time",
            [":separator_slash?", ":separator_dash?"],
            ":time_zone",
            ":scalar_year",
          ],
          "handleGeneric",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":scalar_day"],
          "handleRdnRmnSd",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":scalar_day", ":scalar_year"],
          "handleRdnRmnSdSy",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":ordinal_day"],
          "handleRdnRmnOd",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":ordinal_day", ":scalar_year"],
          "handleRdnRmnOdSy",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":scalar_day", ":separator_at?", "time?"],
          "handleRdnRmnSd",
        ),
        new Handler(
          [":repeater_day_name", ":repeater_month_name", ":ordinal_day", ":separator_at?", "time?"],
          "handleRdnRmnOd",
        ),
        new Handler(
          [":repeater_day_name", ":ordinal_day", ":separator_at?", "time?"],
          "handleRdnOd",
        ),
        new Handler(
          [
            ":scalar_year",
            [":separator_slash", ":separator_dash"],
            ":scalar_month",
            [":separator_slash", ":separator_dash"],
            ":scalar_day",
            ":repeater_time",
            ":time_zone",
          ],
          "handleGeneric",
        ),
        new Handler([":ordinal_day"], "handleGeneric"),
        new Handler([":repeater_month_name", ":scalar_day", ":scalar_year"], "handleRmnSdSy"),
        new Handler([":repeater_month_name", ":ordinal_day", ":scalar_year"], "handleRmnOdSy"),
        new Handler(
          [":repeater_month_name", ":scalar_day", ":scalar_year", ":separator_at?", "time?"],
          "handleRmnSdSy",
        ),
        new Handler(
          [":repeater_month_name", ":ordinal_day", ":scalar_year", ":separator_at?", "time?"],
          "handleRmnOdSy",
        ),
        new Handler(
          [
            ":repeater_month_name",
            [":separator_slash?", ":separator_dash?"],
            ":scalar_day",
            ":separator_at?",
            "time?",
          ],
          "handleRmnSd",
        ),
        new Handler(
          [
            ":repeater_time",
            ":repeater_day_portion?",
            ":separator_on?",
            ":repeater_month_name",
            ":scalar_day",
          ],
          "handleRmnSdOn",
        ),
        new Handler(
          [":repeater_month_name", ":ordinal_day", ":separator_at?", "time?"],
          "handleRmnOd",
        ),
        new Handler(
          [":ordinal_day", ":repeater_month_name", ":scalar_year", ":separator_at?", "time?"],
          "handleOdRmnSy",
        ),
        new Handler(
          [":ordinal_day", ":repeater_month_name", ":separator_at?", "time?"],
          "handleOdRmn",
        ),
        new Handler(
          [":ordinal_day", ":grabber?", ":repeater_month", ":separator_at?", "time?"],
          "handleOdRm",
        ),
        new Handler([":scalar_year", ":repeater_month_name", ":ordinal_day"], "handleSyRmnOd"),
        new Handler(
          [
            ":repeater_time",
            ":repeater_day_portion?",
            ":separator_on?",
            ":repeater_month_name",
            ":ordinal_day",
          ],
          "handleRmnOdOn",
        ),
        new Handler([":repeater_month_name", ":scalar_year"], "handleRmnSy"),
        new Handler(
          [":scalar_day", ":repeater_month_name", ":scalar_year", ":separator_at?", "time?"],
          "handleSdRmnSy",
        ),
        new Handler(
          [
            ":scalar_day",
            [":separator_slash?", ":separator_dash?"],
            ":repeater_month_name",
            ":separator_at?",
            "time?",
          ],
          "handleSdRmn",
        ),
        new Handler(
          [
            ":scalar_year",
            [":separator_slash", ":separator_dash"],
            ":scalar_month",
            [":separator_slash", ":separator_dash"],
            ":scalar_day",
            ":separator_at?",
            "time?",
          ],
          "handleSySmSd",
        ),
        new Handler(
          [":scalar_year", [":separator_slash", ":separator_dash"], ":scalar_month"],
          "handleSySm",
        ),
        new Handler(
          [":scalar_month", [":separator_slash", ":separator_dash"], ":scalar_year"],
          "handleSmSy",
        ),
        new Handler(
          [
            ":scalar_day",
            [":separator_slash", ":separator_dash"],
            ":repeater_month_name",
            [":separator_slash", ":separator_dash"],
            ":scalar_year",
            ":repeater_time?",
          ],
          "handleSmRmnSy",
        ),
        new Handler(
          [
            ":scalar_year",
            [":separator_slash", ":separator_dash"],
            ":scalar_month",
            [":separator_slash", ":separator_dash"],
            ":scalar?",
            ":time_zone",
          ],
          "handleGeneric",
        ),
      ],

      anchor: [
        new Handler(
          [
            ":separator_on?",
            ":grabber?",
            ":repeater",
            ":separator_at?",
            ":repeater?",
            ":repeater?",
          ],
          "handleR",
        ),
        new Handler(
          [":grabber?", ":repeater", ":repeater", ":separator?", ":repeater?", ":repeater?"],
          "handleR",
        ),
        new Handler([":repeater", ":grabber", ":repeater"], "handleRGR"),
      ],

      arrow: [
        new Handler([":scalar", ":repeater", ":pointer"], "handleSRP"),
        new Handler(
          [
            ":scalar",
            ":repeater",
            ":separator_and?",
            ":scalar",
            ":repeater",
            ":pointer",
            ":separator_at?",
            "anchor",
          ],
          "handleSRASRPA",
        ),
        new Handler([":pointer", ":scalar", ":repeater"], "handlePSR"),
        new Handler([":scalar", ":repeater", ":pointer", ":separator_at?", "anchor"], "handleSRPA"),
      ],

      narrow: [
        new Handler([":ordinal", ":repeater", ":separator_in", ":repeater"], "handleORSR"),
        new Handler([":ordinal", ":repeater", ":grabber", ":repeater"], "handleORGR"),
      ],
    };

    const endians = [
      new Handler(
        [
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_year",
          ":separator_at?",
          "time?",
        ],
        "handleSmSdSy",
      ),
      new Handler(
        [
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_day",
          ":separator_at?",
          "time?",
        ],
        "handleSmSd",
      ),
      new Handler(
        [
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_month",
          ":separator_at?",
          "time?",
        ],
        "handleSdSm",
      ),
      new Handler(
        [
          ":scalar_day",
          [":separator_slash", ":separator_dash"],
          ":scalar_month",
          [":separator_slash", ":separator_dash"],
          ":scalar_year",
          ":separator_at?",
          "time?",
        ],
        "handleSdSmSy",
      ),
    ];

    const endian = rbFArray(options.endianPrecedence)[0];
    switch (endian) {
      case "little":
        return { ...definitions, endian: endians.reverse() };
      case "middle":
        return { ...definitions, endian: endians };
      default:
        throw new ArgumentError(`Unknown endian option '${String(endian)}'`);
    }
  }

  /** @internal */
  private tokenize(text: string, options: Record<string, unknown>): Token[] {
    text = this.preNormalize(text);
    const tokens = stringSplit(text, " ").map((word) => new Token(word));
    for (const tok of [Repeater, Grabber, Pointer, Scalar, Ordinal, Separator, Sign, TimeZone]) {
      tok.scan(tokens, options);
    }
    return tokens.filter((token) => token.isTagged());
  }

  /** @internal */
  private tokensToSpan(tokens: Token[], options: Record<string, unknown>): Span | null {
    const definitions = this.definitions(options);

    for (const handler of [...definitions.endian, ...definitions.date]) {
      if (handler.match(tokens, definitions)) {
        const goodTokens = tokens.filter((o) => !o.getTag(Separator));
        return handler.invoke("date", goodTokens, this, options) as Span | null;
      }
    }

    for (const handler of definitions.anchor) {
      if (handler.match(tokens, definitions)) {
        const goodTokens = tokens.filter((o) => !o.getTag(Separator));
        return handler.invoke("anchor", goodTokens, this, options) as Span | null;
      }
    }

    for (const handler of definitions.arrow) {
      if (handler.match(tokens, definitions)) {
        const goodTokens = tokens.filter(
          (o) =>
            !(
              o.getTag(SeparatorAt) ||
              o.getTag(SeparatorSlash) ||
              o.getTag(SeparatorDash) ||
              o.getTag(SeparatorComma) ||
              o.getTag(SeparatorAnd)
            ),
        );
        return handler.invoke("arrow", goodTokens, this, options) as Span | null;
      }
    }

    for (const handler of definitions.narrow) {
      if (handler.match(tokens, definitions)) {
        return handler.invoke("narrow", tokens, this, options) as Span | null;
      }
    }

    if (Chronic.debug) STDOUT.puts("-none");
    return null;
  }
}

include(Parser, Handlers);

Chronic.Parser = Parser;
