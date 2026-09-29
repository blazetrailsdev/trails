import { isPresent } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

import { ActionView } from "../namespaces.js";
import { contentTag, tag, type TagHelperHost } from "./tag-helper.js";

export class ActiveModelInstanceTag {
  declare object: unknown;
  declare protected _methodName: string;
  declare protected _templateObject: unknown;

  contentTag(
    type: string,
    options: unknown,
    ...args: [options?: Record<string, unknown> | null, escape?: boolean, block?: () => unknown]
  ): unknown {
    return this.isSelectMarkupHelper(type)
      ? contentTag.call(this as unknown as TagHelperHost, type, options, ...args)
      : this.errorWrapping(
          contentTag.call(this as unknown as TagHelperHost, type, options, ...args),
        );
  }

  tag(type: string, options: Record<string, unknown>, ...args: unknown[]): unknown {
    return this.isTagGenerateErrors(options)
      ? this.errorWrapping(
          tag.call(this as unknown as TagHelperHost, type, options, ...(args as [])),
        )
      : tag.call(this as unknown as TagHelperHost, type, options, ...(args as []));
  }

  errorWrapping(htmlTag: unknown): unknown {
    if (this.isObjectHasErrors()) {
      return ActionView.Base.fieldErrorProc.call(
        this._templateObject as InstanceType<typeof ActionView.Base>,
        htmlTag,
        this,
      );
    } else {
      return htmlTag;
    }
  }

  errorMessage(): unknown {
    return (this.object as { errors: { get(attribute: string): unknown } }).errors.get(
      this._methodName,
    );
  }

  private isObjectHasErrors(): boolean {
    return (
      rbObjRespondTo(this.object, "errors") &&
      rbObjRespondTo((this.object as { errors: unknown }).errors, "get") &&
      isPresent(this.errorMessage())
    );
  }

  private isSelectMarkupHelper(type: string): boolean {
    return ["optgroup", "option"].includes(type);
  }

  private isTagGenerateErrors(options: Record<string, unknown>): boolean {
    return options["type"] !== "hidden";
  }
}
