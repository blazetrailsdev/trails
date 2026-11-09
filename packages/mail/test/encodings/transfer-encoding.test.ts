import { describe, expect, it } from "vitest";
import "../../lib/index.js";
import { EightBit } from "../../lib/encodings/8bit.js";
import { SevenBit } from "../../lib/encodings/7bit.js";
import { TransferEncoding } from "../../lib/encodings/transfer-encoding.js";

describe("Mail::Encodings::TransferEncoding", () => {
  it("accepts blank message_encoding", () => {
    expect(TransferEncoding.negotiate("", "7bit", "")).toEqual(SevenBit);
    expect(TransferEncoding.negotiate("", "8bit", "")).toEqual(EightBit);
  });
});
