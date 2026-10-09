import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class UserWithInvalidRelation extends Base {
  static {
    this.hasOne("notAClass");
    this.hasOne("classNameProvidedNotAClass", { className: "NotAClass" });
    this.hasOne("accountInvalid");
    this.hasOne("accountClassName", { className: "AccountInvalid" });

    this.hasMany("userInfoInvalid");
    this.hasMany("infoInvalids", { through: "userInfoInvalid" });

    this.hasMany("infosClassName", { through: "userInfo", className: "InfoInvalid" });

    this.hasMany("userInfosClassName", { className: "UserInfoInvalid" });
    this.hasMany("infosThroughClassName", {
      through: "userInfosClassName",
      className: "InfoInvalid",
    });
  }
}
registerConstant("UserWithInvalidRelation", UserWithInvalidRelation);

export class AccountInvalid {}
registerConstant("AccountInvalid", AccountInvalid);

export class InfoInvalid {}
registerConstant("InfoInvalid", InfoInvalid);

export class UserInfoInvalid extends Base {
  static {
    this.belongsTo("infoInvalid");
    this.belongsTo("userInvalid");
  }
}
registerConstant("UserInfoInvalid", UserInfoInvalid);
