import { afterEach, describe, expect, it, vi } from "vitest";
import { Gem, stderr } from "@blazetrails/ruby-compat";
import "../lib/index.js";
import { CheckDeliveryParams } from "../lib/check-delivery-params.js";

describe("Mail::CheckDeliveryParams deprecations", () => {
  afterEach(() => {
    Gem.Deprecate.skip = false;
    vi.restoreAllMocks();
  });

  it("warns on each call naming the replacement, unless Gem::Deprecate.skip", () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    CheckDeliveryParams.checkAddr("To", "to@example.org");
    expect(write).toHaveBeenCalledWith(
      expect.stringMatching(
        /^NOTE: Mail::CheckDeliveryParams\.checkAddr is deprecated with no replacement\. It will be removed on or after 2023-06\.\nMail::CheckDeliveryParams\.checkAddr called from .*check-delivery-params\.trails\.test\.ts:\d+\.\n$/,
      ),
    );

    write.mockClear();
    Gem.Deprecate.skip = true;
    expect(CheckDeliveryParams.checkAddr("To", "to@example.org")).toBe("to@example.org");
    expect(write).not.toHaveBeenCalled();
  });

  it("hands the block through to the wrapped method", () => {
    Gem.Deprecate.skip = true;
    const yielded: string[] = [];
    CheckDeliveryParams.validateSmtpAddr("a\nb", (message) => yielded.push(message));
    expect(yielded).toEqual(["may not contain CR or LF line breaks"]);
  });
});
