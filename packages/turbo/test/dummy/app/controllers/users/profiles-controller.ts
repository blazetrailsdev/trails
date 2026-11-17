import { constSet } from "@blazetrails/ruby-compat";
import { Profile, Users } from "../../models/users/profile.js";
import { ApplicationController } from "../application-controller.js";

export class ProfilesController extends ApplicationController {
  declare profile: Profile;

  show(): void {
    this.profile = new Profile({ id: 1, name: "David" });
  }
}
constSet(Users, "ProfilesController", ProfilesController);
