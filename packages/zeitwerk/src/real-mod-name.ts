import { rbModName } from "@blazetrails/ruby-compat";

export const RealModName = {
  realModName(mod: object): string | null {
    return rbModName(mod);
  },
};
