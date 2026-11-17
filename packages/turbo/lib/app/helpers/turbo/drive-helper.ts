import { ArgumentError, type SafeBuffer } from "@blazetrails/activesupport";
import { Turbo } from "../../../turbo-trails.js";

interface DriveHelperHost {
  provide(name: string, content?: unknown): SafeBuffer | null;
  tag(): { meta(options: Record<string, unknown>): SafeBuffer };
  turboExemptsPageFromCacheTag(): SafeBuffer;
  turboExemptsPageFromPreviewTag(): SafeBuffer;
  turboPageRequiresReloadTag(): SafeBuffer;
  turboRefreshMethodTag(method?: string): SafeBuffer;
  turboRefreshScrollTag(scroll?: string): SafeBuffer;
}

export const DriveHelper = {
  turboExemptsPageFromCache(this: DriveHelperHost): SafeBuffer | null {
    return this.provide("head", this.turboExemptsPageFromCacheTag());
  },

  turboExemptsPageFromCacheTag(this: DriveHelperHost): SafeBuffer {
    return this.tag().meta({ name: "turbo-cache-control", content: "no-cache" });
  },

  turboExemptsPageFromPreview(this: DriveHelperHost): SafeBuffer | null {
    return this.provide("head", this.turboExemptsPageFromPreviewTag());
  },

  turboExemptsPageFromPreviewTag(this: DriveHelperHost): SafeBuffer {
    return this.tag().meta({ name: "turbo-cache-control", content: "no-preview" });
  },

  turboPageRequiresReload(this: DriveHelperHost): SafeBuffer | null {
    return this.provide("head", this.turboPageRequiresReloadTag());
  },

  turboPageRequiresReloadTag(this: DriveHelperHost): SafeBuffer {
    return this.tag().meta({ name: "turbo-visit-control", content: "reload" });
  },

  turboRefreshesWith(
    this: DriveHelperHost,
    { method = "replace", scroll = "reset" }: { method?: string; scroll?: string } = {},
  ): SafeBuffer | null {
    this.provide("head", this.turboRefreshMethodTag(method));
    return this.provide("head", this.turboRefreshScrollTag(scroll));
  },

  turboRefreshMethodTag(this: DriveHelperHost, method: string = "replace"): SafeBuffer {
    if (!["replace", "morph"].includes(String(method)))
      throw new ArgumentError(`Invalid refresh option '${method}'`);
    return this.tag().meta({ name: "turbo-refresh-method", content: method });
  },

  turboRefreshScrollTag(this: DriveHelperHost, scroll: string = "reset"): SafeBuffer {
    if (!["reset", "preserve"].includes(String(scroll)))
      throw new ArgumentError(`Invalid scroll option '${scroll}'`);
    return this.tag().meta({ name: "turbo-refresh-scroll", content: scroll });
  },
};
Turbo.DriveHelper = DriveHelper;
