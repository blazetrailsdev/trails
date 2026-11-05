import { rbEnsure } from "@blazetrails/ruby-compat";
import { resetLocalTimeZoneId } from "@blazetrails/date";

export function withEnvTz<T>(newTz: string = "US/Eastern", block: () => T): T {
  const oldTz = resetLocalTimeZoneId(newTz);
  return rbEnsure(block, () => {
    resetLocalTimeZoneId(oldTz);
  });
}
