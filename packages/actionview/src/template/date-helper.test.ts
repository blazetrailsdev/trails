import { describe, expect, it } from "vitest";
import { dateCurrent } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
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
import { assertDomEqual } from "../testing/dom-assertions.js";

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
      selectYear(dateCurrent(), { includePosition: true, startYear: 2003, endYear: 2005 }),
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
});
