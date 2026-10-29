import { describe, expect, it } from "vitest";
import "../index.js";
import { EightBit } from "./8bit.js";
import { SevenBit } from "./7bit.js";
import { TransferEncoding } from "./transfer-encoding.js";

describe("Mail::Encodings::TransferEncoding", () => {
  it("accepts blank message_encoding", () => {
    expect(TransferEncoding.negotiate("", "7bit", "")).toEqual(SevenBit);
    expect(TransferEncoding.negotiate("", "8bit", "")).toEqual(EightBit);
  });
});
