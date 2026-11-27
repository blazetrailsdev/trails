import type { ActionController } from "@blazetrails/actionpack";
import { Current } from "../current.ts";

interface Host extends ActionController.Base {
  user?: { isCurrent(): boolean };
}

export const Authorization = {
  async ensureCanAdminister(this: Host): Promise<void> {
    if (!Current.user?.isCanAdminister()) await this.head(":forbidden");
  },

  async ensureCurrentUser(this: Host): Promise<void> {
    if (!this.user!.isCurrent()) await this.head(":forbidden");
  },
};
