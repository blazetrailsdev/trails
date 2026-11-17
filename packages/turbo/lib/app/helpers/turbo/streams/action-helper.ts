import { htmlSafe, presence, wrap, type SafeBuffer } from "@blazetrails/activesupport";
import { TagHelper } from "@blazetrails/actionview/helpers/tag-helper.js";
import { RecordIdentifier } from "@blazetrails/actionview/record-identifier.js";
import { include, rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";

type Options = Record<string, unknown>;

interface ActionHelperHost {
  tag(): {
    template(content: unknown): SafeBuffer;
    turbo_stream(content: unknown, options: Options): SafeBuffer;
  };
  turboStreamActionTag(action: string, options?: Options): SafeBuffer;
  convertToTurboStreamDomId(target: unknown, options?: { includeSelector?: boolean }): unknown;
}

export const ActionHelper = {
  turboStreamActionTag(
    this: ActionHelperHost,
    action: string,
    { target = null, targets = null, template = null, ...attributes }: Options = {},
  ): SafeBuffer {
    template = ["remove", "refresh"].includes(String(action))
      ? ""
      : this.tag().template(htmlSafe(rbObjAsString(template)));

    if ((target = this.convertToTurboStreamDomId(target)) != null && target !== false) {
      return this.tag().turbo_stream(template, { ...attributes, action, target });
    } else if (
      (targets = this.convertToTurboStreamDomId(targets, { includeSelector: true })) != null &&
      targets !== false
    ) {
      return this.tag().turbo_stream(template, { ...attributes, action, targets });
    } else {
      return this.tag().turbo_stream(template, { ...attributes, action });
    }
  },

  turboStreamRefreshTag(this: ActionHelperHost, options: Options = {}): SafeBuffer {
    const { requestId = Turbo.currentRequestId, ...attributes } = options;
    return this.turboStreamActionTag("refresh", {
      "request-id": presence(requestId),
      ...attributes,
    });
  },

  /** @internal */
  convertToTurboStreamDomId(
    target: unknown,
    { includeSelector = false }: { includeSelector?: boolean } = {},
  ): unknown {
    const targetArray = wrap(target);
    if (
      targetArray.some((value) => rbObjRespondTo(value, "toKey") || typeof value === "function")
    ) {
      return `${includeSelector ? "#" : ""}${RecordIdentifier.domId(targetArray[0], (targetArray[1] as string | undefined) ?? null)}`;
    } else {
      return target;
    }
  },
};
include(ActionHelper, TagHelper);
Turbo.Streams.ActionHelper = ActionHelper;
