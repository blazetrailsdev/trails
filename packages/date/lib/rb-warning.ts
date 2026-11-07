/** @noRailsEquivalent PERMANENT */

let rubyVerbose: boolean | null = false;

export function setRubyVerbose(value: boolean | null): void {
  rubyVerbose = value;
}

export function getRubyVerbose(): boolean | null {
  return rubyVerbose;
}

export function rbWarning(mesg: string): void {
  if (rubyVerbose !== true) return;
  console.warn(`warning: ${mesg}`);
}
