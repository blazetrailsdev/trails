import { resetLocalTimeZoneId } from "@blazetrails/date";

export function withEnvTz<T>(newTz: string = "US/Eastern", block: () => T): T {
  const oldTz = resetLocalTimeZoneId(newTz);
  try {
    return block();
  } finally {
    resetLocalTimeZoneId(oldTz);
  }
}
