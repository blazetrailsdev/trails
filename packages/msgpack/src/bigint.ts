import { pack, rbBigNorm, rbModConstSet, unpack } from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

const CHUNK_BITLENGTH = 32;
const FORMAT = "CL>*";

function toMsgpackExt(bigint: number | bigint): Uint8Array {
  bigint = BigInt(bigint);
  const members: (number | bigint)[] = [];

  if (bigint < 0n) {
    bigint = -bigint;
    members.push(1);
  } else {
    members.push(0);
  }

  let offset = 0;
  const length = bigint === 0n ? 0 : bigint.toString(2).length;
  while (offset < length) {
    members.push((bigint >> BigInt(offset)) & 0xffff_ffffn);
    offset += CHUNK_BITLENGTH;
  }

  return Uint8Array.from(pack(members, FORMAT), (c) => c.charCodeAt(0));
}

function fromMsgpackExt(data: Uint8Array): number | bigint {
  const parts = unpack(data, FORMAT) as number[];

  const sign = parts.shift();
  let sum = BigInt(parts.pop() ?? 0);

  for (const part of parts.reverse()) {
    sum = sum << BigInt(CHUNK_BITLENGTH);
    sum += BigInt(part);
  }

  return rbBigNorm(sign === 0 ? sum : -sum);
}

export const Bigint = {
  name: "MessagePack::Bigint",
  CHUNK_BITLENGTH,
  FORMAT,
  toMsgpackExt,
  fromMsgpackExt,
};

rbModConstSet(MessagePack, "Bigint", Bigint);
