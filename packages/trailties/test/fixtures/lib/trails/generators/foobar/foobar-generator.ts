import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../../../../../lib/generators/base.js";

export const Foobar = constSet(TopLevel, "Foobar", {});

export class FoobarGenerator extends Base {}
constSet(Foobar, "FoobarGenerator", FoobarGenerator);
