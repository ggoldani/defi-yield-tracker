# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
