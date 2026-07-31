export type BootArm = "fastPath" | "fullLoad";

export interface BootOutcome {
  arm: BootArm;
  stamped: boolean;
}

let outcome: BootOutcome | null = null;

export function recordBootOutcome(arm: BootArm, stamped: boolean): void {
  outcome = { arm, stamped };
}

export function bootOutcome(): BootOutcome | null {
  return outcome;
}
