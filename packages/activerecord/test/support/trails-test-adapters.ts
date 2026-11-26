import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";

export class TrailsFirstAdapter {}
export class TrailsSecondAdapter {}

constSet(TopLevel, "TrailsFirstAdapter", TrailsFirstAdapter);
constSet(TopLevel, "TrailsSecondAdapter", TrailsSecondAdapter);
