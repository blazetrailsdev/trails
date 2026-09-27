import { SafeBuffer, constantize, cattrAccessor, onLoad } from "@blazetrails/activesupport";
import {
  ArgumentError,
  except,
  hashDelete,
  mergeBang,
  rbInspect,
  rbObjRespondTo,
  slice,
} from "@blazetrails/ruby-compat";

import { convertToModel, modelNameFromRecordOrClass } from "../model-naming.js";
import { ActionView } from "../namespaces.js";
import { capture, type CaptureHelperHost } from "./capture-helper.js";
import {
  formTagHtml,
  formTagWithBody,
  htmlOptionsForForm,
  type FormTagHelperHost,
} from "./form-tag-helper.js";

export interface FormHelperHost extends FormTagHelperHost, CaptureHelperHost {
  _defaultFormBuilder: unknown;
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

export function setFormWithGeneratesRemoteForms(value: boolean): void {
  formWithGeneratesRemoteForms = value;
}

export function setFormWithGeneratesIds(value: boolean): void {
  formWithGeneratesIds = value;
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
    scope ??= modelNameFromRecordOrClass(model).paramKey;
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
    (remote != null && remote !== false) || !(local != null && local !== false);
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

  const builder = (options["builder"] ?? defaultFormBuilderClass.call(this)) as typeof FormBuilder;
  return new builder(objectName, object, this, options);
}

/** @internal */
export function defaultFormBuilderClass(this: FormHelperHost): typeof FormBuilder {
  const builder =
    this._defaultFormBuilder ??
    (ActionView.Base as unknown as { defaultFormBuilder: unknown }).defaultFormBuilder;
  return (typeof builder === "string" ? constantize(builder) : builder) as typeof FormBuilder;
}

export class FormBuilder {
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
      object ??= (this._template as unknown as Record<string, unknown>)[
        this.objectName.slice(0, -2)
      ];
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
