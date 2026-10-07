import { registerConstant } from "@blazetrails/ruby-compat";

export class TrailsFirstAdapter {}
export class TrailsSecondAdapter {}

registerConstant("TrailsFirstAdapter", TrailsFirstAdapter);
registerConstant("TrailsSecondAdapter", TrailsSecondAdapter);
