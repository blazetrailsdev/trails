import { RuntimeError, TopLevel, constSet } from "@blazetrails/ruby-compat";

export class ExpectedTestError extends RuntimeError {}
constSet(TopLevel, "ExpectedTestError", ExpectedTestError);
