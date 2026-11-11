import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError, TopLevel } from "@blazetrails/ruby-compat";
import { Mail } from "../../../lib/index.js";
import type { RetrieverOptions } from "../../../lib/network/retriever-methods/base.js";
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
    for (const options of [{ count: -1 }, { count: -1, what: "last" }] as RetrieverOptions[]) {
      let error: unknown;
      try {
        Mail.find(options);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ArgumentError);
      expect((error as Error).message).toBe("negative array size");
    }
  });

  it("keeps the first count uids for a count of 0 or more", () => {
    expect(Mail.find({ count: 0 })).toEqual([]);
  });
});
