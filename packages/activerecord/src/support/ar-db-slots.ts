import { getOs } from "@blazetrails/activesupport";
import { DEFAULT_FORKS, resolveForkCount } from "./ar-db-forks-default.js";

const SLOT_HEADROOM = 2;

export { DEFAULT_FORKS };

function hostForkCap(): number | null {
  try {
    return Math.max(getOs().availableParallelism() - 1, 1);
  } catch {
    return null;
  }
}

export function workerForkCount(): number {
  return resolveForkCount(process.env, hostForkCap());
}

export function slotPoolSize(): number {
  const workers = workerForkCount();
  const override = parseInt(process.env.AR_DB_SLOTS ?? "", 10);
  if (Number.isFinite(override) && override > 0) return Math.max(override, workers + 1);
  return workers + SLOT_HEADROOM;
}
