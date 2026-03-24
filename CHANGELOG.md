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
