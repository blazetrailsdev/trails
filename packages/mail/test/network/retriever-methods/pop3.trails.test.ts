import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Mail } from "../../../lib/index.js";
import type { RetrieverOptions } from "../../../lib/network/retriever-methods/base.js";
import "../../support/mock-pop3.js";

describe("POP3 Retriever", () => {
  beforeEach(() => {
    Mail.defaults(function () {
      this.retrieverMethod("pop3", { address: "localhost", port: 995, enableSsl: true });
    });
  });

  it("raises ArgumentError for a negative count as Array#first does", () => {
    for (const options of [{ count: -1 }, { count: -1, what: "last" }] as RetrieverOptions[]) {
      expect(() => Mail.find(options)).toThrow(ArgumentError);
      expect(() => Mail.find(options)).toThrow("negative array size");
    }
  });
});
