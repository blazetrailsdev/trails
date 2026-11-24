import { defineModule, included } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { User } from "../../models/user.ts";

export const UserScoped = defineModule(
  {
    [included](base: typeof ActionController.Base): void {
      base.beforeAction(":setUser");
    },
  },
  undefined,
  {
    async setUser(this: ActionController.Base & { user: User }): Promise<void> {
      this.user = await User.active().find(this.params.get("user_id"));
    },
  },
);
