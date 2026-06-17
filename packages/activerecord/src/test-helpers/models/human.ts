import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Face } from "./face.js";
import type { Interest } from "./interest.js";
import type { MixedCaseMonkey } from "./mixed-case-monkey.js";
// vendor/rails/activerecord/test/models/human.rb
import { Base } from "../../base.js";

export class Human extends Base {
  declare face: Face | null;
  declare autosaveFace: Face | null;
  declare polymorphicFace: Face | null;
  declare polymorphicFaceWithoutInverse: Face | null;
  declare interests: AssociationProxy<Interest>;
  declare interestsWithCallbacks: AssociationProxy<Interest>;
  declare polymorphicInterests: AssociationProxy<Interest>;
  declare polymorphicInterestsWithCallbacks: AssociationProxy<Interest>;
  declare confusedFace: Face | null;
  declare secretInterests: AssociationProxy<Interest>;
  declare mixedCaseMonkey: MixedCaseMonkey | null;
  declare loadHasOne: ((name: "face") => Promise<Face | null>) &
    ((name: "autosaveFace") => Promise<Face | null>) &
    ((name: "polymorphicFace") => Promise<Face | null>) &
    ((name: "polymorphicFaceWithoutInverse") => Promise<Face | null>) &
    ((name: "confusedFace") => Promise<Face | null>) &
    ((name: "mixedCaseMonkey") => Promise<MixedCaseMonkey | null>);

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

    this.attribute("addCallbackCalled", "boolean", { default: false, virtual: true });
  }

  addCalled(_interest: unknown) {
    this.addCallbackCalled = true;
  }
}

export class SuperHuman extends Human {}
