import { defineModule } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { SessionLookup } from "./authentication/session-lookup.ts";

type Host = ActionController.Base & typeof SessionLookup;

export const ActiveStorageAuthentication = defineModule({}, undefined, {
  ...SessionLookup,

  async requireActiveStorageAuthentication(this: Host): Promise<void> {
    if (!(await this.findSessionByCookie())) await this.head(":unauthorized");
  },
});
