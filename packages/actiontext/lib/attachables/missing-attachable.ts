import { Naming } from "@blazetrails/activemodel";
import { extend, safeConstantize } from "@blazetrails/activesupport";
import { SignedGlobalID } from "@blazetrails/globalid";
import { toS } from "@blazetrails/ruby-compat";
import { ActionText } from "../action-text.js";

export class MissingAttachable {
  static {
    extend(this, Naming);
  }

  static readonly DEFAULT_PARTIAL_PATH = "action_text/attachables/missing_attachable";

  /** @internal */
  private readonly sgid: SignedGlobalID | null;

  constructor(sgid: unknown) {
    this.sgid = SignedGlobalID.parse(sgid as string, { for: ActionText.Attachable!.LOCATOR_NAME });
  }

  toPartialPath(): string {
    const model = this.model();
    if (model != null) {
      return (
        model as { toMissingAttachablePartialPath(): string }
      ).toMissingAttachablePartialPath();
    } else {
      return MissingAttachable.DEFAULT_PARTIAL_PATH;
    }
  }

  model(): unknown {
    return safeConstantize(toS(this.sgid?.modelName));
  }
}

ActionText.Attachables.MissingAttachable = MissingAttachable;
