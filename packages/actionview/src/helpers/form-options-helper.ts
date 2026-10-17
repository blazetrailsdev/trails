import {
  I18n,
  extractOptionsBang,
  filterMap,
  htmlSafe,
  isPlainObject,
  kernelArray as Array,
  wrap,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import {
  fetch,
  first,
  last,
  Module,
  rbModDefineMethod,
  rbFPublicSend,
  rbObjAsString,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

import { contentTag, tagBuilder, type TagHelperHost } from "./tag-helper.js";
import { TextHelper } from "./text-helper.js";
import { Tags } from "../namespaces.js";
import { FormBuilder, type FormHelperHost } from "./form-helper.js";

export type FormOptionsHelperHost = TagHelperHost;

export function select(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  choices: unknown = null,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
  block?: () => unknown,
): unknown {
  return new Tags.Select(object, method, this, choices, options, htmlOptions, block).render();
}

export function optionsForSelect(
  this: FormOptionsHelperHost,
  container: unknown,
  selected: unknown = null,
): SafeBuffer | string {
  if (typeof container === "string") return container;

  const [selectedValues, disabled] = extractSelectedAndDisabled(selected).map((r) =>
    Array(r).map(rbObjAsString),
  );

  return htmlSafe(
    (isPlainObject(container) ? Object.entries(container) : Array(container))
      .map((element) => {
        const htmlAttributes = optionHtmlAttributes(element);
        const [text, value] = optionTextAndValue(element).map(rbObjAsString);

        htmlAttributes["selected"] ||= isOptionValueSelected(value, selectedValues);
        htmlAttributes["disabled"] ||= disabled != null && isOptionValueSelected(value, disabled);
        htmlAttributes["value"] = value;

        return tagBuilder.call(this).contentTagString("option", text, htmlAttributes);
      })
      .join("\n"),
  );
}

export function optionsFromCollectionForSelect(
  this: FormOptionsHelperHost,
  collection: Iterable<unknown>,
  valueMethod: unknown,
  textMethod: unknown,
  selected: unknown = null,
): SafeBuffer | string {
  const options = globalThis.Array.from(collection, (element) => [
    valueForCollection(element, textMethod),
    valueForCollection(element, valueMethod),
    optionHtmlAttributes(element),
  ]);
  const [selectedItems, disabled] = extractSelectedAndDisabled(selected);
  const selectDeselect = {
    selected: extractValuesFromCollection(collection, valueMethod, selectedItems),
    disabled: extractValuesFromCollection(collection, valueMethod, disabled),
  };

  return optionsForSelect.call(this, options, selectDeselect);
}

/** @missingRailsArgs join — PERMANENT */
export function optionGroupsFromCollectionForSelect(
  this: FormOptionsHelperHost,
  collection: Iterable<unknown>,
  groupMethod: unknown,
  groupLabelMethod: unknown,
  optionKeyMethod: unknown,
  optionValueMethod: unknown,
  selectedKey: unknown = null,
): SafeBuffer {
  return htmlSafe(
    globalThis.Array.from(collection, (group) => {
      const optionTags = optionsFromCollectionForSelect.call(
        this,
        valueForCollection(group, groupMethod) as Iterable<unknown>,
        optionKeyMethod,
        optionValueMethod,
        selectedKey,
      );
      return contentTag.call(this, "optgroup", optionTags, {
        label: valueForCollection(group, groupLabelMethod),
      });
    }).join(""),
  );
}

export function groupedOptionsForSelect(
  this: FormOptionsHelperHost,
  groupedOptions: unknown,
  selectedKey: unknown = null,
  options: Record<string, unknown> = {},
): SafeBuffer {
  const prompt = options["prompt"];
  const divider = options["divider"];

  const body = htmlSafe("");

  if (prompt != null && prompt !== false) {
    body.safeConcat(contentTag.call(this, "option", promptText(prompt), { value: "" }));
  }

  for (let container of isPlainObject(groupedOptions)
    ? Object.entries(groupedOptions)
    : Array(groupedOptions)) {
    let htmlAttributes = optionHtmlAttributes(container);

    let label: unknown;
    if (divider != null && divider !== false) {
      label = divider;
    } else {
      [label, container] = container as [unknown, unknown];
    }

    htmlAttributes = Object.assign({ label }, htmlAttributes);
    body.safeConcat(
      contentTag.call(
        this,
        "optgroup",
        optionsForSelect.call(this, container, selectedKey),
        htmlAttributes,
      ),
    );
  }

  return body;
}

/** @internal */
export function optionHtmlAttributes(element: unknown): Record<string, unknown> {
  if (globalThis.Array.isArray(element)) {
    return element.filter((e) => isPlainObject(e)).reduce((acc, e) => Object.assign(acc, e), {});
  } else {
    return {};
  }
}

/** @internal */
export function optionTextAndValue(option: unknown): [unknown, unknown] {
  if (
    typeof option !== "string" &&
    rbObjRespondTo(option, "first") &&
    rbObjRespondTo(option, "last")
  ) {
    if (globalThis.Array.isArray(option)) option = option.filter((e) => !isPlainObject(e));
    return [first(option as unknown[]), last(option as unknown[])];
  } else {
    return [option, option];
  }
}

/** @internal */
export function isOptionValueSelected(value: string, selected: unknown): boolean {
  return Array(selected).includes(value);
}

/** @internal */
export function extractSelectedAndDisabled(selected: unknown): [unknown, unknown] {
  if (typeof selected === "function") {
    return [selected, null];
  } else {
    const selectedArray = wrap(selected);
    const options = extractOptionsBang(selectedArray);
    const selectedItems = fetch(options, "selected", selectedArray);
    return [selectedItems, options["disabled"]];
  }
}

/** @internal */
export function extractValuesFromCollection(
  collection: Iterable<unknown>,
  valueMethod: unknown,
  selected: unknown,
): unknown {
  if (typeof selected === "function") {
    return filterMap(globalThis.Array.from(collection), (element) => {
      if (selected(element)) return rbFPublicSend(element, String(valueMethod));
    });
  } else {
    return selected;
  }
}

/** @internal */
export function valueForCollection(item: unknown, value: unknown): unknown {
  return typeof value === "function" ? value(item) : rbFPublicSend(item, String(value));
}

/** @internal */
export function promptText(prompt: unknown): unknown {
  return typeof prompt === "string"
    ? prompt
    : I18n.translate("helpers.select.prompt", { default: "Please select" });
}

export const FormOptionsHelper = new Module((mod) => {
  mod.include(TextHelper);

  mod.moduleEval((m) => {
    Object.assign(m, { select, optionsForSelect, optionsFromCollectionForSelect });
    Object.assign(m, { optionGroupsFromCollectionForSelect, groupedOptionsForSelect });
    Object.assign(m, { optionHtmlAttributes, optionTextAndValue, isOptionValueSelected });
    Object.assign(m, { extractSelectedAndDisabled, extractValuesFromCollection });
    Object.assign(m, { valueForCollection, promptText });
  });
});

declare module "./form-helper.js" {
  interface FormBuilder {
    select(
      method: unknown,
      choices?: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
      block?: () => unknown,
    ): unknown;
  }
}

rbModDefineMethod(
  FormBuilder,
  "select",
  function (
    this: {
      objectName: unknown;
      _template: FormHelperHost;
      _defaultHtmlOptions: Record<string, unknown>;
      objectifyOptions(options: Record<string, unknown>): Record<string, unknown>;
    },
    method: unknown,
    choices: unknown = null,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
    block?: () => unknown,
  ): unknown {
    return this._template.select!(
      this.objectName,
      method,
      choices,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
      block,
    );
  },
);
