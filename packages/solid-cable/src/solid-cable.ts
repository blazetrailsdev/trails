import { NoMethodError, RuntimeError, registerConstant, toI } from "@blazetrails/ruby-compat";
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

  connectsTo(): Record<string, unknown> {
    return deepTransformValues({ ...cableConfig().connectsTo }, (value) => {
      if (value == null) throw new NoMethodError("undefined method 'to_sym' for nil");
      return String(value);
    }) as Record<string, unknown>;
  },

  isSilencePolling(): boolean {
    return cableConfig().silencePolling !== false;
  },

  /** @missingRailsArgs seconds — PERMANENT */
  pollingInterval(): Duration {
    return parseDuration(cableConfig().pollingInterval, { default: seconds(0.1) });
  },

  messageRetention(): Duration {
    return parseDuration(cableConfig().messageRetention, { default: days(1) });
  },

  isAutotrim(): boolean {
    return cableConfig().autotrim !== false;
  },

  trimBatchSize(): number {
    let size: number;
    if ((size = Number(toI(cableConfig().trimBatchSize))) < 2) {
      return 100;
    } else {
      return size;
    }
  },

  useSkipLocked(): boolean {
    return cableConfig().useSkipLocked !== false;
  },

  trimChance(): number {
    return 2;
  },

  /** @noRailsEquivalent PERMANENT */
  async loadCableConfig(): Promise<void> {
    if (TopLevel.Trails?.application == null) {
      loadedCableConfig = null;
      return;
    }
    try {
      loadedCableConfig = {
        config: (await TopLevel.Trails.application.configFor("cable")) as CableConfig,
      };
    } catch (error) {
      loadedCableConfig = { error };
    }
  },
};

let loadedCableConfig: { config: CableConfig } | { error: unknown } | null = null;

/** @internal */
function cableConfig(): CableConfig {
  if (loadedCableConfig === null) {
    throw new RuntimeError("Could not load configuration. No such file - config/cable.ts");
  }
  if ("error" in loadedCableConfig) throw loadedCableConfig.error;
  return loadedCableConfig.config;
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
