import { NoMethodError, registerConstant, toI } from "@blazetrails/ruby-compat";
import {
  TopLevel,
  days,
  deepTransformValues,
  hours,
  isPresent,
  minutes,
  seconds,
  weeks,
  type Duration,
} from "@blazetrails/activesupport";

const DURATION_UNITS: Record<string, (n: number) => Duration> = {
  second: seconds,
  seconds,
  minute: minutes,
  minutes,
  hour: hours,
  hours,
  day: days,
  days,
  week: weeks,
  weeks,
};

type CableConfig = Record<string, unknown> & { connectsTo?: Record<string, unknown> | null };

export const SolidCable = {
  name: "SolidCable",

  async connectsTo(): Promise<Record<string, unknown>> {
    return deepTransformValues({ ...(await cableConfig()).connectsTo }, (value) =>
      String(value),
    ) as Record<string, unknown>;
  },

  async isSilencePolling(): Promise<boolean> {
    return (await cableConfig()).silencePolling !== false;
  },

  /** @missingRailsArgs seconds — PERMANENT */
  async pollingInterval(): Promise<Duration> {
    return parseDuration((await cableConfig()).pollingInterval, { default: seconds(0.1) });
  },

  async messageRetention(): Promise<Duration> {
    return parseDuration((await cableConfig()).messageRetention, { default: days(1) });
  },

  async isAutotrim(): Promise<boolean> {
    return (await cableConfig()).autotrim !== false;
  },

  async trimBatchSize(): Promise<number> {
    let size: number;
    if ((size = Number(toI((await cableConfig()).trimBatchSize))) < 2) {
      return 100;
    } else {
      return size;
    }
  },

  async useSkipLocked(): Promise<boolean> {
    return (await cableConfig()).useSkipLocked !== false;
  },

  trimChance(): number {
    return 2;
  },
};

/** @internal */
async function cableConfig(): Promise<CableConfig> {
  return (await TopLevel.Trails!.application!.configFor("cable")) as CableConfig;
}

/** @internal */
function parseDuration(duration: unknown, { default: default_ }: { default: Duration }): Duration {
  if (isPresent(duration)) {
    const parts = String(duration).split(".");
    const units = parts.pop()!;
    const amount = parts;
    const amountF = parseFloat(amount.join(".")) || 0;
    if (!Object.hasOwn(DURATION_UNITS, units)) {
      throw new NoMethodError(`undefined method '${units}' for an instance of Float`);
    }
    return DURATION_UNITS[units](amountF);
  } else {
    return default_;
  }
}

registerConstant("SolidCable", SolidCable);
