import { TopLevel, constSet } from "@blazetrails/ruby-compat";

export class TrailsFirstAdapter {}
export class TrailsSecondAdapter {}

constSet(TopLevel, "TrailsFirstAdapter", TrailsFirstAdapter);
constSet(TopLevel, "TrailsSecondAdapter", TrailsSecondAdapter);
