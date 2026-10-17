import { isBlank, stringifyKeys } from "@blazetrails/activesupport";
import { ArgumentError, block, fetch, hashDelete } from "@blazetrails/ruby-compat";

import type { TagBuilder } from "../tag-helper.js";

interface SelectRendererHost {
  addDefaultNameAndId(options: Record<string, unknown>): void;
  contentTag(name: string, content: unknown, options: Record<string, unknown>): unknown;
  tag(name: string, options: Record<string, unknown>): unknown;
  tagBuilder(): TagBuilder;
  value(): unknown;
  promptText(prompt: unknown): unknown;
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

    if (SelectRenderer.isPlaceholderRequired.call(this, htmlOptions)) {
      if (options["includeBlank"] === false)
        throw new ArgumentError("include_blank cannot be false for a required field.");
      if (options["prompt"] == null || options["prompt"] === false)
        options["includeBlank"] ||= true;
    }

    const value = fetch(
      options,
      "selected",
      block(() => this.value()),
    );
    const select = this.contentTag(
      "select",
      SelectRenderer.addOptions.call(this, optionTags, options, value),
      htmlOptions,
    );

    const includeHidden = fetch<unknown>(options, "includeHidden", true);
    if (htmlOptions["multiple"] && includeHidden != null && includeHidden !== false) {
      return `${this.tag("input", {
        disabled: htmlOptions["disabled"],
        name: htmlOptions["name"],
        type: "hidden",
        value: "",
        autocomplete: "off",
      })}${select}`;
    } else {
      return select;
    }
  },

  /** @internal */
  isPlaceholderRequired(this: SelectRendererHost, htmlOptions: Record<string, unknown>): boolean {
    return (
      htmlOptions["required"] != null &&
      htmlOptions["required"] !== false &&
      !htmlOptions["multiple"] &&
      Math.trunc(Number(fetch(htmlOptions, "size", 1))) === 1
    );
  },

  /** @internal */
  addOptions(
    this: SelectRendererHost,
    optionTags: unknown,
    options: Record<string, unknown>,
    value: unknown = null,
  ): unknown {
    if (options["includeBlank"] != null && options["includeBlank"] !== false) {
      const content = typeof options["includeBlank"] === "string" ? options["includeBlank"] : null;
      const label = content == null ? " " : null;
      optionTags = this.tagBuilder()
        .contentTagString("option", content, { value: "", label })
        .plus("\n")
        .plus(optionTags);
    }

    if (isBlank(value) && options["prompt"] != null && options["prompt"] !== false) {
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
