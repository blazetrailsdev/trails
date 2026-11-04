import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class StringJoin extends Join {}

constSet(Nodes, "StringJoin", StringJoin);
