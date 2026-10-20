/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, Struct, block, sprintf } from "@blazetrails/ruby-compat";
import { Date as RubyDate, Time } from "@blazetrails/date";
import {
  TimeZone,
  assertPredicate,
  isHtmlSafe,
  ordinalize,
  setZone,
  travelTo,
  zone,
} from "@blazetrails/activesupport";
import {
  distanceOfTimeInWords,
  selectDay,
  selectDate,
  selectDatetime,
  selectHour,
  selectMinute,
  selectMonth,
  selectSecond,
  selectTime,
  selectYear,
  timeAgoInWords,
} from "../helpers/date-helper.js";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

const Post = Struct.new("id", "written_on", "updated_at");
Object.defineProperties(Post.prototype, {
  id: { get: () => 123, set: () => {}, configurable: true },
  id_before_type_cast: { get: () => 123, configurable: true },
});
Object.assign(Post.prototype, { toParam: () => "123" });
const ComposedDate = Struct.new("year", "month", "day");
const MONTHS =
  "January February March April May June July August September October November December";

function options(range: number[], sel: number, label: (i: number) => string, value = label) {
  const opt = (i: number) =>
    `<option value="${value(i)}"${i === sel ? ' selected="selected"' : ""}>`;
  return range.map((i) => `${opt(i)}${label(i)}</option>\n`).join("");
}

function upto(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function dateSelects(attr: string, year: number, month: number, day: number): string {
  return (
    `<select id="post_${attr}_1i" name="post[${attr}(1i)]">\n${options(upto(year - 5, year + 5), year, String)}</select>\n` +
    `<select id="post_${attr}_2i" name="post[${attr}(2i)]">\n${options(upto(1, 12), month, (i) => MONTHS.split(" ")[i - 1], String)}</select>\n` +
    `<select id="post_${attr}_3i" name="post[${attr}(3i)]">\n${options(upto(1, 31), day, String)}</select>\n`
  );
}

function timeSelects(attr: string, hour: number, minute: number): string {
  const pad = (i: number) => sprintf("%02d", i);
  return (
    `<select id="post_${attr}_4i" name="post[${attr}(4i)]">\n${options(upto(0, 23), hour, pad)}</select>\n` +
    " : " +
    `<select id="post_${attr}_5i" name="post[${attr}(5i)]">\n${options(upto(0, 59), minute, pad)}</select>\n`
  );
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function add(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

const from = new Date(Date.UTC(2004, 5, 6, 21, 45, 0));

describe("DateHelperTest", () => {
  it("distance in words", () => {
    expect(distanceOfTimeInWords(from, add(from, 0 * SECOND), { includeSeconds: true })).toBe(
      "less than 5 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 4 * SECOND), { includeSeconds: true })).toBe(
      "less than 5 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 5 * SECOND), { includeSeconds: true })).toBe(
      "less than 10 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 9 * SECOND), { includeSeconds: true })).toBe(
      "less than 10 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 10 * SECOND), { includeSeconds: true })).toBe(
      "less than 20 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 19 * SECOND), { includeSeconds: true })).toBe(
      "less than 20 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 20 * SECOND), { includeSeconds: true })).toBe(
      "half a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 39 * SECOND), { includeSeconds: true })).toBe(
      "half a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 40 * SECOND), { includeSeconds: true })).toBe(
      "less than a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 59 * SECOND), { includeSeconds: true })).toBe(
      "less than a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 60 * SECOND), { includeSeconds: true })).toBe(
      "1 minute",
    );

    expect(distanceOfTimeInWords(from, add(from, 0 * SECOND))).toBe("less than a minute");
    expect(distanceOfTimeInWords(from, add(from, 29 * SECOND))).toBe("less than a minute");
    expect(distanceOfTimeInWords(from, add(from, 30 * SECOND))).toBe("1 minute");
    expect(distanceOfTimeInWords(from, add(from, 1 * MINUTE + 29 * SECOND))).toBe("1 minute");
    expect(distanceOfTimeInWords(from, add(from, 1 * MINUTE + 30 * SECOND))).toBe("2 minutes");
    expect(distanceOfTimeInWords(from, add(from, 44 * MINUTE + 29 * SECOND))).toBe("44 minutes");
    expect(distanceOfTimeInWords(from, add(from, 44 * MINUTE + 30 * SECOND))).toBe("about 1 hour");
    expect(distanceOfTimeInWords(from, add(from, 89 * MINUTE + 29 * SECOND))).toBe("about 1 hour");
    expect(distanceOfTimeInWords(from, add(from, 89 * MINUTE + 30 * SECOND))).toBe("about 2 hours");
    expect(distanceOfTimeInWords(from, add(from, 23 * HOUR + 59 * MINUTE + 29 * SECOND))).toBe(
      "about 24 hours",
    );
    expect(distanceOfTimeInWords(from, add(from, 23 * HOUR + 59 * MINUTE + 30 * SECOND))).toBe(
      "1 day",
    );
    expect(distanceOfTimeInWords(from, add(from, 41 * HOUR + 59 * MINUTE + 30 * SECOND))).toBe(
      "2 days",
    );
    expect(distanceOfTimeInWords(from, add(from, 2 * DAY + 12 * HOUR))).toBe("3 days");
  });

  it("distance in words with nil input", () => {
    expect(() => distanceOfTimeInWords(null as unknown as Date)).toThrow();
    expect(() => distanceOfTimeInWords(0, null as unknown as Date)).toThrow();
  });

  it("distance in words with mixed argument types", () => {
    expect(distanceOfTimeInWords(0, 60)).toBe("1 minute");
    expect(distanceOfTimeInWords(600, 0)).toBe("10 minutes");
  });

  it("time ago in words passes include seconds", () => {
    const past = new Date(Date.now() - 15 * SECOND);
    expect(timeAgoInWords(past, { includeSeconds: true })).toBe("less than 20 seconds");
    expect(timeAgoInWords(past, { includeSeconds: false })).toBe("less than a minute");
  });

  it("distance in words with dates", () => {
    const startDate = new Date(Date.UTC(1975, 0, 31));
    const endDate = new Date(Date.UTC(1977, 0, 31));
    expect(distanceOfTimeInWords(startDate, endDate)).toBe("about 2 years");

    const s2 = new Date(Date.UTC(1982, 11, 3));
    const e2 = new Date(Date.UTC(2010, 10, 30));
    expect(distanceOfTimeInWords(s2, e2)).toBe("almost 28 years");
    expect(distanceOfTimeInWords(e2, s2)).toBe("almost 28 years");
  });

  it("distance in words with integers", () => {
    expect(distanceOfTimeInWords(59)).toBe("1 minute");
    expect(distanceOfTimeInWords(60 * 60)).toBe("about 1 hour");
    expect(distanceOfTimeInWords(0, 59)).toBe("1 minute");
    expect(distanceOfTimeInWords(60 * 60, 0)).toBe("about 1 hour");
    expect(distanceOfTimeInWords(10 ** 8)).toBe("about 3 years");
    expect(distanceOfTimeInWords(0, 10 ** 8)).toBe("about 3 years");
  });

  it("time ago in words", () => {
    const oneYearAndOneDayAgo = new Date(Date.now() - (365 * DAY + 1 * DAY));
    expect(timeAgoInWords(oneYearAndOneDayAgo)).toBe("about 1 year");
  });

  it("select day", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(Time.mktime(2003, 8, 16)),
    );
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16),
    );
  });

  it("select day with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]" class="my-day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, { withCssClasses: { day: "my-day" } }),
    );
  });

  it("select month", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16)),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8),
    );
  });

  it("select month with hidden", () => {
    assertDomEqual(
      '<input type="hidden" id="date_month" name="date[month]" value="8" autocomplete="off" />\n',
      selectMonth(8, { useHidden: true }),
    );
  });

  it("select year", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(Time.mktime(2003, 8, 16), { startYear: 2003, endYear: 2005 }),
    );
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(2003, { startYear: 2003, endYear: 2005 }),
    );
  });

  it("select year with hidden", () => {
    assertDomEqual(
      '<input type="hidden" id="date_year" name="date[year]" value="2007" autocomplete="off" />\n',
      selectYear(2007, { useHidden: true }),
    );
  });

  it("select year with position", () => {
    assertDomEqual(
      '<select id="date_year_1i" name="date[year(1i)]">\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(RubyDate.current(), { includePosition: true, startYear: 2003, endYear: 2005 }),
    );
  });

  it("select hour with ampm", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="00">12 AM</option>\n<option value="01">01 AM</option>\n<option value="02">02 AM</option>\n<option value="03">03 AM</option>\n<option value="04">04 AM</option>\n<option value="05">05 AM</option>\n<option value="06">06 AM</option>\n<option value="07">07 AM</option>\n<option value="08" selected="selected">08 AM</option>\n<option value="09">09 AM</option>\n<option value="10">10 AM</option>\n<option value="11">11 AM</option>\n<option value="12">12 PM</option>\n<option value="13">01 PM</option>\n<option value="14">02 PM</option>\n<option value="15">03 PM</option>\n<option value="16">04 PM</option>\n<option value="17">05 PM</option>\n<option value="18">06 PM</option>\n<option value="19">07 PM</option>\n<option value="20">08 PM</option>\n<option value="21">09 PM</option>\n<option value="22">10 PM</option>\n<option value="23">11 PM</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { ampm: true }),
    );
  });

  it("select minute with hidden", () => {
    assertDomEqual(
      '<input type="hidden" id="date_minute" name="date[minute]" value="8" autocomplete="off" />\n',
      selectMinute(8, { useHidden: true }),
    );
  });

  it("select second", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18)),
    );
  });

  it("select date with order", () => {
    assertDomEqual(
      '<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        order: ["month", "day", "year"],
      }),
    );
  });

  it("select time with custom with css classes", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]" class="my-hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="my-minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]" class="my-second">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        withCssClasses: { hour: "my-hour", minute: "my-minute", second: "my-second" },
      }),
    );
  });

  it("select day with blank", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="" label=" "></option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(Time.mktime(2003, 8, 16), { includeBlank: true }),
    );
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="" label=" "></option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, { includeBlank: true }),
    );
  });

  it("select day nil with blank", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="" label=" "></option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(null, { includeBlank: true }),
    );
  });

  it("select day with two digit numbers", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">01</option>\n<option selected="selected" value="2">02</option>\n<option value="3">03</option>\n<option value="4">04</option>\n<option value="5">05</option>\n<option value="6">06</option>\n<option value="7">07</option>\n<option value="8">08</option>\n<option value="9">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(Time.mktime(2011, 8, 2), { useTwoDigitNumbers: true }),
    );
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">01</option>\n<option selected="selected" value="2">02</option>\n<option value="3">03</option>\n<option value="4">04</option>\n<option value="5">05</option>\n<option value="6">06</option>\n<option value="7">07</option>\n<option value="8">08</option>\n<option value="9">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(2, { useTwoDigitNumbers: true }),
    );
  });

  it("select day with day format", () => {
    const dayFormat = (day: number) => ordinalize(day);
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">1st</option>\n<option selected="selected" value="2">2nd</option>\n<option value="3">3rd</option>\n<option value="4">4th</option>\n<option value="5">5th</option>\n<option value="6">6th</option>\n<option value="7">7th</option>\n<option value="8">8th</option>\n<option value="9">9th</option>\n<option value="10">10th</option>\n<option value="11">11th</option>\n<option value="12">12th</option>\n<option value="13">13th</option>\n<option value="14">14th</option>\n<option value="15">15th</option>\n<option value="16">16th</option>\n<option value="17">17th</option>\n<option value="18">18th</option>\n<option value="19">19th</option>\n<option value="20">20th</option>\n<option value="21">21st</option>\n<option value="22">22nd</option>\n<option value="23">23rd</option>\n<option value="24">24th</option>\n<option value="25">25th</option>\n<option value="26">26th</option>\n<option value="27">27th</option>\n<option value="28">28th</option>\n<option value="29">29th</option>\n<option value="30">30th</option>\n<option value="31">31st</option>\n</select>\n',
      selectDay(Time.mktime(2011, 8, 2), { dayFormat: dayFormat }),
    );
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="1">1st</option>\n<option selected="selected" value="2">2nd</option>\n<option value="3">3rd</option>\n<option value="4">4th</option>\n<option value="5">5th</option>\n<option value="6">6th</option>\n<option value="7">7th</option>\n<option value="8">8th</option>\n<option value="9">9th</option>\n<option value="10">10th</option>\n<option value="11">11th</option>\n<option value="12">12th</option>\n<option value="13">13th</option>\n<option value="14">14th</option>\n<option value="15">15th</option>\n<option value="16">16th</option>\n<option value="17">17th</option>\n<option value="18">18th</option>\n<option value="19">19th</option>\n<option value="20">20th</option>\n<option value="21">21st</option>\n<option value="22">22nd</option>\n<option value="23">23rd</option>\n<option value="24">24th</option>\n<option value="25">25th</option>\n<option value="26">26th</option>\n<option value="27">27th</option>\n<option value="28">28th</option>\n<option value="29">29th</option>\n<option value="30">30th</option>\n<option value="31">31st</option>\n</select>\n',
      selectDay(2, { dayFormat: dayFormat }),
    );
  });

  it("select day with html options", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(Time.mktime(2003, 8, 16), {}, { class: "selector" }),
    );
    assertDomEqual(
      '<select id="date_day" name="date[day]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, {}, { class: "selector" }),
    );
  });

  it("select day with default prompt", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="">Day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, { prompt: true }),
    );
  });

  it("select day with custom prompt", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]">\n<option value="">Choose day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, { prompt: "Choose day" }),
    );
  });

  it("select day with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_day" name="date[day]" class="day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDay(16, { withCssClasses: true }),
    );
  });

  it("select month with two digit numbers", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">01</option>\n<option value="2">02</option>\n<option value="3">03</option>\n<option value="4">04</option>\n<option value="5">05</option>\n<option value="6">06</option>\n<option value="7">07</option>\n<option value="8" selected="selected">08</option>\n<option value="9">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n</select>\n',
      selectMonth(Time.mktime(2011, 8, 16), { useTwoDigitNumbers: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">01</option>\n<option value="2">02</option>\n<option value="3">03</option>\n<option value="4">04</option>\n<option value="5">05</option>\n<option value="6">06</option>\n<option value="7">07</option>\n<option value="8" selected="selected">08</option>\n<option value="9">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n</select>\n',
      selectMonth(8, { useTwoDigitNumbers: true }),
    );
  });

  it("select month with disabled", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]" disabled="disabled">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { disabled: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]" disabled="disabled">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { disabled: true }),
    );
  });

  it("select month with field name override", () => {
    assertDomEqual(
      '<select id="date_mois" name="date[mois]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { fieldName: "mois" }),
    );
    assertDomEqual(
      '<select id="date_mois" name="date[mois]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { fieldName: "mois" }),
    );
  });

  it("select month with blank", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="" label=" "></option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { includeBlank: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="" label=" "></option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { includeBlank: true }),
    );
  });

  it("select month nil with blank", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="" label=" "></option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(null, { includeBlank: true }),
    );
  });

  it("select month with numbers", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8" selected="selected">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { useMonthNumbers: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8" selected="selected">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n</select>\n',
      selectMonth(8, { useMonthNumbers: true }),
    );
  });

  it("select month with numbers and names", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1 - January</option>\n<option value="2">2 - February</option>\n<option value="3">3 - March</option>\n<option value="4">4 - April</option>\n<option value="5">5 - May</option>\n<option value="6">6 - June</option>\n<option value="7">7 - July</option>\n<option value="8" selected="selected">8 - August</option>\n<option value="9">9 - September</option>\n<option value="10">10 - October</option>\n<option value="11">11 - November</option>\n<option value="12">12 - December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { addMonthNumbers: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1 - January</option>\n<option value="2">2 - February</option>\n<option value="3">3 - March</option>\n<option value="4">4 - April</option>\n<option value="5">5 - May</option>\n<option value="6">6 - June</option>\n<option value="7">7 - July</option>\n<option value="8" selected="selected">8 - August</option>\n<option value="9">9 - September</option>\n<option value="10">10 - October</option>\n<option value="11">11 - November</option>\n<option value="12">12 - December</option>\n</select>\n',
      selectMonth(8, { addMonthNumbers: true }),
    );
  });

  it("select month with format string", () => {
    const formatString = "%{name} (%<number>02d)";
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">January (01)</option>\n<option value="2">February (02)</option>\n<option value="3">March (03)</option>\n<option value="4">April (04)</option>\n<option value="5">May (05)</option>\n<option value="6">June (06)</option>\n<option value="7">July (07)</option>\n<option value="8" selected="selected">August (08)</option>\n<option value="9">September (09)</option>\n<option value="10">October (10)</option>\n<option value="11">November (11)</option>\n<option value="12">December (12)</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { monthFormatString: formatString }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">January (01)</option>\n<option value="2">February (02)</option>\n<option value="3">March (03)</option>\n<option value="4">April (04)</option>\n<option value="5">May (05)</option>\n<option value="6">June (06)</option>\n<option value="7">July (07)</option>\n<option value="8" selected="selected">August (08)</option>\n<option value="9">September (09)</option>\n<option value="10">October (10)</option>\n<option value="11">November (11)</option>\n<option value="12">December (12)</option>\n</select>\n',
      selectMonth(8, { monthFormatString: formatString }),
    );
  });

  it("select month with numbers and names with abbv", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1 - Jan</option>\n<option value="2">2 - Feb</option>\n<option value="3">3 - Mar</option>\n<option value="4">4 - Apr</option>\n<option value="5">5 - May</option>\n<option value="6">6 - Jun</option>\n<option value="7">7 - Jul</option>\n<option value="8" selected="selected">8 - Aug</option>\n<option value="9">9 - Sep</option>\n<option value="10">10 - Oct</option>\n<option value="11">11 - Nov</option>\n<option value="12">12 - Dec</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { addMonthNumbers: true, useShortMonth: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">1 - Jan</option>\n<option value="2">2 - Feb</option>\n<option value="3">3 - Mar</option>\n<option value="4">4 - Apr</option>\n<option value="5">5 - May</option>\n<option value="6">6 - Jun</option>\n<option value="7">7 - Jul</option>\n<option value="8" selected="selected">8 - Aug</option>\n<option value="9">9 - Sep</option>\n<option value="10">10 - Oct</option>\n<option value="11">11 - Nov</option>\n<option value="12">12 - Dec</option>\n</select>\n',
      selectMonth(8, { addMonthNumbers: true, useShortMonth: true }),
    );
  });

  it("select month with abbv", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">Jan</option>\n<option value="2">Feb</option>\n<option value="3">Mar</option>\n<option value="4">Apr</option>\n<option value="5">May</option>\n<option value="6">Jun</option>\n<option value="7">Jul</option>\n<option value="8" selected="selected">Aug</option>\n<option value="9">Sep</option>\n<option value="10">Oct</option>\n<option value="11">Nov</option>\n<option value="12">Dec</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), { useShortMonth: true }),
    );
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="1">Jan</option>\n<option value="2">Feb</option>\n<option value="3">Mar</option>\n<option value="4">Apr</option>\n<option value="5">May</option>\n<option value="6">Jun</option>\n<option value="7">Jul</option>\n<option value="8" selected="selected">Aug</option>\n<option value="9">Sep</option>\n<option value="10">Oct</option>\n<option value="11">Nov</option>\n<option value="12">Dec</option>\n</select>\n',
      selectMonth(8, { useShortMonth: true }),
    );
  });

  it("select month with custom names", () => {
    const monthNames =
      "nil Januar Februar Marts April Maj Juni Juli August September Oktober November December".split(
        " ",
      );
    let expected = '<select id="date_month" name="date[month]">\n';
    for (let month = 1; month <= 12; month++) {
      expected += `<option value="${month}"${month === 8 ? ' selected="selected"' : ""}>${monthNames[month]}</option>\n`;
    }
    expected += "</select>\n";
    assertDomEqual(expected, selectMonth(Time.mktime(2003, 8, 16), { useMonthNames: monthNames }));
    assertDomEqual(expected, selectMonth(8, { useMonthNames: monthNames }));
  });

  it("select month with zero indexed custom names", () => {
    const monthNames =
      "Januar Februar Marts April Maj Juni Juli August September Oktober November December".split(
        " ",
      );
    let expected = '<select id="date_month" name="date[month]">\n';
    for (let month = 1; month <= 12; month++) {
      expected += `<option value="${month}"${month === 8 ? ' selected="selected"' : ""}>${monthNames[month - 1]}</option>\n`;
    }
    expected += "</select>\n";
    assertDomEqual(expected, selectMonth(Time.mktime(2003, 8, 16), { useMonthNames: monthNames }));
    assertDomEqual(expected, selectMonth(8, { useMonthNames: monthNames }));
  });

  it("select month with hidden and field name", () => {
    assertDomEqual(
      '<input type="hidden" id="date_mois" name="date[mois]" value="8" autocomplete="off" />\n',
      selectMonth(8, { useHidden: true, fieldName: "mois" }),
    );
  });

  it("select month with html options", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]" class="selector" accesskey="M">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(Time.mktime(2003, 8, 16), {}, { class: "selector", accesskey: "M" }),
    );
  });

  it("select month with default prompt", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="">Month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { prompt: true }),
    );
  });

  it("select month with custom prompt", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]">\n<option value="">Choose month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { prompt: "Choose month" }),
    );
  });

  it("select month with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]" class="month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { withCssClasses: true }),
    );
  });

  it("select month with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_month" name="date[month]" class="my-month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n',
      selectMonth(8, { withCssClasses: { month: "my-month" } }),
    );
  });

  it("select year with empty hash value and no start year", () => {
    travelTo(Time.new(2019, 1, 1), {}, () => {
      assertDomEqual(
        '<select id="date_year" name="date[year]">\n<option value="2014">2014</option>\n<option value="2015">2015</option>\n<option value="2016">2016</option>\n<option value="2017">2017</option>\n<option value="2018">2018</option>\n</select>\n',
        selectYear({ year: null, month: 4, day: null }, { endYear: 2018 }),
      );
    });
  });

  it("select year with empty object value and no start year", () => {
    travelTo(Time.new(2019, 1, 1), {}, () => {
      assertDomEqual(
        '<select id="date_year" name="date[year]">\n<option value="2014">2014</option>\n<option value="2015">2015</option>\n<option value="2016">2016</option>\n<option value="2017">2017</option>\n<option value="2018">2018</option>\n</select>\n',
        selectYear(new ComposedDate(null, 4, null), { endYear: 2018 }),
      );
    });
  });

  it("select year with disabled", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" disabled="disabled">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(Time.mktime(2003, 8, 16), { disabled: true, startYear: 2003, endYear: 2005 }),
    );
    assertDomEqual(
      '<select id="date_year" name="date[year]" disabled="disabled">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(2003, { disabled: true, startYear: 2003, endYear: 2005 }),
    );
  });

  it("select year with field name override", () => {
    assertDomEqual(
      '<select id="date_annee" name="date[annee]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(Time.mktime(2003, 8, 16), { startYear: 2003, endYear: 2005, fieldName: "annee" }),
    );
    assertDomEqual(
      '<select id="date_annee" name="date[annee]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(2003, { startYear: 2003, endYear: 2005, fieldName: "annee" }),
    );
  });

  it("select year with type discarding", () => {
    assertDomEqual(
      '<select id="date_year" name="date_year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(Time.mktime(2003, 8, 16), {
        prefix: "date_year",
        discardType: true,
        startYear: 2003,
        endYear: 2005,
      }),
    );
    assertDomEqual(
      '<select id="date_year" name="date_year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(2003, { prefix: "date_year", discardType: true, startYear: 2003, endYear: 2005 }),
    );
  });

  it("select year descending", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="2005" selected="selected">2005</option>\n<option value="2004">2004</option>\n<option value="2003">2003</option>\n</select>\n',
      selectYear(Time.mktime(2005, 8, 16), { startYear: 2005, endYear: 2003 }),
    );
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="2005" selected="selected">2005</option>\n<option value="2004">2004</option>\n<option value="2003">2003</option>\n</select>\n',
      selectYear(2005, { startYear: 2005, endYear: 2003 }),
    );
  });

  it("select year with hidden and field name", () => {
    assertDomEqual(
      '<input type="hidden" id="date_anno" name="date[anno]" value="2007" autocomplete="off" />\n',
      selectYear(2007, { useHidden: true, fieldName: "anno" }),
    );
  });

  it("select year with html options", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="selector" accesskey="M">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(
        Time.mktime(2003, 8, 16),
        { startYear: 2003, endYear: 2005 },
        { class: "selector", accesskey: "M" },
      ),
    );
  });

  it("select year with default prompt", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="">Year</option>\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(null, { startYear: 2003, endYear: 2005, prompt: true }),
    );
  });

  it("select year with custom prompt", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="">Choose year</option>\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(null, { startYear: 2003, endYear: 2005, prompt: "Choose year" }),
    );
  });

  it("select year with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="year">\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(null, { startYear: 2003, endYear: 2005, withCssClasses: true }),
    );
  });

  it("select year with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="my-year">\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n',
      selectYear(null, { startYear: 2003, endYear: 2005, withCssClasses: { year: "my-year" } }),
    );
  });

  it("select year with custom names", () => {
    const yearFormatLambda = (year: number) => `Heisei ${year - 1988}`;
    assertDomEqual(
      '<select id="date_year" name="date[year]">\n<option value="2003">Heisei 15</option>\n<option value="2004">Heisei 16</option>\n<option value="2005">Heisei 17</option>\n</select>\n',
      selectYear(null, { startYear: 2003, endYear: 2005, yearFormat: yearFormatLambda }),
    );
  });

  it("select hour", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18)),
    );
  });

  it("select hour with disabled", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]" disabled="disabled">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { disabled: true }),
    );
  });

  it("select hour with field name override", () => {
    assertDomEqual(
      '<select id="date_heure" name="date[heure]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { fieldName: "heure" }),
    );
  });

  it("select hour with blank", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { includeBlank: true }),
    );
  });

  it("select hour nil with blank", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(null, { includeBlank: true }),
    );
  });

  it("select hour with html options", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]" class="selector" accesskey="M">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), {}, { class: "selector", accesskey: "M" }),
    );
  });

  it("select hour with default prompt", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="">Hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: true }),
    );
  });

  it("select hour with custom prompt", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]">\n<option value="">Choose hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: "Choose hour" }),
    );
  });

  it("select hour with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]" class="hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: true }),
    );
  });

  it("select hour with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_hour" name="date[hour]" class="my-hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n',
      selectHour(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: { hour: "my-hour" } }),
    );
  });

  it("select minute", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18)),
    );
  });

  it("select minute with disabled", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]" disabled="disabled">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { disabled: true }),
    );
  });

  it("select minute with field name override", () => {
    assertDomEqual(
      '<select id="date_minuto" name="date[minuto]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { fieldName: "minuto" }),
    );
  });

  it("select minute with blank", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { includeBlank: true }),
    );
  });

  it("select minute with blank and step", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="15">15</option>\n<option value="30">30</option>\n<option value="45">45</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { includeBlank: true, minuteStep: 15 }),
    );
  });

  it("select minute nil with blank", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(null, { includeBlank: true }),
    );
  });

  it("select minute nil with blank and step", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="15">15</option>\n<option value="30">30</option>\n<option value="45">45</option>\n</select>\n',
      selectMinute(null, { includeBlank: true, minuteStep: 15 }),
    );
  });

  it("select minute with hidden and field name", () => {
    assertDomEqual(
      '<input type="hidden" id="date_minuto" name="date[minuto]" value="8" autocomplete="off" />\n',
      selectMinute(8, { useHidden: true, fieldName: "minuto" }),
    );
  });

  it("select minute with html options", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]" class="selector" accesskey="M">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), {}, { class: "selector", accesskey: "M" }),
    );
  });

  it("select minute with default prompt", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="">Minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: true }),
    );
  });

  it("select minute with custom prompt", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]">\n<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: "Choose minute" }),
    );
  });

  it("select minute with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]" class="minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: true }),
    );
  });

  it("select minute with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_minute" name="date[minute]" class="my-minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectMinute(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: { minute: "my-minute" } }),
    );
  });

  it("select second with disabled", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]" disabled="disabled">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { disabled: true }),
    );
  });

  it("select second with field name override", () => {
    assertDomEqual(
      '<select id="date_segundo" name="date[segundo]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { fieldName: "segundo" }),
    );
  });

  it("select second with blank", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { includeBlank: true }),
    );
  });

  it("select second nil with blank", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]">\n<option value="" label=" "></option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(null, { includeBlank: true }),
    );
  });

  it("select second with html options", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]" class="selector" accesskey="M">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), {}, { class: "selector", accesskey: "M" }),
    );
  });

  it("select second with default prompt", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]">\n<option value="">Seconds</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: true }),
    );
  });

  it("select second with custom prompt", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]">\n<option value="">Choose seconds</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { prompt: "Choose seconds" }),
    );
  });

  it("select second with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]" class="second">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: true }),
    );
  });

  it("select second with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_second" name="date[second]" class="my-second">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectSecond(Time.mktime(2003, 8, 16, 8, 4, 18), { withCssClasses: { second: "my-second" } }),
    );
  });

  let view: Base & Record<string, any>;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as Base &
      Record<string, any>;
  });

  it("date select", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    const expected = dateSelects("written_on", 2004, 6, 15);

    assertDomEqual(expected, view.dateSelect("post", "written_on"));
  });

  it("date select within fields for", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) =>
      (view as any).concat(f.dateSelect("written_on")),
    );
    const expected = dateSelects("written_on", 2004, 6, 15);

    assertDomEqual(expected, outputBuffer);
  });

  it("time select", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;
    expected += timeSelects("written_on", 15, 16);

    assertDomEqual(expected, view.timeSelect("post", "written_on"));
  });

  it("datetime select", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);

    let expected = dateSelects("updated_at", 2004, 6, 15);
    expected += " &mdash; ";
    expected += timeSelects("updated_at", 16, 35);

    assertDomEqual(expected, view.datetimeSelect("post", "updated_at"));
  });

  it("date select with selected", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7" selected="selected">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10" selected="selected">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { selected: new RubyDate(2004, 7, 10) }),
    );
  });

  it("date select with selected in hash", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7" selected="selected">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10" selected="selected">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { selected: { day: 10, month: 7, year: 2004 } }),
    );
  });

  it("date select with selected nil", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected =
      '<input id="post_written_on_1i" name="post[written_on(1i)]" type="hidden" value="1" autocomplete="off"/>' +
      `\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="" label=" "></option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="" label=" "></option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, {
        includeBlank: true,
        discardYear: true,
        selected: null,
      }),
    );
  });

  it("date select without day", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { order: ["month", "year"] }));
  });

  it("date select without day and month", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 2, 29);

    let expected = `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="2" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { order: ["year"] }));
  });

  it("date select without day with separator", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `/`;

    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { dateSeparator: `/`, order: ["month", "year"] }),
    );
  });

  it("date select without day and with disabled html option", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<input type="hidden" id="post_written_on_3i" disabled="disabled" name="post[written_on(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_2i" disabled="disabled" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_1i" disabled="disabled" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { order: ["month", "year"] }, { disabled: true }),
    );
  });

  it("date select within fields for with index", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);
    const id = 27;

    const outputBuffer = view.fieldsFor("post", view.post, { index: id }, (f: any) =>
      (view as any).concat(f.dateSelect("written_on")),
    );

    let expected = `<select id="post_${id}_written_on_1i" name="post[${id}][written_on(1i)]">\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n</select>\n`;
    expected += `<select id="post_${id}_written_on_2i" name="post[${id}][written_on(2i)]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option selected="selected" value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n`;
    expected += `<select id="post_${id}_written_on_3i" name="post[${id}][written_on(3i)]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option selected="selected" value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("date select within fields for with blank index", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);
    const id = null;

    const outputBuffer = view.fieldsFor("post", view.post, { index: id }, (f: any) =>
      (view as any).concat(f.dateSelect("written_on")),
    );

    let expected = `<select id="post_${id}_written_on_1i" name="post[${id}][written_on(1i)]">\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n</select>\n`;
    expected += `<select id="post_${id}_written_on_2i" name="post[${id}][written_on(2i)]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option selected="selected" value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n`;
    expected += `<select id="post_${id}_written_on_3i" name="post[${id}][written_on(3i)]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option selected="selected" value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("date select with index", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);
    const id = 456;

    let expected = `<select id="post_456_written_on_1i" name="post[${id}][written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_written_on_2i" name="post[${id}][written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_written_on_3i" name="post[${id}][written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { index: id }));
  });

  it("date select with auto index", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);
    const id = 123;

    let expected = `<select id="post_123_written_on_1i" name="post[${id}][written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_123_written_on_2i" name="post[${id}][written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_123_written_on_3i" name="post[${id}][written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post[]`, `written_on`));
  });

  it("date select with different order", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { order: ["day", "month", "year"] }),
    );
  });

  it("date select with nil and blank", () => {
    view.post = new Post();

    const startYear = Time.now().year - 5;
    const endYear = Time.now().year + 5;
    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(startYear, endYear)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}">${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { includeBlank: true }));
  });

  it("date select with nil and blank and order", () => {
    view.post = new Post();

    const startYear = Time.now().year - 5;
    const endYear = Time.now().year + 5;

    let expected =
      '<input name="post[written_on(3i)]" type="hidden" id="post_written_on_3i" value="1" autocomplete="off"/>' +
      `\n`;
    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(startYear, endYear)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}">${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { order: ["year", "month"], includeBlank: true }),
    );
  });

  it("date select with nil and blank and discard year", () => {
    view.post = new Post();

    let expected =
      '<input id="post_written_on_1i" name="post[written_on(1i)]" type="hidden" value="1" autocomplete="off" />' +
      `\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}">${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { discardYear: true, includeBlank: true }),
    );
  });

  it("date select cant override discard hour", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { discardHour: false }));
  });

  it("date select with html options", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="selector">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="selector">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="selector">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, {}, { class: `selector` }));
  });

  it("date select with html options within fields for", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) =>
      (view as any).concat(f.dateSelect("written_on", {}, { class: `selector` })),
    );

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="selector">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="selector">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="selector">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("date select with separator", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { dateSeparator: ` / ` }));
  });

  it("date select with separator and order", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, {
        order: ["day", "month", "year"],
        dateSeparator: ` / `,
      }),
    );
  });

  it("date select with separator and order and year discarded", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;
    expected += `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, {
        order: ["day", "month", "year"],
        discardYear: true,
        dateSeparator: ` / `,
      }),
    );
  });

  it("date select with default prompt", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="">Year</option>\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="">Month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="">Day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { prompt: true }));
  });

  it("date select with custom prompt", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="">Choose year</option>\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    expected += `<option value="">Choose month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    expected += `<option value="">Choose day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, {
        prompt: { year: `Choose year`, month: `Choose month`, day: `Choose day` },
      }),
    );
  });

  it("date select with generic with css classes", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="year">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="month">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="day">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`, { withCssClasses: true }));
  });

  it("date select with custom with css classes", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="my-year">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="my-month">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="my-day">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;

    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, {
        withCssClasses: { year: `my-year`, month: `my-month`, day: `my-day` },
      }),
    );
  });

  it("time select with selected", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 12 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 20 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.timeSelect(`post`, `written_on`, { selected: Time.local(2004, 6, 15, 12, 20, 30) }),
    );
  });

  it("time select with selected nil", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="1" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="1" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}">${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}">${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.timeSelect(`post`, `written_on`, {
        discardYear: true,
        discardMonth: true,
        discardDay: true,
        selected: null,
      }),
    );
  });

  it("time select without date hidden fields", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, { ignoreDate: true }));
  });

  it("time select with seconds", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_6i" name="post[written_on(6i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 35 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, { includeSeconds: true }));
  });

  it("time select with html options", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="selector">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="selector">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, {}, { class: `selector` }));
  });

  it("time select with html options within fields for", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) =>
      (view as any).concat(f.timeSelect("written_on", {}, { class: `selector` })),
    );

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="selector">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="selector">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("time select with separator", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` - `;

    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` - `;

    expected += `<select id="post_written_on_6i" name="post[written_on(6i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 35 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.timeSelect(`post`, `written_on`, { timeSeparator: ` - `, includeSeconds: true }),
    );
  });

  it("time select with default prompt", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    expected += `<option value="">Hour</option>\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    expected += `<option value="">Minute</option>\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, { prompt: true }));
  });

  it("time select with custom prompt", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]">\n`;
    expected += `<option value="">Choose hour</option>\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]">\n`;
    expected += `<option value="">Choose minute</option>\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.timeSelect(`post`, `written_on`, {
        prompt: { hour: `Choose hour`, minute: `Choose minute` },
      }),
    );
  });

  it("time select with generic with css classes", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="hour">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` : `;

    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="minute">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, { withCssClasses: true }));
  });

  it("time select with custom with css classes", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="my-hour">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` : `;

    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="my-minute">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.timeSelect(`post`, `written_on`, {
        withCssClasses: { hour: `my-hour`, minute: `my-minute` },
      }),
    );
  });

  it("time select with disabled html option", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_written_on_1i" disabled="disabled" name="post[written_on(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_2i" disabled="disabled" name="post[written_on(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_written_on_3i" disabled="disabled" name="post[written_on(3i)]" value="15" autocomplete="off" />\n`;

    expected += `<select id="post_written_on_4i" disabled="disabled" name="post[written_on(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" disabled="disabled" name="post[written_on(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.timeSelect(`post`, `written_on`, {}, { disabled: true }));
  });

  it("datetime select with selected", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3" selected="selected">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10" selected="selected">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12" selected="selected">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30" selected="selected">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { selected: Time.local(2004, 3, 10, 12, 30) }),
    );
  });

  it("datetime select with selected nil", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);

    let expected =
      '<input id="post_updated_at_1i" name="post[updated_at(1i)]" type="hidden" value="1" autocomplete="off" />' +
      `\n`;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { discardYear: true, selected: null }),
    );
  });

  it("datetime select with html options within fields for", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) =>
      (view as any).concat(f.datetimeSelect("updated_at", {}, { class: `selector` })),
    );

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]" class="selector">\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]" class="selector">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option selected="selected" value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option selected="selected" value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`;
    expected += ` &mdash; <select id="post_updated_at_4i" name="post[updated_at(4i)]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option selected="selected" value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n`;
    expected += ` : <select id="post_updated_at_5i" name="post[updated_at(5i)]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option selected="selected" value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("datetime select with separators", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += ` / `;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` , `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` - `;

    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` - `;

    expected += `<select id="post_updated_at_6i" name="post[updated_at(6i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 35 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, {
        dateSeparator: ` / `,
        datetimeSeparator: ` , `,
        timeSeparator: ` - `,
        includeSeconds: true,
      }),
    );
  });

  it("datetime select with default prompt", () => {
    view.post = new Post();
    view.post.updated_at = null;

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    expected += `<option value="">Year</option>\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="">Month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="">Day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    expected += `<option value="">Hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    expected += `<option value="">Minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { startYear: 1999, endYear: 2009, prompt: true }),
    );
  });

  it("datetime select with custom prompt", () => {
    view.post = new Post();
    view.post.updated_at = null;

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    expected += `<option value="">Choose year</option>\n<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="">Choose month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="">Choose day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    expected += `<option value="">Choose hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    expected += `<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, {
        startYear: 1999,
        endYear: 2009,
        prompt: {
          year: `Choose year`,
          month: `Choose month`,
          day: `Choose day`,
          hour: `Choose hour`,
          minute: `Choose minute`,
        },
      }),
    );
  });

  it("datetime select with generic with css classes", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="year">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="month">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="day">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="hour">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="minute">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `written_on`, {
        startYear: 1999,
        endYear: 2009,
        withCssClasses: true,
      }),
    );
  });

  it("datetime select with custom with css classes", () => {
    view.post = new Post();
    view.post.written_on = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]" class="my-year">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]" class="my-month">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]" class="my-day">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_written_on_4i" name="post[written_on(4i)]" class="my-hour">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_written_on_5i" name="post[written_on(5i)]" class="my-minute">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `written_on`, {
        startYear: 1999,
        endYear: 2009,
        withCssClasses: {
          year: `my-year`,
          month: `my-month`,
          day: `my-day`,
          hour: `my-hour`,
          minute: `my-minute`,
        },
      }),
    );
  });

  it("date select with zero value and no start year", () => {
    let expected = `<select id="date_first_year" name="date[first][year]">\n`;
    for (const y of upto(RubyDate.today().year - 5, RubyDate.today().year + 1)) {
      expected += `<option value="${y}">${y}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="date_first_month" name="date[first][month]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="date_first_day" name="date[first][day]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.selectDate(0, { endYear: RubyDate.today().year + 1, prefix: `date[first]` }),
    );
  });

  it("date select with zero value and no end year", () => {
    let expected = `<select id="date_first_year" name="date[first][year]">\n`;
    const lastYear = Time.now().year + 5;
    for (const y of upto(2003, lastYear)) {
      expected += `<option value="${y}">${y}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="date_first_month" name="date[first][month]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="date_first_day" name="date[first][day]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.selectDate(0, { startYear: 2003, prefix: `date[first]` }));
  });

  it("date select with zero value and no start and end year", () => {
    let expected = `<select id="date_first_year" name="date[first][year]">\n`;
    for (const y of upto(RubyDate.today().year - 5, RubyDate.today().year + 5)) {
      expected += `<option value="${y}">${y}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="date_first_month" name="date[first][month]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="date_first_day" name="date[first][day]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.selectDate(0, { prefix: `date[first]` }));
  });

  it("date select with nil value and no start and end year", () => {
    let expected = `<select id="date_first_year" name="date[first][year]">\n`;
    for (const y of upto(RubyDate.today().year - 5, RubyDate.today().year + 5)) {
      expected += `<option value="${y}">${y}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="date_first_month" name="date[first][month]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="date_first_day" name="date[first][day]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.selectDate(null, { prefix: `date[first]` }));
  });

  it("datetime select with nil value and no start and end year", () => {
    let expected = `<select id="date_first_year" name="date[first][year]">\n`;
    for (const y of upto(RubyDate.today().year - 5, RubyDate.today().year + 5)) {
      expected += `<option value="${y}">${y}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="date_first_month" name="date[first][month]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="date_first_day" name="date[first][day]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="date_first_hour" name="date[first][hour]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;

    expected += ` : `;

    expected += `<select id="date_first_minute" name="date[first][minute]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.selectDatetime(null, { prefix: `date[first]` }));
  });

  it("datetime select with options index", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);
    const id = 456;

    let expected = `<select id="post_456_updated_at_1i" name="post[${id}][updated_at(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_updated_at_2i" name="post[${id}][updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_updated_at_3i" name="post[${id}][updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_456_updated_at_4i" name="post[${id}][updated_at(4i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_456_updated_at_5i" name="post[${id}][updated_at(5i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35" selected="selected">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { index: id }));
  });

  it("datetime select within fields for with options index", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);
    const id = 456;

    const outputBuffer = view.fieldsFor("post", view.post, { index: id }, (f: any) =>
      (view as any).concat(f.datetimeSelect("updated_at")),
    );

    let expected = `<select id="post_456_updated_at_1i" name="post[${id}][updated_at(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_updated_at_2i" name="post[${id}][updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_456_updated_at_3i" name="post[${id}][updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_456_updated_at_4i" name="post[${id}][updated_at(4i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_456_updated_at_5i" name="post[${id}][updated_at(5i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35" selected="selected">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, outputBuffer);
  });

  it("datetime select with auto index", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);
    const id = view.post.id;

    let expected = `<select id="post_123_updated_at_1i" name="post[${id}][updated_at(1i)]">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_123_updated_at_2i" name="post[${id}][updated_at(2i)]">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_123_updated_at_3i" name="post[${id}][updated_at(3i)]">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_123_updated_at_4i" name="post[${id}][updated_at(4i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_123_updated_at_5i" name="post[${id}][updated_at(5i)]">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35" selected="selected">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post[]`, `updated_at`));
  });

  it("datetime select with seconds", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_6i" name="post[updated_at(6i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 35 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { includeSeconds: true }));
  });

  it("datetime select discard year", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_updated_at_1i" name="post[updated_at(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { discardYear: true }));
  });

  it("datetime select discard month", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<input type="hidden" id="post_updated_at_2i" name="post[updated_at(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_updated_at_3i" name="post[updated_at(3i)]" value="1" autocomplete="off" />\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { discardMonth: true }));
  });

  it("datetime select discard year and month", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_updated_at_1i" name="post[updated_at(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_updated_at_2i" name="post[updated_at(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_updated_at_3i" name="post[updated_at(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { discardYear: true, discardMonth: true }),
    );
  });

  it("datetime select discard year and month with disabled html option", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_updated_at_1i" disabled="disabled" name="post[updated_at(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_updated_at_2i" disabled="disabled" name="post[updated_at(2i)]" value="6" autocomplete="off" />\n`;
    expected += `<input type="hidden" id="post_updated_at_3i" disabled="disabled" name="post[updated_at(3i)]" value="1" autocomplete="off" />\n`;

    expected += `<select id="post_updated_at_4i" disabled="disabled" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" disabled="disabled" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(
        `post`,
        `updated_at`,
        { discardYear: true, discardMonth: true },
        { disabled: true },
      ),
    );
  });

  it("datetime select discard hour", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { discardHour: true }));
  });

  it("datetime select discard minute", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<input type="hidden" id="post_updated_at_5i" name="post[updated_at(5i)]" value="16" autocomplete="off" />\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, { discardMinute: true }));
  });

  it("datetime select disabled and discard minute", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" disabled="disabled" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" disabled="disabled" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" disabled="disabled" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" disabled="disabled" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<input type="hidden" id="post_updated_at_5i" disabled="disabled" name="post[updated_at(5i)]" value="16" autocomplete="off" />\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { discardMinute: true, disabled: true }),
    );
  });

  it("datetime select invalid order", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(1999, 2009)) {
      expected += `<option value="${i}"${i === 2004 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, {
        order: ["minute", "day", "hour", "month", "year", "second"],
      }),
    );
  });

  it("datetime select discard with order", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 15, 16, 35);

    let expected = `<input type="hidden" id="post_updated_at_1i" name="post[updated_at(1i)]" value="2004" autocomplete="off" />\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 15 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 6 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { order: ["day", "month"] }),
    );
  });

  it("datetime select with default value as time", () => {
    view.post = new Post();
    view.post.updated_at = null;

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(2001, 2011)) {
      expected += `<option value="${i}"${i === 2006 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 9 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === 19 ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 15 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 16 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { default: Time.local(2006, 9, 19, 15, 16, 35) }),
    );
  });

  it("include blank overrides default option", () => {
    view.post = new Post();
    view.post.updated_at = null;

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(Time.now().year - 5, Time.now().year + 5)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}">${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `updated_at`, {
        default: Time.local(2006, 9, 19, 15, 16, 35),
        includeBlank: true,
      }),
    );
  });

  it("datetime select with html options", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2004, 6, 15, 16, 35);

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]" class="selector">\n`;
    expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]" class="selector">\n`;
    expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
    expected += `</select>\n`;

    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]" class="selector">\n`;
    expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]" class="selector">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]" class="selector">\n`;
    expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35" selected="selected">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
    expected += `</select>\n`;

    assertDomEqual(expected, view.datetimeSelect(`post`, `updated_at`, {}, { class: `selector` }));
  });

  it("date select with nil", () => {
    view.post = new Post();

    const startYear = Time.now().year - 5;
    const endYear = Time.now().year + 5;
    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    for (const i of upto(startYear, endYear)) {
      expected += `<option value="${i}"${i === Time.now().year ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_2i" name="post[written_on(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === Time.now().month ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;

    expected += `<select id="post_written_on_3i" name="post[written_on(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === Time.now().day ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(expected, view.dateSelect(`post`, `written_on`));
  });

  it("date select with nil and blank and discard month", () => {
    view.post = new Post();

    const startYear = Time.now().year - 5;
    const endYear = Time.now().year + 5;

    let expected = `<select id="post_written_on_1i" name="post[written_on(1i)]">\n`;
    expected += `<option value="" label=" "></option>\n`;
    for (const i of upto(startYear, endYear)) {
      expected += `<option value="${i}">${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected +=
      '<input name="post[written_on(2i)]" type="hidden" id="post_written_on_2i" value="1" autocomplete="off"/>' +
      `\n`;
    expected +=
      '<input name="post[written_on(3i)]" type="hidden" id="post_written_on_3i" value="1" autocomplete="off"/>' +
      `\n`;

    assertDomEqual(
      expected,
      view.dateSelect(`post`, `written_on`, { discardMonth: true, includeBlank: true }),
    );
  });

  it("datetime select with default value as hash", () => {
    view.post = new Post();
    view.post.updated_at = null;

    let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
    for (const i of upto(Time.now().year - 5, Time.now().year + 5)) {
      expected += `<option value="${i}"${i === Time.now().year ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
    for (const i of upto(1, 12)) {
      expected += `<option value="${i}"${i === 10 ? ' selected="selected"' : ""}>${RubyDate.MONTHNAMES[i]}</option>\n`;
    }
    expected += `</select>\n`;
    expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
    for (const i of upto(1, 31)) {
      expected += `<option value="${i}"${i === Time.now().day ? ' selected="selected"' : ""}>${i}</option>\n`;
    }
    expected += `</select>\n`;

    expected += ` &mdash; `;

    expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
    for (const i of upto(0, 23)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 9 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;
    expected += ` : `;
    expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
    for (const i of upto(0, 59)) {
      expected += `<option value="${sprintf("%02d", i)}"${i === 42 ? ' selected="selected"' : ""}>${sprintf("%02d", i)}</option>\n`;
    }
    expected += `</select>\n`;

    assertDomEqual(
      expected,
      view.datetimeSelect(`post`, `updated_at`, { default: { month: 10, minute: 42, hour: 9 } }),
    );
  });

  it("datetime select defaults to time zone now when config time zone is set", () => {
    const mytz = class extends TimeZone {
      nowValue: unknown = null;
      override now(): any {
        return this.nowValue;
      }
    }.create("tenderlove", 0, TimeZone.findTzinfo("UTC"));

    const now = Time.mktime(2004, 6, 15, 16, 35, 0);
    mytz.nowValue = now;
    setZone(mytz);
    try {
      expect(zone()).toBe(mytz);

      view.post = new Post();

      let expected = `<select id="post_updated_at_1i" name="post[updated_at(1i)]">\n`;
      expected += `<option value="1999">1999</option>\n<option value="2000">2000</option>\n<option value="2001">2001</option>\n<option value="2002">2002</option>\n<option value="2003">2003</option>\n<option value="2004" selected="selected">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n`;
      expected += `</select>\n`;
      expected += `<select id="post_updated_at_2i" name="post[updated_at(2i)]">\n`;
      expected += `<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6" selected="selected">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n`;
      expected += `</select>\n`;
      expected += `<select id="post_updated_at_3i" name="post[updated_at(3i)]">\n`;
      expected += `<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15" selected="selected">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n`;
      expected += `</select>\n`;
      expected += ` &mdash; `;
      expected += `<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n`;
      expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n`;
      expected += `</select>\n`;
      expected += ` : `;
      expected += `<select id="post_updated_at_5i" name="post[updated_at(5i)]">\n`;
      expected += `<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35" selected="selected">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n`;
      expected += `</select>\n`;

      assertDomEqual(expected, view.datetimeSelect("post", "updated_at"));
    } finally {
      setZone(null);
    }
  });

  it("datetime select with integer", () => {
    view.post = new Post();
    view.post.updated_at = 3;
    expect(() => view.datetimeSelect("post", "updated_at")).not.toThrow();
  });

  it("datetime select with infinity", () => {
    view.post = new Post();
    view.post.updated_at = -1.0 / 0;
    expect(() => view.datetimeSelect("post", "updated_at")).not.toThrow();
  });

  it("date select should not change passed options hash", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2008, 7, 16, 23, 30);

    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    view.dateSelect(view.post, "updated_at", options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("datetime select should not change passed options hash", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2008, 7, 16, 23, 30);

    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    view.datetimeSelect(view.post, "updated_at", options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("time select should not change passed options hash", () => {
    view.post = new Post();
    view.post.updated_at = Time.local(2008, 7, 16, 23, 30);

    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    view.timeSelect(view.post, "updated_at", options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("select date should not change passed options hash", () => {
    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    selectDate.call(view, RubyDate.today(), options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("select datetime should not change passed options hash", () => {
    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    selectDatetime.call(view, Time.now(), options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("select time should not change passed options hash", () => {
    const options = {
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    };
    selectTime.call(view, Time.now(), options);

    expect(options).toEqual({
      order: ["year", "month", "day"],
      default: { year: 2008, month: 7, day: 16, hour: 23, minute: 30, second: 1 },
      discardType: false,
      includeBlank: false,
      ignoreDate: false,
      includeSeconds: true,
    });
  });

  it("select date", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
    );
  });

  it("select date with too big range between start year and end year", () => {
    expect(() =>
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2000,
        endYear: 20000,
        prefix: "date[first]",
        order: ["month", "day", "year"],
      }),
    ).toThrow(ArgumentError);
    expect(() =>
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 100,
        endYear: 2000,
        prefix: "date[first]",
        order: ["month", "day", "year"],
      }),
    ).toThrow(ArgumentError);
  });

  it("select date can have more then 1000 years interval if forced via parameter", () => {
    expect(() =>
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2000,
        endYear: 3100,
        maxYearsAllowed: 2000,
      }),
    ).not.toThrow();
  });

  it("select date with incomplete order", () => {
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off" />\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="1" autocomplete="off" />\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        order: ["day"],
      }),
    );
  });

  it("select date with disabled", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" disabled="disabled">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]" disabled="disabled">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]" disabled="disabled">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        disabled: true,
      }),
    );
  });

  it("select date with no start year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}" selected="selected">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`,
      selectDate(Time.mktime(year, 8, 16), { endYear: year + 1, prefix: "date[first]" }),
    );
  });

  it("select date with no end year", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), { startYear: 2003, prefix: "date[first]" }),
    );
  });

  it("select date with no start or end year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}" selected="selected">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n<option value="${year + 2}">${year + 2}</option>\n<option value="${year + 3}">${year + 3}</option>\n<option value="${year + 4}">${year + 4}</option>\n<option value="${year + 5}">${year + 5}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`,
      selectDate(Time.mktime(year, 8, 16), { prefix: "date[first]" }),
    );
  });

  it("select date with zero value", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(0, { startYear: 2003, endYear: 2005, prefix: "date[first]" }),
    );
  });

  it("select date with zero value and no start year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`,
      selectDate(0, { endYear: year + 1, prefix: "date[first]" }),
    );
  });

  it("select date with zero value and no end year", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n<option value="2006">2006</option>\n<option value="2007">2007</option>\n<option value="2008">2008</option>\n<option value="2009">2009</option>\n<option value="2010">2010</option>\n<option value="2011">2011</option>\n<option value="2012">2012</option>\n<option value="2013">2013</option>\n<option value="2014">2014</option>\n<option value="2015">2015</option>\n<option value="2016">2016</option>\n<option value="2017">2017</option>\n<option value="2018">2018</option>\n<option value="2019">2019</option>\n<option value="2020">2020</option>\n<option value="2021">2021</option>\n<option value="2022">2022</option>\n<option value="2023">2023</option>\n<option value="2024">2024</option>\n<option value="2025">2025</option>\n<option value="2026">2026</option>\n<option value="2027">2027</option>\n<option value="2028">2028</option>\n<option value="2029">2029</option>\n<option value="2030">2030</option>\n<option value="2031">2031</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(0, { startYear: 2003, prefix: "date[first]" }),
    );
  });

  it("select date with zero value and no start and end year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n<option value="${year + 2}">${year + 2}</option>\n<option value="${year + 3}">${year + 3}</option>\n<option value="${year + 4}">${year + 4}</option>\n<option value="${year + 5}">${year + 5}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`,
      selectDate(0, { prefix: "date[first]" }),
    );
  });

  it("select date with nil value and no start and end year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n<option value="${year + 2}">${year + 2}</option>\n<option value="${year + 3}">${year + 3}</option>\n<option value="${year + 4}">${year + 4}</option>\n<option value="${year + 5}">${year + 5}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n`,
      selectDate(null, { prefix: "date[first]" }),
    );
  });

  it("select date with html options", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" class="selector">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]" class="selector">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(
        Time.mktime(2003, 8, 16),
        { startYear: 2003, endYear: 2005, prefix: "date[first]" },
        { class: "selector" },
      ),
    );
  });

  it("select date with separator", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n / <select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n / <select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        dateSeparator: " / ",
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
    );
  });

  it("select date with separator and discard day", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n / <select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<input type="hidden" id="date_first_day" name="date[first][day]" value="1" autocomplete="off" />\n',
      selectDate(Time.mktime(2003, 8, 16), {
        dateSeparator: " / ",
        discardDay: true,
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
    );
  });

  it("select date with separator discard month and day", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<input type="hidden" id="date_first_month" name="date[first][month]" value="8" autocomplete="off" />\n<input type="hidden" id="date_first_day" name="date[first][day]" value="1" autocomplete="off" />\n',
      selectDate(Time.mktime(2003, 8, 16), {
        dateSeparator: " / ",
        discardMonth: true,
        discardDay: true,
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
    );
  });

  it("select date with hidden", () => {
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off"/>\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n',
      selectDate(Time.mktime(2003, 8, 16), { prefix: "date[first]", useHidden: true }),
    );
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off"/>\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n',
      selectDate(Time.mktime(2003, 8, 16), {
        dateSeparator: " / ",
        prefix: "date[first]",
        useHidden: true,
      }),
    );
  });

  it("select date with css classes option", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" class="year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]" class="month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]" class="day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        withCssClasses: true,
      }),
    );
  });

  it("select date with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="my-year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="my-month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="my-day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(Time.mktime(2003, 8, 16), {
        startYear: 2003,
        endYear: 2005,
        withCssClasses: { year: "my-year", month: "my-month", day: "my-day" },
      }),
    );
  });

  it("select date with css classes option and html class option", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" class="datetime optional year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]" class="datetime optional month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]" class="datetime optional day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(
        Time.mktime(2003, 8, 16),
        { startYear: 2003, endYear: 2005, prefix: "date[first]", withCssClasses: true },
        { class: "datetime optional" },
      ),
    );
  });

  it("select date with custom with css classes and html class option", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="date optional my-year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="date optional my-month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="date optional my-day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(
        Time.mktime(2003, 8, 16),
        {
          startYear: 2003,
          endYear: 2005,
          withCssClasses: { year: "my-year", month: "my-month", day: "my-day" },
        },
        { class: "date optional" },
      ),
    );
  });

  it("select date with partial with css classes and html class option", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="date optional">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="date optional my-month custom-grid">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="date optional">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(
        Time.mktime(2003, 8, 16),
        { startYear: 2003, endYear: 2005, withCssClasses: { month: "my-month custom-grid" } },
        { class: "date optional" },
      ),
    );
  });

  it("select date with html class option", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="date optional custom-grid">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="date optional custom-grid">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="date optional custom-grid">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n',
      selectDate(
        Time.mktime(2003, 8, 16),
        { startYear: 2003, endYear: 2005 },
        { class: "date optional custom-grid" },
      ),
    );
  });

  it("select datetime", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
    );
  });

  it("select datetime with ampm", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="00">12 AM</option>\n<option value="01">01 AM</option>\n<option value="02">02 AM</option>\n<option value="03">03 AM</option>\n<option value="04">04 AM</option>\n<option value="05">05 AM</option>\n<option value="06">06 AM</option>\n<option value="07">07 AM</option>\n<option value="08" selected="selected">08 AM</option>\n<option value="09">09 AM</option>\n<option value="10">10 AM</option>\n<option value="11">11 AM</option>\n<option value="12">12 PM</option>\n<option value="13">01 PM</option>\n<option value="14">02 PM</option>\n<option value="15">03 PM</option>\n<option value="16">04 PM</option>\n<option value="17">05 PM</option>\n<option value="18">06 PM</option>\n<option value="19">07 PM</option>\n<option value="20">08 PM</option>\n<option value="21">09 PM</option>\n<option value="22">10 PM</option>\n<option value="23">11 PM</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        ampm: true,
      }),
    );
  });

  it("select datetime with separators", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        datetimeSeparator: " &mdash; ",
        timeSeparator: " : ",
      }),
    );
  });

  it("select datetime with nil value and no start and end year", () => {
    const year = RubyDate.today().year;
    assertDomEqual(
      `<select id="date_first_year" name="date[first][year]">\n<option value="${year - 5}">${year - 5}</option>\n<option value="${year - 4}">${year - 4}</option>\n<option value="${year - 3}">${year - 3}</option>\n<option value="${year - 2}">${year - 2}</option>\n<option value="${year - 1}">${year - 1}</option>\n<option value="${year}">${year}</option>\n<option value="${year + 1}">${year + 1}</option>\n<option value="${year + 2}">${year + 2}</option>\n<option value="${year + 3}">${year + 3}</option>\n<option value="${year + 4}">${year + 4}</option>\n<option value="${year + 5}">${year + 5}</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n`,
      selectDatetime(null, { prefix: "date[first]" }),
    );
  });

  it("select datetime with html options", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" class="selector">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]" class="selector">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(
        Time.mktime(2003, 8, 16, 8, 4, 18),
        { startYear: 2003, endYear: 2005, prefix: "date[first]" },
        { class: "selector" },
      ),
    );
  });

  it("select datetime with all separators", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]" class="selector">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n/<select id="date_first_month" name="date[first][month]" class="selector">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n/<select id="date_first_day" name="date[first][day]" class="selector">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n&mdash;<select id="date_first_hour" name="date[first][hour]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n:<select id="date_first_minute" name="date[first][minute]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(
        Time.mktime(2003, 8, 16, 8, 4, 18),
        {
          datetimeSeparator: "&mdash;",
          dateSeparator: "/",
          timeSeparator: ":",
          startYear: 2003,
          endYear: 2005,
          prefix: "date[first]",
        },
        { class: "selector" },
      ),
    );
  });

  it("select datetime should work with date", () => {
    expect(() => selectDatetime(RubyDate.today())).not.toThrow();
  });

  it("select datetime with default prompt", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="">Year</option>\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="">Month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="">Day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="">Hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="">Minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        prompt: true,
      }),
    );
  });

  it("select datetime with custom prompt", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="">Choose year</option>\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="">Choose month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="">Choose day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="">Choose hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
        prompt: {
          day: "Choose day",
          month: "Choose month",
          year: "Choose year",
          hour: "Choose hour",
          minute: "Choose minute",
        },
      }),
    );
  });

  it("select datetime with generic with css classes", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_hour" name="date[hour]" class="hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        withCssClasses: true,
      }),
    );
  });

  it("select datetime with custom with css classes", () => {
    assertDomEqual(
      '<select id="date_year" name="date[year]" class="my-year">\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_month" name="date[month]" class="my-month">\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_day" name="date[day]" class="my-day">\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_hour" name="date[hour]" class="my-hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="my-minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        withCssClasses: {
          day: "my-day",
          month: "my-month",
          year: "my-year",
          hour: "my-hour",
          minute: "my-minute",
        },
      }),
    );
  });

  it("select datetime with custom hours", () => {
    assertDomEqual(
      '<select id="date_first_year" name="date[first][year]">\n<option value="">Choose year</option>\n<option value="2003" selected="selected">2003</option>\n<option value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<select id="date_first_month" name="date[first][month]">\n<option value="">Choose month</option>\n<option value="1">January</option>\n<option value="2">February</option>\n<option value="3">March</option>\n<option value="4">April</option>\n<option value="5">May</option>\n<option value="6">June</option>\n<option value="7">July</option>\n<option value="8" selected="selected">August</option>\n<option value="9">September</option>\n<option value="10">October</option>\n<option value="11">November</option>\n<option value="12">December</option>\n</select>\n<select id="date_first_day" name="date[first][day]">\n<option value="">Choose day</option>\n<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>\n<option value="4">4</option>\n<option value="5">5</option>\n<option value="6">6</option>\n<option value="7">7</option>\n<option value="8">8</option>\n<option value="9">9</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16" selected="selected">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n</select>\n &mdash; <select id="date_first_hour" name="date[first][hour]">\n<option value="">Choose hour</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n</select>\n : <select id="date_first_minute" name="date[first][minute]">\n<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        startYear: 2003,
        endYear: 2005,
        startHour: 1,
        endHour: 9,
        prefix: "date[first]",
        prompt: {
          day: "Choose day",
          month: "Choose month",
          year: "Choose year",
          hour: "Choose hour",
          minute: "Choose minute",
        },
      }),
    );
  });

  it("select datetime with hidden", () => {
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off" />\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n<input id="date_first_hour" name="date[first][hour]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_minute" name="date[first][minute]" type="hidden" value="4" autocomplete="off" />\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        prefix: "date[first]",
        useHidden: true,
      }),
    );
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off" />\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n<input id="date_first_hour" name="date[first][hour]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_minute" name="date[first][minute]" type="hidden" value="4" autocomplete="off" />\n',
      selectDatetime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        datetimeSeparator: "&mdash;",
        dateSeparator: "/",
        timeSeparator: ":",
        prefix: "date[first]",
        useHidden: true,
      }),
    );
  });

  it("select time", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18)),
    );
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { includeSeconds: false }),
    );
  });

  it("select time with ampm", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">12 AM</option>\n<option value="01">01 AM</option>\n<option value="02">02 AM</option>\n<option value="03">03 AM</option>\n<option value="04">04 AM</option>\n<option value="05">05 AM</option>\n<option value="06">06 AM</option>\n<option value="07">07 AM</option>\n<option value="08" selected="selected">08 AM</option>\n<option value="09">09 AM</option>\n<option value="10">10 AM</option>\n<option value="11">11 AM</option>\n<option value="12">12 PM</option>\n<option value="13">01 PM</option>\n<option value="14">02 PM</option>\n<option value="15">03 PM</option>\n<option value="16">04 PM</option>\n<option value="17">05 PM</option>\n<option value="18">06 PM</option>\n<option value="19">07 PM</option>\n<option value="20">08 PM</option>\n<option value="21">09 PM</option>\n<option value="22">10 PM</option>\n<option value="23">11 PM</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { includeSeconds: false, ampm: true }),
    );
  });

  it("select time with separator", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { timeSeparator: " : " }),
    );
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        timeSeparator: " : ",
        includeSeconds: false,
      }),
    );
  });

  it("select time with seconds", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { includeSeconds: true }),
    );
  });

  it("select time with seconds and separator", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        timeSeparator: " : ",
      }),
    );
  });

  it("select time with html options", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {}, { class: "selector" }),
    );
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="selector">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(
        Time.mktime(2003, 8, 16, 8, 4, 18),
        { includeSeconds: false },
        { class: "selector" },
      ),
    );
  });

  it("select time should work with date", () => {
    expect(() => selectTime(RubyDate.today())).not.toThrow();
  });

  it("select time with default prompt", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="">Hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="">Minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]">\n<option value="">Seconds</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { includeSeconds: true, prompt: true }),
    );
  });

  it("select time with custom prompt", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="">Choose hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]">\n<option value="">Choose seconds</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        prompt: { hour: "Choose hour", minute: "Choose minute", second: "Choose seconds" },
      }),
    );
  });

  it("select time with generic with css classes", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]" class="hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]" class="second">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        withCssClasses: true,
      }),
    );
  });

  it("select time with a single default prompt", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]">\n<option value="">Hour</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]">\n<option value="">Choose minute</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]">\n<option value="">Choose seconds</option>\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        prompt: { hour: true, minute: "Choose minute", second: "Choose seconds" },
      }),
    );
  });

  it("select time with custom with css classes", () => {
    assertDomEqual(
      '<input name="date[year]" id="date_year" value="2003" type="hidden" autocomplete="off" />\n<input name="date[month]" id="date_month" value="8" type="hidden" autocomplete="off" />\n<input name="date[day]" id="date_day" value="16" type="hidden" autocomplete="off" />\n<select id="date_hour" name="date[hour]" class="my-hour">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08" selected="selected">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="date_minute" name="date[minute]" class="my-minute">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04" selected="selected">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n : <select id="date_second" name="date[second]" class="my-second">\n<option value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18" selected="selected">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n<option value="24">24</option>\n<option value="25">25</option>\n<option value="26">26</option>\n<option value="27">27</option>\n<option value="28">28</option>\n<option value="29">29</option>\n<option value="30">30</option>\n<option value="31">31</option>\n<option value="32">32</option>\n<option value="33">33</option>\n<option value="34">34</option>\n<option value="35">35</option>\n<option value="36">36</option>\n<option value="37">37</option>\n<option value="38">38</option>\n<option value="39">39</option>\n<option value="40">40</option>\n<option value="41">41</option>\n<option value="42">42</option>\n<option value="43">43</option>\n<option value="44">44</option>\n<option value="45">45</option>\n<option value="46">46</option>\n<option value="47">47</option>\n<option value="48">48</option>\n<option value="49">49</option>\n<option value="50">50</option>\n<option value="51">51</option>\n<option value="52">52</option>\n<option value="53">53</option>\n<option value="54">54</option>\n<option value="55">55</option>\n<option value="56">56</option>\n<option value="57">57</option>\n<option value="58">58</option>\n<option value="59">59</option>\n</select>\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        includeSeconds: true,
        withCssClasses: { hour: "my-hour", minute: "my-minute", second: "my-second" },
      }),
    );
  });

  it("select time with hidden", () => {
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off" />\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n<input id="date_first_hour" name="date[first][hour]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_minute" name="date[first][minute]" type="hidden" value="4" autocomplete="off" />\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), { prefix: "date[first]", useHidden: true }),
    );
    assertDomEqual(
      '<input id="date_first_year" name="date[first][year]" type="hidden" value="2003" autocomplete="off" />\n<input id="date_first_month" name="date[first][month]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_day" name="date[first][day]" type="hidden" value="16" autocomplete="off" />\n<input id="date_first_hour" name="date[first][hour]" type="hidden" value="8" autocomplete="off" />\n<input id="date_first_minute" name="date[first][minute]" type="hidden" value="4" autocomplete="off" />\n',
      selectTime(Time.mktime(2003, 8, 16, 8, 4, 18), {
        timeSeparator: ":",
        prefix: "date[first]",
        useHidden: true,
      }),
    );
  });

  it("select html safety", () => {
    assertPredicate(selectDay.call(view, 16), isHtmlSafe);
    assertPredicate(selectMonth.call(view, 8), isHtmlSafe);
    assertPredicate(selectYear.call(view, Time.mktime(2003, 8, 16, 8, 4, 18)), isHtmlSafe);
    assertPredicate(selectMinute.call(view, Time.mktime(2003, 8, 16, 8, 4, 18)), isHtmlSafe);
    assertPredicate(selectSecond.call(view, Time.mktime(2003, 8, 16, 8, 4, 18)), isHtmlSafe);

    assertPredicate(selectMinute.call(view, 8, { useHidden: true }), isHtmlSafe);
    assertPredicate(selectMonth.call(view, 8, { prompt: "Choose month" }), isHtmlSafe);

    assertPredicate(
      selectTime.call(view, Time.mktime(2003, 8, 16, 8, 4, 18), {}, { class: "selector" }),
      isHtmlSafe,
    );
    assertPredicate(
      selectDate.call(view, Time.mktime(2003, 8, 16), {
        dateSeparator: " / ",
        startYear: 2003,
        endYear: 2005,
        prefix: "date[first]",
      }),
      isHtmlSafe,
    );
  });

  it("object select html safety", () => {
    view.post = new Post();
    view.post.written_on = new RubyDate(2004, 6, 15);

    assertPredicate(
      view.dateSelect("post", "written_on", {
        default: Time.local(2006, 9, 19, 15, 16, 35),
        includeBlank: true,
      }),
      isHtmlSafe,
    );
  });

  it("time tag with date", () => {
    const date = new RubyDate(2013, 2, 20);
    const expected = '<time datetime="2013-02-20">February 20, 2013</time>';
    expect(String(view.timeTag(date))).toBe(expected);
  });

  it("time tag with time", () => {
    const time = Time.new(2013, 2, 20, 0, 0, 0, "+00:00");
    const expected = '<time datetime="2013-02-20T00:00:00+00:00">February 20, 2013 00:00</time>';
    expect(String(view.timeTag(time))).toBe(expected);
  });

  it("time tag with given text", () => {
    expect(String(view.timeTag(Time.now(), "Right now"))).toMatch(/<time.*>Right now<\/time>/);
  });

  it("time tag with given block", () => {
    expect(
      String(
        view.timeTag(
          Time.now(),
          block(() => view.raw("<span>Right now</span>")),
        ),
      ),
    ).toMatch(/<time.*><span>Right now<\/span><\/time>/);
  });

  it("time tag with different format", () => {
    const time = Time.new(2013, 2, 20, 0, 0, 0, "+00:00");
    const expected = '<time datetime="2013-02-20T00:00:00+00:00">20 Feb 00:00</time>';
    expect(String(view.timeTag(time, { format: ":short" }))).toBe(expected);
  });
});
