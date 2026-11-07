import { Handler } from "../../../../../lib/handler.js";

export class RegisteringMyself {}

Object.assign(Handler, { RegisteringMyself });

Handler.register("registering_myself", RegisteringMyself);
