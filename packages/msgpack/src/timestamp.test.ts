import { beforeEach, describe, expect, it } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { Rational, rbEqual } from "@blazetrails/ruby-compat";
import { Factory, Time, Timestamp } from "./index.js";

const startWith = (prefix: Uint8Array) => (packed: Uint8Array) =>
  prefix.every((byte, i) => packed[i] === byte);

describe("MessagePack::Timestamp", () => {
  describe("register_type with Time", () => {
    let factory: Factory;
    beforeEach(() => {
      factory = new Factory();
      factory.registerType(Timestamp.TYPE, RubyTime, {
        packer: Time.Packer,
        unpacker: Time.Unpacker,
      });
    });

    it("serializes and deserializes Time", () => {
      const time = RubyTime.local(2019, 6, 17, 1, 2, 3, 123_456_789 / 1000.0);
      const prefixFixext8WithTypeId = Uint8Array.of(0xd7, 0xff);

      const packed = factory.pack(time);
      expect(packed).toSatisfy(startWith(prefixFixext8WithTypeId));
      expect(packed.length).toBe(10);
      const unpacked = factory.unpack(packed) as RubyTime;
      expect(unpacked.toI()).toBe(time.toI());
      expect(unpacked.toF()).toBe(time.toF());
    });

    it("serializes time without nanosec as fixext4", () => {
      const timeWithoutNsec = RubyTime.local(2019, 6, 17, 1, 2, 3, 0);
      const prefixFixext4WithTypeId = Uint8Array.of(0xd6, 0xff);

      const packed = factory.pack(timeWithoutNsec);
      expect(packed).toSatisfy(startWith(prefixFixext4WithTypeId));
      expect(packed.length).toBe(6);
      const unpacked = factory.unpack(packed) as RubyTime;
      expect(rbEqual(unpacked, timeWithoutNsec)).toBe(true);
    });

    it("serializes time after 2038 as ext8", () => {
      const timeAfter2514 = RubyTime.at(2 ** 34);
      const prefixExt8With12bytesPayloadAndTypeId = Uint8Array.of(0xc7, 12, 0xff);

      expect(timeAfter2514.toI()).toBeGreaterThan(0xffffffff);
      const packed = factory.pack(timeAfter2514);
      expect(packed).toSatisfy(startWith(prefixExt8With12bytesPayloadAndTypeId));
      expect(packed.length).toBe(15);
    });

    it("runs correctly (regression)", () => {
      const unpacked = factory.unpack(factory.pack(RubyTime.utc(2200))) as RubyTime;
      expect(rbEqual(unpacked, RubyTime.utc(2200))).toBe(true);
    });

    it("is serialized into timestamp32", () => {
      const time32Max = RubyTime.new(2106, 2, 7, 6, 28, 15, "+00:00");
      expect(factory.pack(time32Max).length).toBe(6);
      const unpacked = factory.unpack(factory.pack(time32Max)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time32Max)).toBe(true);
    });

    it("is serialized into timestamp64", () => {
      const time64Min = RubyTime.new(2106, 2, 7, 6, 28, 16, "+00:00");
      expect(factory.pack(time64Min).length).toBe(10);
      const unpacked = factory.unpack(factory.pack(time64Min)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time64Min)).toBe(true);
    });

    it("is serialized into timestamp64", () => {
      const time64Max = RubyTime.at(
        RubyTime.new(2514, 5, 30, 1, 53, 3, "+00:00").toI(),
        new Rational(999999999, 1000),
      ).utc();
      expect(factory.pack(time64Max).length).toBe(10);
      const unpacked = factory.unpack(factory.pack(time64Max)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time64Max)).toBe(true);
    });

    it("is serialized into timestamp96", () => {
      const time96PositiveMin = RubyTime.new(2514, 5, 30, 1, 53, 4, "+00:00");
      expect(factory.pack(time96PositiveMin).length).toBe(15);
      const unpacked = factory.unpack(factory.pack(time96PositiveMin)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time96PositiveMin)).toBe(true);
    });

    // PERMANENT-SKIP: Temporal.Instant holds nothing past 10**8 days from the epoch, as on JRuby (timestamp_spec.rb:88,95).
    it.skip("is serialized into timestamp96", () => {
      const time96Min = RubyTime.at(-(2n ** 63n)).utc();
      expect(factory.pack(time96Min).length).toBe(15);
      const unpacked = factory.unpack(factory.pack(time96Min)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time96Min)).toBe(true);
    });

    // PERMANENT-SKIP: Temporal.Instant holds nothing past 10**8 days from the epoch, as on JRuby (timestamp_spec.rb:88,95).
    it.skip("is serialized into timestamp96", () => {
      const time96Max = RubyTime.at(2n ** 63n - 1n).utc();
      expect(factory.pack(time96Max).length).toBe(15);
      const unpacked = factory.unpack(factory.pack(time96Max)) as RubyTime;
      expect(rbEqual(unpacked.utc(), time96Max)).toBe(true);
    });
  });

  describe("register_type with MessagePack::Timestamp", () => {
    let factory: Factory;
    beforeEach(() => {
      factory = new Factory();
      factory.registerType(Timestamp.TYPE, Timestamp);
    });

    it("serializes and deserializes MessagePack::Timestamp", () => {
      const timestamp = new Timestamp(RubyTime.now().tvSec(), 123_456_789);
      const packed = factory.pack(timestamp);
      const unpacked = factory.unpack(packed);
      expect(timestamp.equals(unpacked)).toBe(true);
    });
  });

  describe("timestamp32", () => {
    it("handles [1, 0]", () => {
      const t = new Timestamp(1, 0);

      const payload = t.toMsgpackExt();
      const unpacked = Timestamp.fromMsgpackExt(payload);

      expect(rbEqual(unpacked, t)).toBe(true);
    });
  });

  describe("timestamp64", () => {
    it("handles [1, 1]", () => {
      const t = new Timestamp(1, 1);

      const payload = t.toMsgpackExt();
      const unpacked = Timestamp.fromMsgpackExt(payload);

      expect(rbEqual(unpacked, t)).toBe(true);
    });
  });

  describe("timestamp96", () => {
    it("handles [-1, 0]", () => {
      const t = new Timestamp(-1, 0);

      const payload = t.toMsgpackExt();
      const unpacked = Timestamp.fromMsgpackExt(payload);

      expect(rbEqual(unpacked, t)).toBe(true);
    });

    it("handles [-1, 999_999_999]", () => {
      const t = new Timestamp(-1, 999_999_999);

      const payload = t.toMsgpackExt();
      const unpacked = Timestamp.fromMsgpackExt(payload);

      expect(rbEqual(unpacked, t)).toBe(true);
    });
  });
});
