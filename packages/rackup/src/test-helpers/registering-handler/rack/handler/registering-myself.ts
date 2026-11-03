import { Handler } from "../../../../handler.js";

export class RegisteringMyself {}

Object.assign(Handler, { RegisteringMyself });

Handler.register("registering_myself", RegisteringMyself);
