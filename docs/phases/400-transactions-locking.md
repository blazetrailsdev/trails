# Phase 400: Transactions, Locking

**Goal**: Implement data integrity features.

## Transactions (16/155 → target 100+)

### Already working

- Basic `transaction` blocks
- `savepoint` for nested transactions
- Rollback on exception
- `inTransaction` state tracking

### Missing / incomplete

- `after_commit` / `after_rollback` callbacks
- `after_create_commit`, `after_update_commit`, `after_destroy_commit`
- `after_save_commit`
- Transaction isolation levels
- `requires_new: true` for nested transactions
- `joinable: false`
- Transaction callbacks ordering
- `committed!` / `rolledback!` lifecycle hooks
- `transaction` on the class vs instance level

### Key files

- `packages/activerecord/src/transactions.ts`
- Ruby reference: `transactions_test.rb`, `transaction_callbacks_test.rb`

## Locking (5/51 → target 35+)

### Optimistic locking

- `lock_version` column auto-increment on save
- `StaleObjectError` when version mismatch
- `locking_enabled?`
- Skipping locking for new records

### Pessimistic locking

- `lock!` — `SELECT ... FOR UPDATE`
- `with_lock` block
- `lock('FOR SHARE')`
- Lock on relation (`Model.lock.where(...)`)

### Key files

- `packages/activerecord/src/base.ts`
- Ruby reference: `locking/optimistic_test.rb`, `locking/pessimistic_test.rb`
