/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, expect, it } from "vitest";
import { Struct, block, sprintf } from "@blazetrails/ruby-compat";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { ordinalize, travelTo } from "@blazetrails/activesupport";
import {
  distanceOfTimeInWords,
  selectDay,
  selectDate,
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
