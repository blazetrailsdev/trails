import { defineModule, included } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import type { User } from "../user.ts";

export const Role = defineModule({
  [included](base: typeof Base): void {
    base.enum("role", ["member", "administrator"], { default: "member" });
  },

  isCanAdminister(this: User): boolean {
    return this.isAdministrator();
  },
});
