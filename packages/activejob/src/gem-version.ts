import { Gem, Module, compact, aryJoin, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function gemVersion(): any {
  return new Gem.Version(STRING);
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { gemVersion });
export const MAJOR: any = 8;

export const MINOR: any = 0;

export const TINY: any = 2;

export const PRE: any = null;

export const STRING: any = aryJoin(compact([MAJOR, MINOR, TINY, PRE]), ".");

export const VERSION: any = new Module();
rbModConstSet(VERSION, "MAJOR", MAJOR);
rbModConstSet(VERSION, "MINOR", MINOR);
rbModConstSet(VERSION, "TINY", TINY);
rbModConstSet(VERSION, "PRE", PRE);
rbModConstSet(VERSION, "STRING", STRING);
rbModConstSet(ActiveJobSeat, "VERSION", VERSION);
