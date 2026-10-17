import { isBlank, stringifyKeys, type SafeBuffer } from "@blazetrails/activesupport";
import { ArgumentError, block, fetch, hashDelete, rtest, toI } from "@blazetrails/ruby-compat";

import type { TagBuilder } from "../tag-helper.js";

interface SelectRendererHost {
  addDefaultNameAndId(options: Record<string, unknown>): void;
  contentTag(name: string, content: unknown, options: Record<string, unknown>): unknown;
  tag(name: string, options: Record<string, unknown>): unknown;
  tagBuilder(): TagBuilder;
  value(): unknown;
  promptText(prompt: unknown): unknown;
  isPlaceholderRequired(htmlOptions: Record<string, unknown>): boolean;
  addOptions(optionTags: unknown, options: Record<string, unknown>, value?: unknown): unknown;
}

export const SelectRenderer = {
  /** @internal */
  selectContentTag(
    this: SelectRendererHost,
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown {
    htmlOptions = stringifyKeys(htmlOptions);
    for (const prop of ["required", "multiple", "size"]) {
      if (prop in options && !(prop in htmlOptions)) htmlOptions[prop] = hashDelete(options, prop);
    }

    this.addDefaultNameAndId(htmlOptions);

    if (this.isPlaceholderRequired(htmlOptions)) {
      if (options["includeBlank"] === false)
        throw new ArgumentError("include_blank cannot be false for a required field.");
      if (!rtest(options["prompt"]) && !rtest(options["includeBlank"]))
        options["includeBlank"] = true;
    }

    const value = fetch(
      options,
      "selected",
      block(() => this.value()),
    );
    const select = this.contentTag(
      "select",
      this.addOptions(optionTags, options, value),
      htmlOptions,
    );

    if (rtest(htmlOptions["multiple"]) && rtest(fetch<unknown>(options, "includeHidden", true))) {
      return (
        this.tag("input", {
          disabled: htmlOptions["disabled"],
          name: htmlOptions["name"],
          type: "hidden",
          value: "",
          autocomplete: "off",
        }) as SafeBuffer
      ).plus(select);
    } else {
      return select;
    }
  },

  /** @internal */
  isPlaceholderRequired(this: SelectRendererHost, htmlOptions: Record<string, unknown>): boolean {
    return (
      rtest(htmlOptions["required"]) &&
      !rtest(htmlOptions["multiple"]) &&
      toI(fetch<unknown>(htmlOptions, "size", 1)) === 1
    );
  },

  /** @internal */
  addOptions(
    this: SelectRendererHost,
    optionTags: unknown,
    options: Record<string, unknown>,
    value: unknown = null,
  ): unknown {
    if (rtest(options["includeBlank"])) {
      const content = typeof options["includeBlank"] === "string" ? options["includeBlank"] : null;
      const label = content == null ? " " : null;
      optionTags = this.tagBuilder()
        .contentTagString("option", content, { value: "", label })
        .plus("\n")
        .plus(optionTags);
    }

    if (isBlank(value) && rtest(options["prompt"])) {
      const tagOptions: Record<string, unknown> = { value: "" };
      if (options["disabled"] === "") tagOptions["disabled"] = true;
      if (options["selected"] === "") tagOptions["selected"] = true;
      optionTags = this.tagBuilder()
        .contentTagString("option", this.promptText(options["prompt"]), tagOptions)
        .plus("\n")
        .plus(optionTags);
    }

    return optionTags;
  },
};
