import { NameError } from "@blazetrails/activesupport";
import { registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { afterAll, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { ConfigurationError } from "./errors.js";

class UndefinedConstantAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = "UndefinedConstantJob";
  }
}

class UnloadableBaseAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = "UnloadableBaseJob";
  }
}

class UnusedBelongsToAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = null;
  }
}

class UnusedHasOneAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = null;
  }
}

class UnusedHasManyAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = null;
  }
}

class ResolvableJob {}

class ResolvableJobAsync extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob = "ResolvableJob";
  }
}

describe("DestroyAssociationAsyncJobTest", () => {
  afterAll(() => {
    unregisterConstant("ResolvableJob", ResolvableJob);
  });

  it("destroy_association_async_job requires valid job class", () => {
    let error: unknown;
    expect(() => {
      try {
        UndefinedConstantAsync.belongsTo("essayDestroyAsync", { dependent: "destroyAsync" });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(NameError);
    expect((error as Error).message).toMatch(
      /destroy_association_async_job: uninitialized constant UndefinedConstantJob/,
    );
  });

  // PERMANENT-SKIP: Rails' `autoload :UnloadableBaseJob` defers evaluating a class
  it.skip("destroy_association_async_job error shows a missing parent job class, as if ActiveJob were missing", () => {
    expect(() =>
      UnloadableBaseAsync.belongsTo("essayDestroyAsync", { dependent: "destroyAsync" }),
    ).toThrow(/destroy_association_async_job: uninitialized constant PretendActiveJobIsNotPresent/);
  });

  it("belongs_to dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    expect(() => {
      try {
        UnusedBelongsToAsync.belongsTo("essayDestroyAsync", { dependent: "destroyAsync" });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ConfigurationError);
    expect((error as Error).message).toMatch(/destroy_association_async_job/);
  });

  it("has_one dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    expect(() => {
      try {
        UnusedHasOneAsync.hasOne("essayDestroyAsync", { dependent: "destroyAsync" });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ConfigurationError);
    expect((error as Error).message).toMatch(/destroy_association_async_job/);
  });

  it("has_many dependent destroy_async requires destroy_association_async_job", () => {
    let error: unknown;
    expect(() => {
      try {
        UnusedHasManyAsync.hasMany("essayDestroyAsyncs", { dependent: "destroyAsync" });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ConfigurationError);
    expect((error as Error).message).toMatch(/destroy_association_async_job/);
  });

  it("resolves a job configured by name and caches the class", () => {
    registerConstant("ResolvableJob", ResolvableJob);
    expect(ResolvableJobAsync.destroyAssociationAsyncJob).toBe(ResolvableJob);
    expect(ResolvableJobAsync._destroyAssociationAsyncJob).toBe(ResolvableJob);
    expect(() =>
      ResolvableJobAsync.hasMany("essayDestroyAsyncs", { dependent: "destroyAsync" }),
    ).not.toThrow();
  });
});
