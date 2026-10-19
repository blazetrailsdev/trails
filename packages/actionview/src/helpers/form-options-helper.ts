import { Date as RubyDate } from "@blazetrails/date";
import {
  I18n,
  TimeZone,
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
  rbModDefineMethod,
  rbFPublicSend,
  rbEql,
  rbFSend,
  rbObjAsString,
  rbObjRespondTo,
  rtest,
  include,
} from "@blazetrails/ruby-compat";

import { contentTag, tagBuilder, type TagHelperHost } from "./tag-helper.js";
import { TextHelper } from "./text-helper.js";
import { Tags } from "../namespaces.js";
import { FormBuilder, type FormHelperHost } from "./form-helper.js";
import type { Builder } from "./tags/collection-helpers.js";

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

export function collectionSelect(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  collection: unknown,
  valueMethod: unknown,
  textMethod: unknown,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
): unknown {
  return new Tags.CollectionSelect(
    object,
    method,
    this,
    collection,
    valueMethod,
    textMethod,
    options,
    htmlOptions,
  ).render();
}

export function groupedCollectionSelect(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  collection: unknown,
  groupMethod: unknown,
  groupLabelMethod: unknown,
  optionKeyMethod: unknown,
  optionValueMethod: unknown,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
): unknown {
  return new Tags.GroupedCollectionSelect(
    object,
    method,
    this,
    collection,
    groupMethod,
    groupLabelMethod,
    optionKeyMethod,
    optionValueMethod,
    options,
    htmlOptions,
  ).render();
}

export function timeZoneSelect(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  priorityZones: unknown = null,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
): unknown {
  return new Tags.TimeZoneSelect(
    object,
    method,
    this,
    priorityZones,
    options,
    htmlOptions,
  ).render();
}

export function weekdaySelect(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
  block?: () => unknown,
): unknown {
  return new Tags.WeekdaySelect(object, method, this, options, htmlOptions, block).render();
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

        if (!rtest(htmlAttributes["selected"]))
          htmlAttributes["selected"] = isOptionValueSelected(value, selectedValues);
        if (!rtest(htmlAttributes["disabled"]))
          htmlAttributes["disabled"] = rtest(disabled) && isOptionValueSelected(value, disabled);
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

export function timeZoneOptionsForSelect(
  this: FormOptionsHelperHost,
  selected: unknown = null,
  priorityZones: unknown = null,
  model: { all(): TimeZone[] } = TimeZone,
): SafeBuffer {
  const zoneOptions = htmlSafe("");

  let zones = model.all();
  const convertZones = (list: TimeZone[]) => list.map((z) => [z.toString(), z.name]);

  if (rtest(priorityZones)) {
    if (priorityZones instanceof RegExp) {
      const pattern = priorityZones;
      priorityZones = zones.filter((z) => z.isMatch(pattern));
    }

    const priority = priorityZones as TimeZone[];
    zoneOptions.safeConcat(optionsForSelect.call(this, convertZones(priority), selected));
    zoneOptions.safeConcat(
      contentTag.call(this, "option", "-------------", { value: "", disabled: true }),
    );
    zoneOptions.safeConcat("\n");

    zones = zones.filter((z) => !priority.some((p) => rbEql(p, z)));
  }

  return zoneOptions.safeConcat(optionsForSelect.call(this, convertZones(zones), selected));
}

export function weekdayOptionsForSelect(
  this: FormOptionsHelperHost,
  selected: unknown = null,
  {
    indexAsValue = false,
    dayFormat = "day_names",
    beginningOfWeek = RubyDate.beginningOfWeek(),
  }: { indexAsValue?: unknown; dayFormat?: unknown; beginningOfWeek?: unknown } = {},
): SafeBuffer | string {
  let dayNames = I18n.translate(`date.${dayFormat}`) as unknown[];
  if (rtest(indexAsValue)) dayNames = dayNames.map((name, index) => [name, index]);
  dayNames = rbFSend(
    dayNames,
    "rotate",
    fetch(RubyDate.DAYS_INTO_WEEK, beginningOfWeek as string),
  ) as unknown[];

  return optionsForSelect.call(this, dayNames, selected);
}

export function collectionRadioButtons(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  collection: unknown,
  valueMethod: unknown,
  textMethod: unknown,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
  block?: (builder: Builder) => unknown,
): SafeBuffer {
  return new Tags.CollectionRadioButtons(
    object,
    method,
    this,
    collection,
    valueMethod,
    textMethod,
    options,
    htmlOptions,
  ).render(block);
}

export function collectionCheckboxes(
  this: FormOptionsHelperHost,
  object: unknown,
  method: unknown,
  collection: unknown,
  valueMethod: unknown,
  textMethod: unknown,
  options: Record<string, unknown> = {},
  htmlOptions: Record<string, unknown> = {},
  block?: (builder: Builder) => unknown,
): SafeBuffer {
  return new Tags.CollectionCheckBoxes(
    object,
    method,
    this,
    collection,
    valueMethod,
    textMethod,
    options,
    htmlOptions,
  ).render(block);
}
export const collectionCheckBoxes = collectionCheckboxes;

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
      if (rtest(selected(element))) return rbFPublicSend(element, String(valueMethod));
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

export const FormOptionsHelper = {
  select,
  collectionSelect,
  groupedCollectionSelect,
  timeZoneSelect,
  weekdaySelect,
  optionsForSelect,
  optionsFromCollectionForSelect,
  optionGroupsFromCollectionForSelect,
  groupedOptionsForSelect,
  timeZoneOptionsForSelect,
  weekdayOptionsForSelect,
  optionHtmlAttributes,
  optionTextAndValue,
  isOptionValueSelected,
  extractSelectedAndDisabled,
  extractValuesFromCollection,
  collectionRadioButtons,
  collectionCheckboxes,
  collectionCheckBoxes,
  valueForCollection,
  promptText,
};

include(FormOptionsHelper, TextHelper);

declare module "./form-helper.js" {
  interface FormBuilder {
    select(
      method: unknown,
      choices?: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
      block?: () => unknown,
    ): unknown;
    collectionSelect(
      method: unknown,
      collection: unknown,
      valueMethod: unknown,
      textMethod: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
    ): unknown;
    groupedCollectionSelect(
      method: unknown,
      collection: unknown,
      groupMethod: unknown,
      groupLabelMethod: unknown,
      optionKeyMethod: unknown,
      optionValueMethod: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
    ): unknown;
    timeZoneSelect(
      method: unknown,
      priorityZones?: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
    ): unknown;
    weekdaySelect(
      method: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
    ): unknown;
    collectionCheckboxes(
      method: unknown,
      collection: unknown,
      valueMethod: unknown,
      textMethod: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
      block?: (builder: Builder) => unknown,
    ): SafeBuffer;
    collectionCheckBoxes: FormBuilder["collectionCheckboxes"];
    collectionRadioButtons(
      method: unknown,
      collection: unknown,
      valueMethod: unknown,
      textMethod: unknown,
      options?: Record<string, unknown>,
      htmlOptions?: Record<string, unknown>,
      block?: (builder: Builder) => unknown,
    ): SafeBuffer;
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

type FormBuilderSelf = {
  objectName: unknown;
  _template: FormHelperHost & Record<string, (...args: unknown[]) => SafeBuffer>;
  _defaultHtmlOptions: Record<string, unknown>;
  objectifyOptions(options: Record<string, unknown>): Record<string, unknown>;
};

rbModDefineMethod(
  FormBuilder,
  "collectionSelect",
  function (
    this: FormBuilderSelf,
    method: unknown,
    collection: unknown,
    valueMethod: unknown,
    textMethod: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
  ): unknown {
    return this._template.collectionSelect(
      this.objectName,
      method,
      collection,
      valueMethod,
      textMethod,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
    );
  },
);

rbModDefineMethod(
  FormBuilder,
  "groupedCollectionSelect",
  function (
    this: FormBuilderSelf,
    method: unknown,
    collection: unknown,
    groupMethod: unknown,
    groupLabelMethod: unknown,
    optionKeyMethod: unknown,
    optionValueMethod: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
  ): unknown {
    return this._template.groupedCollectionSelect(
      this.objectName,
      method,
      collection,
      groupMethod,
      groupLabelMethod,
      optionKeyMethod,
      optionValueMethod,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
    );
  },
);

rbModDefineMethod(
  FormBuilder,
  "timeZoneSelect",
  function (
    this: FormBuilderSelf,
    method: unknown,
    priorityZones: unknown = null,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
  ): unknown {
    return this._template.timeZoneSelect(
      this.objectName,
      method,
      priorityZones,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
    );
  },
);

rbModDefineMethod(
  FormBuilder,
  "weekdaySelect",
  function (
    this: FormBuilderSelf,
    method: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
  ): unknown {
    return this._template.weekdaySelect(this.objectName, method, this.objectifyOptions(options), {
      ...this._defaultHtmlOptions,
      ...htmlOptions,
    });
  },
);

rbModDefineMethod(
  FormBuilder,
  "collectionCheckboxes",
  function (
    this: FormBuilderSelf,
    method: unknown,
    collection: unknown,
    valueMethod: unknown,
    textMethod: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
    block?: (builder: Builder) => unknown,
  ): SafeBuffer {
    return this._template.collectionCheckboxes(
      this.objectName,
      method,
      collection,
      valueMethod,
      textMethod,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
      block,
    );
  },
);
rbModDefineMethod(FormBuilder, "collectionCheckBoxes", FormBuilder.prototype.collectionCheckboxes);

rbModDefineMethod(
  FormBuilder,
  "collectionRadioButtons",
  function (
    this: FormBuilderSelf,
    method: unknown,
    collection: unknown,
    valueMethod: unknown,
    textMethod: unknown,
    options: Record<string, unknown> = {},
    htmlOptions: Record<string, unknown> = {},
    block?: (builder: Builder) => unknown,
  ): SafeBuffer {
    return this._template.collectionRadioButtons(
      this.objectName,
      method,
      collection,
      valueMethod,
      textMethod,
      this.objectifyOptions(options),
      { ...this._defaultHtmlOptions, ...htmlOptions },
      block,
    );
  },
);
