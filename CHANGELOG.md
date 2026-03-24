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
