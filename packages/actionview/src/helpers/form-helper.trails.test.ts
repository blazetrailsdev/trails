import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { FormBuilder } from "./form-helper.js";

describe("FormBuilder#submit", () => {
  it("takes a Hash as the options, as form_helper.rb:2590's is_a?(Hash) does", () => {
    const calls: unknown[][] = [];
    const template = {
      submitTag: (value: unknown, options: unknown) => calls.push([value, options]),
    };
    const options = new Hash<string, unknown>();
    options.set("class", "extra");
    new FormBuilder("post", false, template, {}).submit(options);
    expect(calls).toEqual([["Submit Post", options]]);
  });
});
