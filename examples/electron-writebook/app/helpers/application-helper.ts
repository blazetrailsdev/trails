import { htmlSafe, isPresent, type SafeBuffer } from "@blazetrails/activesupport";
import { block as markBlock } from "@blazetrails/ruby-compat";
import { Current } from "../models/current.ts";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const ApplicationHelper = {
  /** @noRailsEquivalent PERMANENT */
  computeAssetPath(source: string): string {
    return `/assets/${source}`;
  },

  /** @noRailsEquivalent CONVERGEABLE tse-views-reach-core-ext-predicates */
  isPresent(value: unknown): boolean {
    return isPresent(value);
  },

  /** @noRailsEquivalent CONVERGEABLE tse-compiler-marks-template-blocks */
  block<F extends (...args: never[]) => unknown>(fn: F): F {
    return markBlock(fn);
  },

  hideFromUserStyleTag(this: ViewHost): SafeBuffer {
    return this.tag().style(
      htmlSafe(`[data-hide-from-user-id="${Current.user!.id}"] {
  display: none!important;
}
`),
    );
  },

  async customStylesTag(this: ViewHost): Promise<SafeBuffer | undefined> {
    const customStyles = (await Current.account())?.custom_styles;
    if (customStyles) {
      return this.tag().style(htmlSafe(String(customStyles)), { data: { turboTrack: "reload" } });
    }
  },
};
