import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, TopLevel } from "@blazetrails/ruby-compat";
import { Mail } from "../../../lib/index.js";
import { NetIMAP } from "../../support/mock-imap.js";

const Net = TopLevel.Net as { IMAP?: unknown };

describe("IMAP Retriever", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.retrieverMethod("imap", { address: "localhost", port: 993, enableSsl: true });
    });
  });

  afterEach(() => {
    Net.IMAP = NetIMAP;
  });

  it("raises ArgumentError for a negative count as Array#first does", () => {
    expect(() => Mail.find({ count: -1 })).toThrow(ArgumentError);
    expect(() => Mail.find({ count: -1 })).toThrow("negative array size");
  });

  it("keeps the first count uids for a count of 0 or more", () => {
    expect(Mail.find({ count: 0 })).toEqual([]);
  });
});
