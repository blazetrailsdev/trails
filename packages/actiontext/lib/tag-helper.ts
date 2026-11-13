import {
  delegate,
  humanize,
  mattrAccessor,
  stringifyKeys,
  tryCall,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { FormBuilder, FormHelper } from "@blazetrails/actionview/helpers/form-helper.js";
import { Base } from "@blazetrails/actionview/helpers/tags/base.js";
import { Placeholderable } from "@blazetrails/actionview/helpers/tags/placeholderable.js";
import { Translator } from "@blazetrails/actionview/helpers/tags/translator.js";
import { Tags } from "@blazetrails/actionview/namespaces.js";
import { ActionText as ActionTextNamespace } from "./action-text.js";
import { block, classModule, except, fetch, hashDelete, include } from "@blazetrails/ruby-compat";

type Options = Record<string, unknown>;

type MainApp = {
  trailsDirectUploadsUrl(): unknown;
  trailsServiceBlobUrl(signedId: string, filename: string): unknown;
};

type TagHelperHost = {
  mainApp: MainApp;
  contentTag(name: string, content: unknown, options: Options): SafeBuffer;
  hiddenFieldTag(name: unknown, value: unknown, options: Options): SafeBuffer;
};

type RichTextareaHost = {
  richTextareaTag(name: unknown, value: unknown, options: Options): Promise<SafeBuffer>;
};

export class TagHelper {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare static id: number;

  static {
    mattrAccessor.call(this, "id", { instanceAccessor: false, default: () => 0 });
  }

  /** @missingRailsArgs rails_service_blob_url — PERMANENT */
  async richTextareaTag(
    this: TagHelperHost,
    name: unknown,
    value: unknown = null,
    options: Options = {},
  ): Promise<SafeBuffer> {
    options = { ...options };
    const form = hashDelete(options, "form");

    if (options["input"] == null || options["input"] === false)
      options["input"] = `trix_input_${(TagHelper.id += 1)}`;
    if (options["class"] == null || options["class"] === false) options["class"] = "trix-content";

    if (options["data"] == null || options["data"] === false) options["data"] = {};
    const data = options["data"] as Options;
    if (data["direct_upload_url"] == null || data["direct_upload_url"] === false) {
      data["direct_upload_url"] = this.mainApp.trailsDirectUploadsUrl();
    }
    if (data["blob_url_template"] == null || data["blob_url_template"] === false) {
      data["blob_url_template"] = this.mainApp.trailsServiceBlobUrl("::signed_id", "::filename");
    }

    const editorTag = this.contentTag("trix-editor", "", options);
    const trixHtml = await tryCall(value as object, "toTrixHtml");
    const inputTag = this.hiddenFieldTag(
      name,
      trixHtml != null && trixHtml !== false ? trixHtml : value,
      {
        id: options["input"],
        form,
      },
    );

    return inputTag.plus(editorTag);
  }

  declare richTextAreaTag: TagHelper["richTextareaTag"];
}

TagHelper.prototype.richTextAreaTag = TagHelper.prototype.richTextareaTag;

ActionTextNamespace.TagHelper = TagHelper;

export class ActionText extends Base {
  declare domId: (recordOrClass: unknown, prefix?: string | null) => string;

  /** @inlinedFrom ActionView::Helpers::Tags::Placeholderable#initialize rails/v8.0.2/actionview/lib/action_view/helpers/tags/placeholderable.rb:7-20 */
  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Options = {},
  ) {
    super(objectName, methodName, templateObject, options);

    const tagValue = this._options["placeholder"];
    if (tagValue != null && tagValue !== false) {
      const isSymbol = typeof tagValue === "string" && tagValue.startsWith(":");
      let placeholder: unknown = typeof tagValue === "string" && !isSymbol ? tagValue : null;
      const methodAndValue =
        tagValue === true
          ? this._methodName
          : `${this._methodName}.${isSymbol ? tagValue.slice(1) : tagValue}`;

      placeholder ??= new Translator(this.object, this._objectName, methodAndValue, {
        scope: "helpers.placeholder",
      }).translate();
      placeholder ??= humanize(this._methodName);
      this._options["placeholder"] = placeholder;
    }
  }

  override async render(): Promise<unknown> {
    const options = stringifyKeys(this._options);
    this.addDefaultNameAndId(options);
    if (this.object != null && this.object !== false) {
      if (options["input"] == null || options["input"] === false) {
        options["input"] = this.domId(
          this.object,
          [options["id"], "trix_input"].filter((x) => x != null).join("_"),
        );
      }
    }
    const htmlTag = await (this._templateObject as unknown as RichTextareaHost).richTextareaTag(
      hashDelete(options, "name"),
      fetch(
        options,
        "value",
        block(() => this.value()),
      ),
      except(options, "value"),
    );
    return this.errorWrapping(htmlTag);
  }
}

include(ActionText, Placeholderable);
delegate.call(ActionText.prototype, "domId", { to: "::ActionView::RecordIdentifier" });

(Tags as unknown as { ActionText: typeof ActionText }).ActionText = ActionText;

type FormBuilderHost = {
  _template: {
    richTextarea(objectName: unknown, method: unknown, options: Options): Promise<unknown>;
  };
  objectName: unknown;
  objectifyOptions(options: Options): Options;
};

const FormHelperRichTextarea = {
  richTextarea(
    this: unknown,
    objectName: unknown,
    method: unknown,
    options: Options = {},
  ): Promise<unknown> {
    return new (Tags as unknown as { ActionText: typeof ActionText }).ActionText(
      objectName,
      method,
      this,
      options,
    ).render();
  },
};
Object.assign(FormHelper.prototype, FormHelperRichTextarea, {
  richTextArea: FormHelperRichTextarea.richTextarea,
});

const FormBuilderRichTextarea = {
  richTextarea(this: FormBuilderHost, method: unknown, options: Options = {}): Promise<unknown> {
    return this._template.richTextarea(this.objectName, method, this.objectifyOptions(options));
  },
};
Object.assign(FormBuilder.prototype, FormBuilderRichTextarea, {
  richTextArea: FormBuilderRichTextarea.richTextarea,
});
