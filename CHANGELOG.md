# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Positions / PnL pipeline (indexed txs → accurate `positions`):**
  - Versioned SQLite migration (`PRAGMA user_version`) and columns: `positions.position_kind`, `positions.nft_token_id`, `transactions.nft_token_id`; unique key `(address_id, chain_id, pool_address, nft_token_id)` for V2 vs CL NFT rows.
  - Exported `roundPriceTimestampToHour` (shared with price cache hour bucketing).
  - `decodeSickleStrategyInput`: pure viem decode for strategy calldata (Farm V2 deposit, Aerodrome strategy V2 increase, Slipstream increase/decrease partial, NftFarm withdraw/increase); golden fixtures from Base; extended categorizer selectors where needed.
  - **Async** `enrichTransaction`: fills `poolAddress`, tokens/amounts, `nftTokenId`, `protocol` (via `KNOWN_POOLS` + labels), and `gasCostUsd` using `PriceProvider`; sync dedupes enrich per tx hash (EOA + Sickle).
  - `PriceProvider.getHistoricalUsdBatch`: deduped keys, cache-first, bounded concurrency for historical DeFiLlama fetches.
  - `reconcileNftTokenIdsForAddressChain`: fills missing CL `nft_token_id` from NPM **ERC-721 Transfer** logs (Base `nftPositionManager` on `ChainConfig`); EOA + Sickle as owners; widened candidate query for EOA→strategy rows.
  - `rebuildPositionsForAddressChain`: full-history rebuild from DB (reconcile → reload txs → `getHistoricalUsdBatch` → V2 vs `v3_nft` grouping → category-based USD + gas sums → delete positions for address+chain → upsert). Replaces the old `sync` heuristic that substring-matched `KNOWN_POOLS` on the current fetch batch only.
- `SICKLE_STRATEGY_ADDRESSES_LOWER` (and related) for SQL `IN` lists aligned with strategy `to` addresses.
- **Task 4c — `dyt sync --rebuild-positions` / `-r`:** Exported `rebuildPositionsOnlyForAddress` (`src/indexer/sync.ts`) so the CLI can recompute `positions` from existing `transactions` without calling the block explorer (no `fetchAllTransactions` / tx list quota). Uses the same `PriceProvider` + `rebuildPositionsForAddressChain` wiring as the post-insert rebuild. Optional `[address_id]` and `-c, --chain <id>` behave like normal `sync`; **`--rebuild-positions` wins** over a full sync when both would apply. Per address+chain logs are prefixed `[rebuild only]`; RPC and DeFiLlama may still run inside NFT reconciliation and historical pricing.
- **Task 5a — `current_value_usd` (spot MVP):** `estimatePositionValueUsd` in `src/analytics/positions.ts` runs during `rebuildPositionsForAddressChain` for **active** rows and persists via `PositionRepo.upsert`. **V2:** Pair `balanceOf(Sickle or EOA)` × `getReserves` / `totalSupply` × `PriceProvider.getCurrentPrice`. **V3 / Slipstream:** NPM `positions(tokenId)` must show `liquidity > 0`; USD uses **indexed net** `(totalDeposited − totalWithdrawn)` token wei × spot (documented **~5–15%** band vs tick-exact 5b). **Inactive / exited:** `current_value_usd` stored as **0**. RPC failures → `log.warn`, value **0**. Tests use mocked `readContract`; `skipSpotValuation` on rebuild deps avoids live RPC in `positionBuilder` unit tests.
- Project scaffolding with TypeScript 5, ESM modules, and strict mode
- Core types: `ChainConfig`, `TrackedAddress`, `IndexedTransaction`, `Position`, `PnlReport`
- Chain configuration for Base (8453) and Polygon (137) with Etherscan API V2
- Sickle strategy contract addresses and protocol factory registry
- Utility modules: `logger`, `format` (with address validation), `retry` (exponential backoff)
- CLI entry point stub (`dyt` binary)
- Vitest test configuration with V8 coverage
- `.env.example` with Etherscan API V2 single-key setup
- SQLite database layer with schema (5 tables, 6 indexes)
- Database connection singleton (WAL mode, foreign keys)
- Repositories: `AddressRepo`, `TransactionRepo`, `PositionRepo`, `PriceRepo`
- Unit tests: schema verification and address repository CRUD (9 tests)
- Block explorer scanner with rate limiting and automatic pagination
- Transaction decoder/categorizer based on real Sickle FarmStrategy.sol ABI
- Transaction enricher (raw API response → structured IndexedTransaction)
- Sync engine with incremental sync state tracking per address per chain
- Decoder unit tests covering all Sickle strategy functions (15 tests)
- DeFiLlama price client (current, historical, batch prices) with native token resolution
- Price provider with SQLite caching layer (hour-rounded timestamps)
- Gas cost USD calculator using native currency prices
- DeFiLlama live API tests (4 tests)
- PnL calculator with realized/unrealized decomposition (avoids double-counting withdrawals)
- PnL unit tests covering 6 scenarios: profit, loss, zero, IL, partial withdrawals (6 tests)
- Basic test suite for CLI via vitest (`cli.test.ts`)
- Configured native `dyt` executable mapping to CLI entrypoint (`bin/dyt.js`)
- `dyt add`: CLI command for adding new tracked 0x wallets
- `dyt sync`: Triggers indexing engine for all or specific wallets/chains
- `dyt positions`: Prints active & historical Sickle LP positions in a formatted table
- `dyt pnl`: Renders realization, impermanent loss, net PnL, and ROI analytics
- `dyt history`: Shows recent transaction history with category and gas costs
- On-chain Sickle wallet discovery using `viem` to read `sickles[address]` from factory mappings
- Auto-registration of newly discovered Sickle wallets during the `dyt sync` process
- Mocked public client BDD tests for discovery logic (3 tests)

### Changed
- `TransactionRepo.insert` reports whether a row was inserted (`changes`), so `sync` only rebuilds positions when new transactions are actually written.
- `sync` removes the in-memory `KNOWN_POOLS` substring position builder; positions are rebuilt via `rebuildPositionsForAddressChain` after successful inserts.
- `rebuildPositionsForAddressChain` now sets **`current_value_usd`** for active positions (Task 5a); **`PositionRebuildDeps.skipSpotValuation`** skips RPC for unit tests.
- `PositionRepo`: **`current_value_usd = 0`** is stored and loaded as numeric zero (not coerced to `NULL` / omitted on read).
- `dyt sync --chain`: unknown or unsupported chain id fails with a clear error (lists supported **CHAINS** ids) instead of succeeding with no work (applies to normal sync and `--rebuild-positions`).

### Fixed
- **Task 6 — PnL:** `calculatePositionPnl` documents invariants vs `positionBuilder` (deposit/withdraw/exit vs harvest legs; no duplicate harvest in total). **Canonical total:** `withdrawn + harvested + current − deposited − gas`; decomposition unchanged. Non-finite inputs coerced to **0** to avoid NaN in CLI. Extended `tests/unit/pnl.test.ts` (fixtures A–D + NaN + regressions).

### Added
- **Task 7 — CLI:** `dyt positions` and `dyt pnl` support **`-c, --chain <id>`** (same numeric **CHAINS** validation as `sync`; unknown id lists supported ids). Tables include **NFT id** for **`v3_nft`** rows (**`-`** for **`v2_lp`**). **USD caveat:** command descriptions and a post-table **`log.info`** repeat that totals depend on indexed historical prices (no per-row missing-price flag in DB).
