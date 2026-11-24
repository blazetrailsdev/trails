import { defineModule, included } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Trails } from "@blazetrails/trailties";

export const VersionHeaders = defineModule(
  {
    [included](base: typeof ActionController.Base): void {
      base.beforeAction(":setVersionHeaders");
    },
  },
  undefined,
  {
    setVersionHeaders(this: ActionController.Base): void {
      const config = Trails.application.config as unknown as {
        appVersion: string;
        gitRevision?: string;
      };
      this.response.headers["X-Version"] = config.appVersion;
      this.response.headers["X-Rev"] = config.gitRevision;
    },
  },
);
