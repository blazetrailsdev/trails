// vendor/rails/activerecord/test/models/human.rb
import { Base } from "../../base.js";

export class Human extends Base {
  static _tableName = "humans";

  declare addCallbackCalled: boolean;

  static {
    this.hasOne("face", { inverseOf: "human" });
    this.hasOne("autosaveFace", { className: "Face", autosave: true, inverseOf: "autosaveHuman" });
    this.hasOne("polymorphicFace", {
      className: "Face",
      as: "polymorphicHuman",
      inverseOf: "polymorphicHuman",
    });
    this.hasOne("polymorphicFaceWithoutInverse", {
      className: "Face",
      as: "polyHumanWithoutInverse",
    });
    this.hasMany("interests", { inverseOf: "human" });
    this.hasMany("interestsWithCallbacks", {
      className: "Interest",
      beforeAdd: (owner: any, r: any) => owner.addCalled(r),
      afterAdd: (owner: any, r: any) => owner.addCalled(r),
      inverseOf: "humanWithCallbacks",
    });
    this.hasMany("polymorphicInterests", {
      className: "Interest",
      as: "polymorphicHuman",
      inverseOf: "polymorphicHuman",
    });
    this.hasMany("polymorphicInterestsWithCallbacks", {
      className: "Interest",
      as: "polymorphicHuman",
      beforeAdd: (owner: any, r: any) => owner.addCalled(r),
      afterAdd: (owner: any, r: any) => owner.addCalled(r),
      inverseOf: "polymorphicHuman",
    });
    this.hasOne("confusedFace", { className: "Face", inverseOf: "cnffusedHuman" });
    this.hasMany("secretInterests", { className: "Interest", inverseOf: "secretHuman" });
    this.hasOne("mixedCaseMonkey");

    this.attribute("addCallbackCalled", "boolean", { default: false });
  }

  addCalled(_interest: unknown) {
    this.addCallbackCalled = true;
  }
}

export class SuperHuman extends Human {}
