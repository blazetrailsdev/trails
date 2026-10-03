import { TopLevel } from "@blazetrails/activesupport";
import { Error, Errors } from "./error.js";
import { Engine } from "./engine.js";
import { Password } from "./password.js";

export { Error, Errors, Engine, Password };

const BCrypt = { name: "BCrypt", Error, Errors, Engine, Password };
TopLevel.BCrypt = BCrypt;
