import { rbModName } from "@blazetrails/ruby-compat/object";

export const RealModName = {
  realModName(mod: object): string | null {
    return rbModName(mod);
  },
};
