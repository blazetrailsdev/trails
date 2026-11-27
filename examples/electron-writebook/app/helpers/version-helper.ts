import type { SafeBuffer } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const VersionHelper = {
  versionBadge(this: ViewHost): SafeBuffer {
    const config = Trails.application.config as unknown as { appVersion: string };
    return this.tag().span(config.appVersion, { class: "product__version-badge" });
  },
};
