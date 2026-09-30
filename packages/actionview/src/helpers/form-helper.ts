import {
  CodeGenerator,
  I18n,
  SafeBuffer,
  classAttribute,
  constantize,
  cattrAccessor,
  demodulize,
  extractOptionsBang,
  humanize,
  isPlainObject,
  onLoad,
  underscore,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  block,
  Hash,
  except,
  fetch,
  hashDelete,
  merge,
  mergeBang,
  rbInspect,
  rbObjRespondTo,
  slice,
} from "@blazetrails/ruby-compat";

import { convertToModel, modelNameFromRecordOrClass } from "../model-naming.js";
export { domClass, domId } from "../record-identifier.js";
import { ActionView } from "../namespaces.js";
import { capture, type CaptureHelperHost } from "./capture-helper.js";
import {
  formTagHtml,
  formTagWithBody,
  htmlOptionsForForm,
  type FormTagHelperHost,
} from "./form-tag-helper.js";
import { Label, type LabelBuilder } from "./tags/label.js";
import { PasswordField } from "./tags/password-field.js";
import { HiddenField } from "./tags/hidden-field.js";
import { TextArea } from "./tags/text-area.js";
import { ColorField } from "./tags/color-field.js";
import { TelField } from "./tags/tel-field.js";
import { DateField } from "./tags/date-field.js";
import { TimeField } from "./tags/time-field.js";
import { DatetimeLocalField } from "./tags/datetime-local-field.js";
import { MonthField } from "./tags/month-field.js";
import { WeekField } from "./tags/week-field.js";
import { UrlField } from "./tags/url-field.js";
import { EmailField } from "./tags/email-field.js";
import { NumberField } from "./tags/number-field.js";
import { RangeField } from "./tags/range-field.js";
import { SearchField } from "./tags/search-field.js";
import { TextField } from "./tags/text-field.js";

const __FILE__ = import.meta.url;
const __LINE__ = 0;

export interface FormHelperHost extends FormTagHelperHost, CaptureHelperHost {
  hiddenField: typeof hiddenField;
  label: typeof label;
  defaultFormBuilder: unknown;
  polymorphicPath?(record: unknown, options: Record<string, unknown>): string;
}

interface FormWithOptions {
  model?: unknown;
  scope?: string | null;
  url?: unknown;
  format?: string | null;
  [key: string]: unknown;
}

export let formWithGeneratesRemoteForms: boolean = true;

export let formWithGeneratesIds: boolean = false;

export let multipleFileFieldIncludeHidden: boolean = false;

export function setFormWithGeneratesRemoteForms(value: boolean): void {
  formWithGeneratesRemoteForms = value;
}

export function setFormWithGeneratesIds(value: boolean): void {
  formWithGeneratesIds = value;
}

export function setMultipleFileFieldIncludeHidden(value: boolean): void {
  multipleFileFieldIncludeHidden = value;
}

export function formWith(
  this: FormHelperHost,
  { scope = null, url = null, format = null, ...rest }: FormWithOptions = {},
  block?: (builder: FormBuilder) => unknown,
): SafeBuffer {
  let model = "model" in rest ? rest.model : false;
  delete rest.model;
  if (model == null) {
    throw new ArgumentError("Passed nil to the :model argument, expect an object or false");
  }

  const options: Record<string, unknown> = mergeBang(
    { allowMethodNamesOutsideObject: true, skipDefaultIds: !formWithGeneratesIds },
    rest,
  );

  if (model !== false) {
    if (url !== false) {
      url ??=
        format == null
          ? this.polymorphicPath!(model, {})
          : this.polymorphicPath!(model, { format: format });
    }

    model = convertToModel(_objectForFormBuilder(model));
    if (scope == null || (scope as unknown) === false) {
      scope = modelNameFromRecordOrClass(model).paramKey;
    }
  }

  if (block !== undefined) {
    const builder = instantiateBuilder.call(this, scope, model, options);
    const output = capture.call(this, block as (...args: unknown[]) => unknown, builder);
    if (options["multipart"] == null || options["multipart"] === false) {
      options["multipart"] = builder.isMultipart();
    }

    const htmlOptions = htmlOptionsForFormWith.call(this, url, model, options);
    return formTagWithBody.call(this, htmlOptions, output);
  } else {
    const htmlOptions = htmlOptionsForFormWith.call(this, url, model, options);
    return formTagHtml.call(this, htmlOptions);
  }
}

export function label(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  contentOrOptions: unknown = null,
  options: Record<string, unknown> | null = null,
  block?: (builder: LabelBuilder) => unknown,
): unknown {
  return new Label(objectName, method, this, contentOrOptions, options).render(block);
}

export function textField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new TextField(objectName, method, this, options).render();
}

export function passwordField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new PasswordField(objectName, method, this, options).render();
}

export function hiddenField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new HiddenField(objectName, method, this, options).render();
}

export function textarea(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new TextArea(objectName, method, this, options).render();
}
export const textArea = textarea;

export function colorField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new ColorField(objectName, method, this, options).render();
}

export function searchField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new SearchField(objectName, method, this, options).render();
}

export function telephoneField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new TelField(objectName, method, this, options).render();
}
export const phoneField = telephoneField;

export function dateField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new DateField(objectName, method, this, options).render();
}

export function timeField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new TimeField(objectName, method, this, options).render();
}

export function datetimeField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new DatetimeLocalField(objectName, method, this, options).render();
}
export const datetimeLocalField = datetimeField;

export function monthField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new MonthField(objectName, method, this, options).render();
}

export function weekField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new WeekField(objectName, method, this, options).render();
}

export function urlField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new UrlField(objectName, method, this, options).render();
}

export function emailField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new EmailField(objectName, method, this, options).render();
}

export function numberField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new NumberField(objectName, method, this, options).render();
}

export function rangeField(
  this: FormHelperHost,
  objectName: unknown,
  method: unknown,
  options: Record<string, unknown> = {},
): unknown {
  return new RangeField(objectName, method, this, options).render();
}

export function _objectForFormBuilder(object: unknown): unknown {
  return Array.isArray(object) ? object.at(-1) : object;
}

/**
 * @internal
 * @missingRailsArgs merge! — PERMANENT
 */
export function htmlOptionsForFormWith(
  this: FormHelperHost,
  urlForOptions: unknown = null,
  model: unknown = null,
  {
    html = {},
    local = !formWithGeneratesRemoteForms,
    skipEnforcingUtf8 = null,
    ...options
  }: Record<string, unknown> & {
    html?: Record<string, unknown>;
    local?: unknown;
    skipEnforcingUtf8?: unknown;
  } = {},
): Record<string, unknown> {
  const htmlOptions = mergeBang(
    slice(options, "id", "class", "multipart", "method", "data", "authenticityToken"),
    html,
  );
  const remote = hashDelete(html, "remote");
  htmlOptions["remote"] =
    remote != null && remote !== false ? remote : !(local != null && local !== false);
  if (rbObjRespondTo(model, "isPersisted") && (model as { isPersisted(): boolean }).isPersisted()) {
    if (htmlOptions["method"] == null || htmlOptions["method"] === false) {
      htmlOptions["method"] = "patch";
    }
  }
  if (skipEnforcingUtf8 == null) {
    if (Object.hasOwn(options, "enforceUtf8")) {
      htmlOptions["enforceUtf8"] = options["enforceUtf8"];
    }
  } else {
    htmlOptions["enforceUtf8"] = skipEnforcingUtf8 === false;
  }
  return htmlOptionsForForm.call(this, urlForOptions == null ? {} : urlForOptions, htmlOptions);
}

/** @internal */
export function instantiateBuilder(
  this: FormHelperHost,
  recordName: unknown,
  recordObject: unknown,
  options: Record<string, unknown>,
): FormBuilder {
  let object: unknown;
  let objectName: string | null = null;
  if (typeof recordName === "string") {
    object = recordObject;
    objectName = recordName;
  } else {
    object = recordName;
    if (object != null && object !== false) {
      objectName = modelNameFromRecordOrClass(object).paramKey;
    }
  }

  const builder = (
    options["builder"] != null && options["builder"] !== false
      ? options["builder"]
      : defaultFormBuilderClass.call(this)
  ) as typeof FormBuilder;
  return new builder(objectName, object, this, options);
}

/** @internal */
export function defaultFormBuilderClass(this: FormHelperHost): typeof FormBuilder {
  const builder =
    this.defaultFormBuilder != null && this.defaultFormBuilder !== false
      ? this.defaultFormBuilder
      : (ActionView.Base as unknown as { defaultFormBuilder: unknown }).defaultFormBuilder;
  return (typeof builder === "string" ? constantize(builder) : builder) as typeof FormBuilder;
}

type FieldHelper = (method: unknown, options?: Record<string, unknown>) => unknown;

interface SubmitModel {
  isPersisted(): boolean;
  modelName: { human(): string; i18nKey: string };
}

export class FormBuilder {
  declare static fieldHelpers: string[];
  declare textField: FieldHelper;
  declare passwordField: FieldHelper;
  declare textarea: FieldHelper;
  declare textArea: FieldHelper;
  declare colorField: FieldHelper;
  declare searchField: FieldHelper;
  declare telephoneField: FieldHelper;
  declare phoneField: FieldHelper;
  declare dateField: FieldHelper;
  declare timeField: FieldHelper;
  declare datetimeField: FieldHelper;
  declare datetimeLocalField: FieldHelper;
  declare monthField: FieldHelper;
  declare weekField: FieldHelper;
  declare urlField: FieldHelper;
  declare emailField: FieldHelper;
  declare numberField: FieldHelper;
  declare rangeField: FieldHelper;

  static {
    classAttribute.call(this, "fieldHelpers", {
      default: [
        "fieldsFor",
        "fields",
        "label",
        "textField",
        "passwordField",
        "hiddenField",
        "fileField",
        "textarea",
        "checkbox",
        "radioButton",
        "colorField",
        "searchField",
        "telephoneField",
        "phoneField",
        "dateField",
        "timeField",
        "datetimeField",
        "datetimeLocalField",
        "monthField",
        "weekField",
        "urlField",
        "emailField",
        "numberField",
        "rangeField",
      ],
    });
  }

  declare private static __toPartialPath: string | null | undefined;
  objectName: string | null;
  object: unknown;
  options: Record<string, unknown>;
  private _multipart: unknown;
  readonly index: unknown;
  private _nestedChildIndex: Record<string, number>;
  private _template: FormHelperHost;
  private _defaultOptions: Record<string, unknown>;
  private _defaultHtmlOptions: Record<string, unknown>;
  private _autoIndex: unknown;
  private _emittedHiddenId: unknown;

  get multipart(): unknown {
    return this._multipart;
  }

  set multipart(multipart: unknown) {
    this._multipart = multipart;

    const parentBuilder = this.options["parentBuilder"] as FormBuilder | null | undefined;
    if (parentBuilder != null) {
      parentBuilder.multipart = multipart;
    }
  }

  isMultipart(): unknown {
    return this.multipart;
  }

  static _toPartialPath(): string | null {
    if (!Object.prototype.hasOwnProperty.call(this, "__toPartialPath")) {
      const name = underscore(demodulize(this.name));
      const partialPath = name.replace(/_builder$/, "");
      this.__toPartialPath = partialPath === name ? null : partialPath;
    }
    return this.__toPartialPath!;
  }

  toPartialPath(): string | null {
    return (this.constructor as typeof FormBuilder)._toPartialPath();
  }

  toModel(): this {
    return this;
  }

  constructor(
    objectName: string | null,
    object: unknown,
    template: unknown,
    options: Record<string, unknown>,
  ) {
    this._nestedChildIndex = {};
    this.objectName = objectName;
    this.object = object;
    this._template = template as FormHelperHost;
    this.options = options;
    this._defaultOptions = this.options
      ? slice(this.options, "index", "namespace", "skipDefaultIds", "allowMethodNamesOutsideObject")
      : {};
    this._defaultHtmlOptions = except(
      this._defaultOptions,
      "skipDefaultIds",
      "allowMethodNamesOutsideObject",
    );

    this.convertToLegacyOptions(this.options);

    if (this.objectName?.endsWith("[]")) {
      if (object == null || object === false) {
        object = (this._template as unknown as Record<string, unknown>)[
          this.objectName.slice(0, -2)
        ];
      }
      if (object != null && object !== false && rbObjRespondTo(object, "toParam")) {
        this._autoIndex = (object as { toParam(): unknown }).toParam();
      } else {
        throw new ArgumentError(
          `object[] naming but object param and @object var don't exist or don't respond to to_param: ${rbInspect(object)}`,
        );
      }
    }

    this._multipart = null;
    const index = options["index"];
    this.index = index != null && index !== false ? index : options["childIndex"];
  }

  id(): unknown {
    const html = this.options["html"] as Record<string, unknown> | null | undefined;
    const id = html?.["id"];
    return id != null && id !== false ? id : this.options["id"];
  }

  fieldId(method: unknown, ...suffixes: unknown[]): string {
    const kwargs = extractOptionsBang(suffixes);
    const namespace = fetch(
      kwargs,
      "namespace",
      block(() => this.options["namespace"]),
    );
    const index = fetch(
      kwargs,
      "index",
      block(() => this.options["index"]),
    );
    return this._template.fieldId(this.objectName, method, ...suffixes, {
      namespace: namespace,
      index: index,
    });
  }

  fieldName(method: unknown, ...methods: unknown[]): string {
    const kwargs = extractOptionsBang(methods);
    const multiple = fetch(kwargs, "multiple", false);
    const index = fetch(
      kwargs,
      "index",
      block(() => this.options["index"]),
    );
    const objectName = fetch(
      this.options,
      "as",
      block(() => this.objectName),
    );

    return this._template.fieldName(objectName, method, ...methods, {
      index: index,
      multiple: multiple,
    });
  }

  static {
    CodeGenerator.batch(this, __FILE__, __LINE__, (codeGenerator) => {
      const excluded = [
        "label",
        "checkbox",
        "radioButton",
        "fieldsFor",
        "fields",
        "hiddenField",
        "fileField",
      ];
      for (const selector of this.fieldHelpers.filter((helper) => !excluded.includes(helper))) {
        codeGenerator.classEval((batch) => {
          batch.push((proto) => {
            proto[selector] = function (
              this: FormBuilder,
              method: unknown,
              options: Record<string, unknown> = {},
            ): unknown {
              return (this._template as unknown as Record<string, (...args: unknown[]) => unknown>)[
                selector
              ].call(this._template, this.objectName, method, this.objectifyOptions(options));
            };
          });
        });
      }
    });
    this.prototype.textArea = this.prototype.textarea;
  }

  label(
    method: unknown,
    text: unknown = null,
    options: Record<string, unknown> = {},
    block?: (builder: LabelBuilder) => unknown,
  ): unknown {
    return this._template.label(
      this.objectName,
      method,
      text,
      this.objectifyOptions(options),
      block,
    );
  }

  hiddenField(method: unknown, options: Record<string, unknown> = {}): unknown {
    if (method === "id") this._emittedHiddenId = true;
    return this._template.hiddenField(this.objectName, method, this.objectifyOptions(options));
  }

  isEmittedHiddenId(): unknown {
    return (this._emittedHiddenId ??= null);
  }

  submit(
    value: unknown = null,
    options: Record<string, unknown> | Hash<string, unknown> = {},
  ): SafeBuffer {
    if (isPlainObject(value) || value instanceof Hash) {
      [value, options] = [null, value as Record<string, unknown> | Hash<string, unknown>];
    }
    if (value == null || value === false) value = this.submitDefaultValue();
    return this._template.submitTag(value, options);
  }

  private objectifyOptions(options: Record<string, unknown>): Record<string, unknown> {
    const result = merge(this._defaultOptions, options);
    result["object"] = this.object;
    return result;
  }

  private submitDefaultValue(): string {
    const object = convertToModel(this.object) as SubmitModel | null | false;
    const key =
      object != null && object !== false ? (object.isPersisted() ? "update" : "create") : "submit";

    const model = rbObjRespondTo(object, "modelName")
      ? (object as SubmitModel).modelName.human()
      : humanize(this.objectName ?? "");

    const defaults: string[] = [];
    if (rbObjRespondTo(object, "modelName") && (this.objectName ?? "") === model.toLowerCase()) {
      defaults.push(`:helpers.submit.${(object as SubmitModel).modelName.i18nKey}.${key}`);
    } else {
      defaults.push(`:helpers.submit.${this.objectName ?? ""}.${key}`);
    }
    defaults.push(`:helpers.submit.${key}`);
    defaults.push(`${humanize(key)} ${model}`);

    return I18n.t(defaults.shift(), { model: model, default: defaults }) as string;
  }

  private nestedChildIndex(name: string): number {
    this._nestedChildIndex[name] ??= -1;
    return (this._nestedChildIndex[name] += 1);
  }

  private convertToLegacyOptions(options: Record<string, unknown>): void {
    if (Object.hasOwn(options, "skipId")) {
      options["includeId"] = !hashDelete(options, "skipId");
    }
  }
}

onLoad("action_view", (base: unknown) => {
  cattrAccessor.call(base, "defaultFormBuilder", {
    instanceWriter: false,
    instanceReader: false,
    default: () => FormBuilder,
  });
});
