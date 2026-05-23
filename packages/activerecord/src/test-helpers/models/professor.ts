// vendor/rails/activerecord/test/models/professor.rb
import { ARUnit2Model } from "./arunit2-model.js";

export class Professor extends ARUnit2Model {
  static {
    this.hasAndBelongsToMany("courses");
  }
}
