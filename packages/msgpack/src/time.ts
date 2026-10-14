import { Time as RubyTime } from "@blazetrails/date";
import { ArgumentError, Rational, rbModConstSet } from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

const TIME_AT_3_AVAILABLE = (() => {
  try {
    return RubyTime.at(0, 0, "nanosecond") != null;
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return false;
  }
})();

const Unpacker = TIME_AT_3_AVAILABLE
  ? (payload: Uint8Array): RubyTime => {
      const tv = MessagePack.Timestamp.fromMsgpackExt(payload);
      return RubyTime.at(tv.sec, tv.nsec, "nanosecond");
    }
  : (payload: Uint8Array): RubyTime => {
      const tv = MessagePack.Timestamp.fromMsgpackExt(payload);
      return RubyTime.at(tv.sec, new Rational(tv.nsec, 1000));
    };

const Packer = (time: RubyTime): Uint8Array => {
  return MessagePack.Timestamp.toMsgpackExt(time.tvSec(), time.tvNsec);
};

export const Time = { name: "MessagePack::Time", TIME_AT_3_AVAILABLE, Unpacker, Packer };

rbModConstSet(MessagePack, "Time", Time);
