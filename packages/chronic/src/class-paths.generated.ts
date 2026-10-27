import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./date.js";
import * as m1 from "./grabber.js";
import * as m2 from "./handler.js";
import * as m3 from "./handlers.js";
import * as m4 from "./mini-date.js";
import * as m5 from "./numerizer.js";
import * as m6 from "./ordinal.js";
import * as m7 from "./parser.js";
import * as m8 from "./pointer.js";
import * as m9 from "./repeater.js";
import * as m10 from "./repeaters/repeater-day-name.js";
import * as m11 from "./repeaters/repeater-day-portion.js";
import * as m12 from "./repeaters/repeater-day.js";
import * as m13 from "./repeaters/repeater-fortnight.js";
import * as m14 from "./repeaters/repeater-hour.js";
import * as m15 from "./repeaters/repeater-minute.js";
import * as m16 from "./repeaters/repeater-month-name.js";
import * as m17 from "./repeaters/repeater-month.js";
import * as m18 from "./repeaters/repeater-season-name.js";
import * as m19 from "./repeaters/repeater-season.js";
import * as m20 from "./repeaters/repeater-second.js";
import * as m21 from "./repeaters/repeater-time.js";
import * as m22 from "./repeaters/repeater-week.js";
import * as m23 from "./repeaters/repeater-weekday.js";
import * as m24 from "./repeaters/repeater-weekend.js";
import * as m25 from "./repeaters/repeater-year.js";
import * as m26 from "./scalar.js";
import * as m27 from "./season.js";
import * as m28 from "./separator.js";
import * as m29 from "./sign.js";
import * as m30 from "./span.js";
import * as m31 from "./tag.js";
import * as m32 from "./time-zone.js";
import * as m33 from "./time.js";
import * as m34 from "./token.js";

registerClassPaths([
  [() => m0.Date, "Chronic::Date"],
  [() => m1.Grabber, "Chronic::Grabber"],
  [() => m2.Handler, "Chronic::Handler"],
  [() => m3.Handlers, "Chronic::Handlers"],
  [() => m4.MiniDate, "Chronic::MiniDate"],
  [() => m5.Numerizer, "Chronic::Numerizer"],
  [() => m6.Ordinal, "Chronic::Ordinal"],
  [() => m6.OrdinalDay, "Chronic::OrdinalDay"],
  [() => m6.OrdinalMonth, "Chronic::OrdinalMonth"],
  [() => m6.OrdinalYear, "Chronic::OrdinalYear"],
  [() => m7.Parser, "Chronic::Parser"],
  [() => m8.Pointer, "Chronic::Pointer"],
  [() => m9.Repeater, "Chronic::Repeater"],
  [() => m12.RepeaterDay, "Chronic::RepeaterDay"],
  [() => m10.RepeaterDayName, "Chronic::RepeaterDayName"],
  [() => m11.RepeaterDayPortion, "Chronic::RepeaterDayPortion"],
  [() => m13.RepeaterFortnight, "Chronic::RepeaterFortnight"],
  [() => m14.RepeaterHour, "Chronic::RepeaterHour"],
  [() => m15.RepeaterMinute, "Chronic::RepeaterMinute"],
  [() => m17.RepeaterMonth, "Chronic::RepeaterMonth"],
  [() => m16.RepeaterMonthName, "Chronic::RepeaterMonthName"],
  [() => m19.RepeaterSeason, "Chronic::RepeaterSeason"],
  [() => m18.RepeaterSeasonName, "Chronic::RepeaterSeasonName"],
  [() => m20.RepeaterSecond, "Chronic::RepeaterSecond"],
  [() => m21.RepeaterTime, "Chronic::RepeaterTime"],
  [() => m21.Tick, "Chronic::RepeaterTime::Tick"],
  [() => m22.RepeaterWeek, "Chronic::RepeaterWeek"],
  [() => m23.RepeaterWeekday, "Chronic::RepeaterWeekday"],
  [() => m24.RepeaterWeekend, "Chronic::RepeaterWeekend"],
  [() => m25.RepeaterYear, "Chronic::RepeaterYear"],
  [() => m26.Scalar, "Chronic::Scalar"],
  [() => m26.ScalarDay, "Chronic::ScalarDay"],
  [() => m26.ScalarHour, "Chronic::ScalarHour"],
  [() => m26.ScalarMinute, "Chronic::ScalarMinute"],
  [() => m26.ScalarMonth, "Chronic::ScalarMonth"],
  [() => m26.ScalarSecond, "Chronic::ScalarSecond"],
  [() => m26.ScalarSubsecond, "Chronic::ScalarSubsecond"],
  [() => m26.ScalarYear, "Chronic::ScalarYear"],
  [() => m27.Season, "Chronic::Season"],
  [() => m28.Separator, "Chronic::Separator"],
  [() => m28.SeparatorAnd, "Chronic::SeparatorAnd"],
  [() => m28.SeparatorAt, "Chronic::SeparatorAt"],
  [() => m28.SeparatorColon, "Chronic::SeparatorColon"],
  [() => m28.SeparatorComma, "Chronic::SeparatorComma"],
  [() => m28.SeparatorDash, "Chronic::SeparatorDash"],
  [() => m28.SeparatorDot, "Chronic::SeparatorDot"],
  [() => m28.SeparatorIn, "Chronic::SeparatorIn"],
  [() => m28.SeparatorOn, "Chronic::SeparatorOn"],
  [() => m28.SeparatorQuote, "Chronic::SeparatorQuote"],
  [() => m28.SeparatorSlash, "Chronic::SeparatorSlash"],
  [() => m28.SeparatorSpace, "Chronic::SeparatorSpace"],
  [() => m28.SeparatorT, "Chronic::SeparatorT"],
  [() => m28.SeparatorW, "Chronic::SeparatorW"],
  [() => m29.Sign, "Chronic::Sign"],
  [() => m29.SignMinus, "Chronic::SignMinus"],
  [() => m29.SignPlus, "Chronic::SignPlus"],
  [() => m30.Span, "Chronic::Span"],
  [() => m31.Tag, "Chronic::Tag"],
  [() => m33.Time, "Chronic::Time"],
  [() => m32.TimeZone, "Chronic::TimeZone"],
  [() => m34.Token, "Chronic::Token"],
]);
