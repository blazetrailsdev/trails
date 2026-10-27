import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./date.js";
import * as m1 from "./grabber.js";
import * as m2 from "./handler.js";
import * as m3 from "./mini-date.js";
import * as m4 from "./numerizer.js";
import * as m5 from "./ordinal.js";
import * as m6 from "./parser.js";
import * as m7 from "./pointer.js";
import * as m8 from "./repeater.js";
import * as m9 from "./repeaters/repeater-day-name.js";
import * as m10 from "./repeaters/repeater-day-portion.js";
import * as m11 from "./repeaters/repeater-day.js";
import * as m12 from "./repeaters/repeater-fortnight.js";
import * as m13 from "./repeaters/repeater-hour.js";
import * as m14 from "./repeaters/repeater-minute.js";
import * as m15 from "./repeaters/repeater-month-name.js";
import * as m16 from "./repeaters/repeater-month.js";
import * as m17 from "./repeaters/repeater-season-name.js";
import * as m18 from "./repeaters/repeater-season.js";
import * as m19 from "./repeaters/repeater-second.js";
import * as m20 from "./repeaters/repeater-time.js";
import * as m21 from "./repeaters/repeater-week.js";
import * as m22 from "./repeaters/repeater-weekday.js";
import * as m23 from "./repeaters/repeater-weekend.js";
import * as m24 from "./repeaters/repeater-year.js";
import * as m25 from "./scalar.js";
import * as m26 from "./season.js";
import * as m27 from "./separator.js";
import * as m28 from "./sign.js";
import * as m29 from "./span.js";
import * as m30 from "./tag.js";
import * as m31 from "./time-zone.js";
import * as m32 from "./time.js";
import * as m33 from "./token.js";

registerClassPaths([
  [() => m0.Date, "Chronic::Date"],
  [() => m1.Grabber, "Chronic::Grabber"],
  [() => m2.Handler, "Chronic::Handler"],
  [() => m3.MiniDate, "Chronic::MiniDate"],
  [() => m4.Numerizer, "Chronic::Numerizer"],
  [() => m5.Ordinal, "Chronic::Ordinal"],
  [() => m5.OrdinalDay, "Chronic::OrdinalDay"],
  [() => m5.OrdinalMonth, "Chronic::OrdinalMonth"],
  [() => m5.OrdinalYear, "Chronic::OrdinalYear"],
  [() => m6.Parser, "Chronic::Parser"],
  [() => m7.Pointer, "Chronic::Pointer"],
  [() => m8.Repeater, "Chronic::Repeater"],
  [() => m11.RepeaterDay, "Chronic::RepeaterDay"],
  [() => m9.RepeaterDayName, "Chronic::RepeaterDayName"],
  [() => m10.RepeaterDayPortion, "Chronic::RepeaterDayPortion"],
  [() => m12.RepeaterFortnight, "Chronic::RepeaterFortnight"],
  [() => m13.RepeaterHour, "Chronic::RepeaterHour"],
  [() => m14.RepeaterMinute, "Chronic::RepeaterMinute"],
  [() => m16.RepeaterMonth, "Chronic::RepeaterMonth"],
  [() => m15.RepeaterMonthName, "Chronic::RepeaterMonthName"],
  [() => m18.RepeaterSeason, "Chronic::RepeaterSeason"],
  [() => m17.RepeaterSeasonName, "Chronic::RepeaterSeasonName"],
  [() => m19.RepeaterSecond, "Chronic::RepeaterSecond"],
  [() => m20.RepeaterTime, "Chronic::RepeaterTime"],
  [() => m20.Tick, "Chronic::RepeaterTime::Tick"],
  [() => m21.RepeaterWeek, "Chronic::RepeaterWeek"],
  [() => m22.RepeaterWeekday, "Chronic::RepeaterWeekday"],
  [() => m23.RepeaterWeekend, "Chronic::RepeaterWeekend"],
  [() => m24.RepeaterYear, "Chronic::RepeaterYear"],
  [() => m25.Scalar, "Chronic::Scalar"],
  [() => m25.ScalarDay, "Chronic::ScalarDay"],
  [() => m25.ScalarHour, "Chronic::ScalarHour"],
  [() => m25.ScalarMinute, "Chronic::ScalarMinute"],
  [() => m25.ScalarMonth, "Chronic::ScalarMonth"],
  [() => m25.ScalarSecond, "Chronic::ScalarSecond"],
  [() => m25.ScalarSubsecond, "Chronic::ScalarSubsecond"],
  [() => m25.ScalarYear, "Chronic::ScalarYear"],
  [() => m26.Season, "Chronic::Season"],
  [() => m27.Separator, "Chronic::Separator"],
  [() => m27.SeparatorAnd, "Chronic::SeparatorAnd"],
  [() => m27.SeparatorAt, "Chronic::SeparatorAt"],
  [() => m27.SeparatorColon, "Chronic::SeparatorColon"],
  [() => m27.SeparatorComma, "Chronic::SeparatorComma"],
  [() => m27.SeparatorDash, "Chronic::SeparatorDash"],
  [() => m27.SeparatorDot, "Chronic::SeparatorDot"],
  [() => m27.SeparatorIn, "Chronic::SeparatorIn"],
  [() => m27.SeparatorOn, "Chronic::SeparatorOn"],
  [() => m27.SeparatorQuote, "Chronic::SeparatorQuote"],
  [() => m27.SeparatorSlash, "Chronic::SeparatorSlash"],
  [() => m27.SeparatorSpace, "Chronic::SeparatorSpace"],
  [() => m27.SeparatorT, "Chronic::SeparatorT"],
  [() => m27.SeparatorW, "Chronic::SeparatorW"],
  [() => m28.Sign, "Chronic::Sign"],
  [() => m28.SignMinus, "Chronic::SignMinus"],
  [() => m28.SignPlus, "Chronic::SignPlus"],
  [() => m29.Span, "Chronic::Span"],
  [() => m30.Tag, "Chronic::Tag"],
  [() => m32.Time, "Chronic::Time"],
  [() => m31.TimeZone, "Chronic::TimeZone"],
  [() => m33.Token, "Chronic::Token"],
]);
