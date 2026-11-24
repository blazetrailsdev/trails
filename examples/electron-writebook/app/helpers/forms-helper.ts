import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const FormsHelper = {
  autoSubmitFormWith(this: ViewHost, attributes: Record<string, unknown> = {}, block?: unknown) {
    const { data = {}, ...rest } = attributes as { data?: Record<string, unknown> };
    data.controller = `auto-submit ${data.controller ?? ""}`.trim();

    return this.formWith({ ...rest, data }, block);
  },
};
