import { IO } from "@blazetrails/ruby-compat";
import { _setUnicodeTables, UnicodeDatabase } from "./unicode.js";

_setUnicodeTables(await IO.binreadAsync(UnicodeDatabase.filename()).catch((e: Error) => e));
