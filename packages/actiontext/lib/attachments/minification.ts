import { Concern, extend, type Extended } from "@blazetrails/activesupport";
import { ActionText } from "../action-text.js";
import { Fragment } from "../fragment.js";

export const Minification = {} as Extended<typeof Concern>;
extend(Minification, Concern);

Minification.classMethods((mod) => {
  mod.fragmentByMinifyingAttachments = function (content: unknown): Fragment {
    return Fragment.wrap(content).replace(ActionText.Attachment!.tagName, (node) => {
      node.setInnerHtml("");
      return node;
    });
  };
});

ActionText.Attachments.Minification = Minification;
