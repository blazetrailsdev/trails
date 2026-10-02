import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class StringJoin extends Join {}

rbModConstSet(Nodes, "StringJoin", StringJoin);
