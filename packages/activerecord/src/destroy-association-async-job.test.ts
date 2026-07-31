// vendor/rails/activerecord/test/activejob/destroy_association_async_job_test.rb
import { NameError, registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import { afterAll, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { ConfigurationError } from "./errors.js";

class UndefinedConstantAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob("UndefinedConstantJob");
  }
}

class UnusedBelongsToAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob(null);
  }
}

class UnusedHasOneAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob(null);
  }
}

class UnusedHasManyAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob(null);
  }
}

class ResolvableJob {}

class ResolvableJobAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob("ResolvableJob");
  }
}

describe("DestroyAssociationAsyncJobTest", () => {
  afterAll(() => {
    unregisterConstant("ResolvableJob", ResolvableJob);
  });

  it("destroy_association_async_job requires valid job class", () => {
    let error: unknown;
    try {
      UndefinedConstantAsync.belongsTo("essayDestroyAsync", { dependent: "destroyAsync" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(NameError);
    expect((error as Error).message).toMatch(
      /destroy_association_async_job: uninitialized constant UndefinedConstantJob/,
    );
  });

  it("belongs_to dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    try {
      UnusedBelongsToAsync.belongsTo("essayDestroyAsync", { dependent: "destroyAsync" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(/destroyAssociationAsyncJob/);
  });

  it("has_one dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    try {
      UnusedHasOneAsync.hasOne("essayDestroyAsync", { dependent: "destroyAsync" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(/destroyAssociationAsyncJob/);
  });

  it("has_many dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    try {
      UnusedHasManyAsync.hasMany("essayDestroyAsyncs", { dependent: "destroyAsync" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(/destroyAssociationAsyncJob/);
  });

  it("resolves a job configured by name and caches the class", () => {
    registerConstant("ResolvableJob", ResolvableJob);
    expect(ResolvableJobAsync.destroyAssociationAsyncJob()).toBe(ResolvableJob);
    expect(ResolvableJobAsync._destroyAssociationAsyncJob).toBe(ResolvableJob);
    expect(() =>
      ResolvableJobAsync.hasMany("essayDestroyAsyncs", { dependent: "destroyAsync" }),
    ).not.toThrow();
  });
});
