import { defineModule, extend, hours, included } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import type { User } from "../user.ts";

export const TRANSFER_LINK_EXPIRY_DURATION = hours(4);

export const ClassMethods = {
  async findByTransferId(this: typeof User, id: string): Promise<User | null> {
    return (await this.findSigned(id, { purpose: "transfer" })) as User | null;
  },
};

export const Transferable = defineModule({
  [included](base: typeof Base): void {
    extend(base, ClassMethods);
  },

  transferId(this: User): string {
    return this.signedId({ purpose: "transfer", expiresIn: TRANSFER_LINK_EXPIRY_DURATION });
  },
});
