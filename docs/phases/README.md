# Implementation Phases

Phases are numbered with sparse IDs (100, 200, ...) to allow insertion of
intermediate phases. Each phase should produce a usable, tested subset of
functionality.

## Current Coverage

| Package          | Rails Tests | Matched   | Coverage  |
| ---------------- | ----------- | --------- | --------- |
| Arel             | 592         | 586       | **99%**   |
| ActiveModel      | 771         | 760       | **98.6%** |
| ActiveRecord     | 5,428       | 3,318     | **61.1%** |
| ActiveSupport    | 2,826       | 606       | **21.4%** |
| Rack             | 773         | 765       | **99%**   |
| ActionDispatch   | 1,620       | 452       | **27.9%** |
| ActionController | 1,734       | 310       | **17.9%** |
| **Overall**      | **13,744**  | **6,797** | **49.5%** |

## ActiveRecord — Areas at 100%

These areas are fully complete with all tests passing:

- Belongs-to associations (153 tests)
- Persistence (358 tests)
- Calculations (489 tests)
- Default scoping (145 tests)
- Inheritance / STI (106 tests)
- All validations (161 tests)
- JSON serialization (45 tests)
- Relation core (or, and, annotations, delete-all, mutation, order — 179 tests)

## ActiveRecord — Key remaining areas

See [activerecord-100-percent.md](../activerecord-100-percent.md) for the full
breakdown. The largest remaining stub counts are:

| Area                    | Stubs | Pass Rate |
| ----------------------- | ----- | --------- |
| HABTM + has_one         | 220   | 44%       |
| Eager loading (through) | 185   | 45%       |
| Autosave associations   | 119   | 50%       |
| Relations               | 103   | 86%       |
| Base                    | 95    | 71%       |
| Where chain             | 87    | 25%       |
| Finders                 | 83    | 79%       |
| Where                   | 76    | 45%       |
| Insert/upsert           | 71    | 37%       |
| Strict loading          | 69    | 37%       |
| Counter cache           | 67    | 40%       |

## Phase Order

| Phase | Focus                                                                             | Status                                                |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 100   | [Finders, Persistence, Calculations](100-finders-persistence-calculations.md)     | **Done** — all three at 79–100%                       |
| 200   | [Relations, Core, Attributes](200-relations-core-attributes.md)                   | **Mostly done** — relations 86%, attributes 91%       |
| 300   | [Scoping, Inheritance, Enum, Store, Validations](300-scoping-enum-inheritance.md) | **Done** — all at 82–100%                             |
| 400   | [Transactions, Locking](400-transactions-locking.md)                              | **In progress** — transactions 78%, optimistic 53%    |
| 500   | [Migrations](500-migrations.md)                                                   | **Mostly done** — 91%                                 |
| 600   | [Associations: belongs_to, has_one](600-associations-basic.md)                    | **Done** — belongs_to 100%, has_one in has-one-habtm  |
| 700   | [Associations: has_many, has_many :through](700-associations-has-many.md)         | **Mostly done** — has_many 97%                        |
| 800   | [Associations: eager loading, autosave, nested](800-associations-advanced.md)     | **In progress** — nested 88%, autosave 50%, eager 45% |
| 900   | [CI, Publishing, Documentation](900-ci-publishing.md)                             | CI running, packages not yet published                |
| 1000+ | [ActiveSupport phases](1000-activesupport-core.md)                                | **21.4%** overall                                     |
