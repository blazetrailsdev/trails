import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class StringJoin extends Join {}

rbSetClassPathString(StringJoin, Nodes, "StringJoin");
Nodes.StringJoin = StringJoin;
