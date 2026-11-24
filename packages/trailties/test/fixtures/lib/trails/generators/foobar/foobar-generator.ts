import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../../../../lib/generators/base.js";

export const Foobar = constSet(TopLevel, "Foobar", {});

export class FoobarGenerator extends Base {}
constSet(Foobar, "FoobarGenerator", FoobarGenerator);
