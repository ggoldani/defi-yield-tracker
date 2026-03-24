# DeFi Yield Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. The main agent acts as **coordinator**, dispatching a sub-agent per task with a focused prompt containing instructions + minimum context. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Workflow per task:** TDD → If test failure: `superpowers:systematic-debugging` → `superpowers:code-review` (ALWAYS, pass or fail) → Commit → Update `CHANGELOG.md`
>
> **GitHub:** `github.com/ggoldani/defi-yield-tracker` (public)

**Goal:** Build a CLI-first DeFi yield tracker that indexes EVM wallet activity (Sickle positions, LP pools, harvests, transfers) into SQLite, calculates PnL per pool and per address, and exposes data for a future frontend dashboard.

**Architecture:** TypeScript monorepo with a modular core engine. Data flows: Blockchain RPCs → Indexer → SQLite → CLI/API. The indexer fetches transactions via Etherscan API V2 (single key for all EVM chains), decodes Sickle strategy calls (deposit, withdraw, harvest, compound, exit, rebalance), and enriches them with token prices from DeFiLlama. PnL is calculated per-position considering impermanent loss, accrued fees, farming rewards, and gas costs. Multi-chain support is abstracted via a `ChainConfig` registry, starting with Base and Polygon.

**Tech Stack:**
- **Runtime:** Node.js 20+ / TypeScript 5+
- **Blockchain:** `viem` (type-safe EVM client, multicall, ABI encoding)
- **Database:** `better-sqlite3` (fast, synchronous SQLite for Node.js)
- **CLI:** `commander` (CLI framework) + `chalk` (terminal colors) + `cli-table3` (formatted tables)
- **Prices:** DeFiLlama API (no key required) / CoinGecko as fallback
- **API:** Etherscan API V2 (single key for Base, Polygon, and all EVM chains)
- **Testing:** `vitest` (fast, TypeScript-native test runner) — TDD/BDD approach
- **Linting:** `eslint` + `prettier`

---

## Design Principles

**KISS (Keep It Simple, Stupid):**
- CLI-first, evolving to frontend — no premature UI complexity
- SQLite local instead of PostgreSQL — simplest viable persistence
- Block explorer APIs instead of running our own indexer node
- DeFiLlama for prices without API key setup

**YAGNI (You Aren't Gonna Need It):**
- Only Base + Polygon initially (architecture supports any EVM chain)
- Snapshot PnL first, historical charts deferred to dashboard phase
- No auto-refresh in MVP — manual `sync` command
- Future tasks documented but not implemented

**DRY (Don't Repeat Yourself):**
- `ChainConfig` registry — a single abstraction for all chain-specific logic
- Shared `retry()`, `rateLimitedFetch()`, and `formatUsd()` utilities
- Repository pattern with consistent CRUD interface across all entities
- Single `categorizeTransaction()` for all Sickle strategies

**TDD/BDD (Test-Driven / Behavior-Driven Development):**
- Every task follows: write failing test → verify it fails → implement → verify it passes → commit
- Tests use BDD-style `describe`/`when`/`it` blocks describing behavior, not implementation
- Edge cases explicitly covered: zero deposits, negative PnL, missing Sickle wallets, API timeouts
- Integration tests validate the full pipeline with real (known) on-chain data

**Security:**
- **Read-only** — no private keys, no transaction signing, no wallet connections
- API keys stored in `.env`, never committed (`.gitignore` enforces this)
- Input validation on all CLI commands (valid EVM addresses, valid chain names)
- Sanitization of block explorer API responses before SQLite insertion
- Rate limiting with exponential backoff to avoid API bans
- No external dependencies beyond well-audited npm packages

---

## Pertinent Decisions & Open Questions

> [!IMPORTANT]
> **API Provider Strategy:** We use **Etherscan API V2** with a single API key for all EVM chains (Base, Polygon, Ethereum, etc.). Rate limit: 5 calls/sec with key. Max 10,000 tx per query (paginated). For future upgrade path: **Alchemy** (30M compute units/month free tier, archive data, richer Transfers API). Moralis has great wallet history but lower free limits. Infura lacks high-level tx history APIs.

> [!IMPORTANT]
> **Price Data:** For historical token prices (needed for PnL at time of tx), we use DeFiLlama's free `coins` API (`/coins/{chain}:{address}?timestamp=X`). No API key needed, supports all EVM chains. CoinGecko as fallback for major tokens.

> [!TIP]
> **Sickle Wallet Auto-Discovery:** Sickle wallets are automatically discovered on-chain by calling `SickleFactory.sickles(userAddress)` when adding an address. No manual input needed. The tracker indexes transactions from both the EOA wallet AND its Sickle wallet(s) per chain.

---

## File Structure

```
defi-yield-tracker/
├── src/
│   ├── index.ts                    # CLI entry point (commander setup)
│   ├── config.ts                   # Chain configs, contract addresses, constants
│   ├── types.ts                    # All TypeScript types/interfaces
│   ├── db/
│   │   ├── schema.ts               # SQLite schema definitions (CREATE TABLE)
│   │   ├── connection.ts           # Database connection singleton
│   │   ├── repositories/
│   │   │   ├── address.repo.ts     # CRUD for tracked addresses
│   │   │   ├── transaction.repo.ts # CRUD for indexed transactions
│   │   │   ├── position.repo.ts    # CRUD for LP positions
│   │   │   └── price.repo.ts       # CRUD for cached token prices
│   ├── indexer/
│   │   ├── scanner.ts              # Block explorer API client (tx fetching)
│   │   ├── decoder.ts              # ABI decoder for Sickle strategy calls
│   │   ├── enricher.ts             # Enriches txs with token info and categorization
│   │   └── sync.ts                 # Orchestrates full sync for an address
│   ├── prices/
│   │   ├── defillama.ts            # DeFiLlama price API client
│   │   └── provider.ts             # Price provider with caching layer
│   ├── analytics/
│   │   ├── pnl.ts                  # PnL calculator (per-pool, per-address)
│   │   ├── positions.ts            # Active position aggregator
│   │   └── summary.ts              # Portfolio summary generator
│   ├── commands/
│   │   ├── add.ts                  # `add` command: add address to track
│   │   ├── sync.ts                 # `sync` command: index transactions
│   │   ├── positions.ts            # `positions` command: show active positions
│   │   ├── pnl.ts                  # `pnl` command: show PnL report
│   │   ├── history.ts              # `history` command: show tx history
│   │   └── config.ts               # `config` command: manage settings
│   └── utils/
│       ├── format.ts               # Number/currency/address formatting
│       ├── logger.ts               # Structured logging
│       └── retry.ts                # Retry logic with exponential backoff
├── tests/
│   ├── unit/
│   │   ├── decoder.test.ts
│   │   ├── pnl.test.ts
│   │   ├── positions.test.ts
│   │   ├── defillama.test.ts
│   │   └── format.test.ts
│   └── integration/
│       ├── scanner.test.ts
│       └── sync.test.ts
├── docs/
│   └── superpowers/plans/
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Task 1: Project Scaffolding & Configuration

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.env.example`
- Modify: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/config.ts`
- Create: `src/types.ts`
- Create: `src/utils/logger.ts`
- Create: `src/utils/format.ts`
- Create: `src/utils/retry.ts`

- [ ] **Step 1: Initialize package.json with dependencies**

```json
{
  "name": "defi-yield-tracker",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "dyt": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "node --env-file=.env --import tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.5",
    "commander": "^12.0.0",
    "viem": "^2.20.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

> [!NOTE]
> **Dependencies (5 runtime, 4 dev) — all mature, audited, minimal surface:**
> - `viem` — TypeScript-first EVM client (by Wagmi team). Core requirement.
> - `better-sqlite3` — Fast synchronous SQLite binding. No ORM overhead.
> - `commander` — CLI framework (~100M downloads/week). Industry standard.
> - `chalk` — Terminal colors (~100M downloads/week). Zero deps itself.
> - `cli-table3` — Formatted terminal tables. Lightweight.
> - No `dotenv` — uses Node.js 20+ native `--env-file` flag.

- [ ] **Step 2: Run npm install**

Run: `npm install`
Expected: `node_modules/` created, lockfile generated

- [ ] **Step 3: Configure TypeScript**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Configure vitest**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

- [ ] **Step 5: Write .env.example**

```env
# Etherscan API V2 — single key works for Base, Polygon, and all EVM chains
# Get yours free at https://etherscan.io/myapikey
ETHERSCAN_API_KEY=your_etherscan_api_key

# RPC Endpoints (optional — uses public RPCs by default)
BASE_RPC_URL=https://mainnet.base.org
POLYGON_RPC_URL=https://polygon-rpc.com

# Database
DB_PATH=./data/tracker.db
```

- [ ] **Step 6: Write core types**

```typescript
// src/types.ts
import type { Address, Hash } from 'viem';

// ── Chain Configuration ───────────────────────────
export interface ChainConfig {
  id: number;
  name: string;
  currency: string;
  rpcUrl: string;
  explorerApiUrl: string;
  explorerApiKey: string;
  sickleFactory: Address;
  blockTime: number; // avg seconds per block
}

// ── Tracked Address ───────────────────────────────
export interface TrackedAddress {
  id?: number;
  address: Address;
  label: string;
  sickleAddresses: Record<number, Address>; // chainId → sickle address
  createdAt: string;
}

// ── Transaction Categories ────────────────────────
export type TxCategory =
  | 'deposit'
  | 'withdraw'
  | 'harvest'
  | 'compound'
  | 'exit'
  | 'rebalance'
  | 'transfer_in'
  | 'transfer_out'
  | 'swap'
  | 'approval'
  | 'unknown';

// ── Indexed Transaction ───────────────────────────
export interface IndexedTransaction {
  id?: number;
  hash: Hash;
  chainId: number;
  blockNumber: number;
  timestamp: number;
  from: Address;
  to: Address;
  value: string; // wei as string
  gasUsed: string;
  gasPrice: string;
  gasCostUsd: number;
  category: TxCategory;
  protocol: string; // e.g., 'aerodrome', 'uniswap-v3'
  poolAddress?: Address;
  token0?: Address;
  token1?: Address;
  amount0?: string;
  amount1?: string;
  rewardToken?: Address;
  rewardAmount?: string;
  addressId: number;
  isFromSickle: boolean;
}

// ── LP Position ─────────────────────────────────
export interface Position {
  id?: number;
  addressId: number;
  chainId: number;
  protocol: string;
  poolAddress: Address;
  token0: Address;
  token1: Address;
  token0Symbol: string;
  token1Symbol: string;
  isActive: boolean;
  entryTimestamp: number;
  exitTimestamp?: number;
  totalDeposited0: string;
  totalDeposited1: string;
  totalWithdrawn0: string;
  totalWithdrawn1: string;
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  totalGasCostUsd: number;
  currentValueUsd?: number;
}

// ── PnL Report ──────────────────────────────────
export interface PnlReport {
  position: Position;
  depositedUsd: number;
  withdrawnUsd: number;
  harvestedUsd: number;
  currentValueUsd: number;
  gasCostUsd: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  roi: number; // percentage
}

// ── Price Cache ─────────────────────────────────
export interface CachedPrice {
  id?: number;
  chainId: number;
  tokenAddress: Address;
  timestamp: number;
  priceUsd: number;
}

// ── Explorer API Response Types ────────────────
export interface ExplorerTxResponse {
  status: string;
  result: ExplorerTx[];
}

export interface ExplorerTx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  gasPrice: string;
  input: string;
  isError: string;
  methodId: string;
  functionName: string;
  contractAddress: string;
}
```

- [ ] **Step 7: Write chain configuration**

```typescript
// src/config.ts
import type { ChainConfig } from './types.js';

// Etherscan API V2 — single key for all EVM chains
// Env vars loaded via Node.js --env-file flag (no dotenv needed)
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';

export const CHAINS: Record<number, ChainConfig> = {
  8453: {
    id: 8453,
    name: 'Base',
    currency: 'ETH',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerApiUrl: ETHERSCAN_V2_BASE,
    explorerApiKey: ETHERSCAN_API_KEY,
    sickleFactory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    blockTime: 2,
  },
  137: {
    id: 137,
    name: 'Polygon',
    currency: 'MATIC',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerApiUrl: ETHERSCAN_V2_BASE,
    explorerApiKey: ETHERSCAN_API_KEY,
    sickleFactory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    blockTime: 2,
  },
};

// Sickle strategy contract addresses (Base — same pattern on other chains)
export const SICKLE_CONTRACTS = {
  farmStrategy: '0x5A72C0f4Bf7f3Ddf1370780d405e29149b128A04' as const,
  simpleFarmStrategy: '0x9b381108ef12a138a5b7cf231fbbef4f20e72306' as const,
  nftFarmStrategy: '0x3B8886C3f6d3BA4a75D3BEcb3c83864C0C01e1F3' as const,
  sweepStrategy: '0x29D82976C8babb7d5a82c78c6Ef4c2a2dDc64125' as const,
};

// Known protocol identifiers
export const PROTOCOLS = {
  aerodrome: {
    name: 'Aerodrome',
    chainId: 8453,
    router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const,
  },
  uniswapV3: {
    name: 'Uniswap V3',
    chainIds: [8453, 137],
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' as const,
  },
} as const;

export const DB_PATH = process.env.DB_PATH || './data/tracker.db';
export const DEFILLAMA_API = 'https://coins.llama.fi';
export const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Rate limiting
export const EXPLORER_RATE_LIMIT = 5; // requests per second
export const DEFILLAMA_RATE_LIMIT = 10;
```

- [ ] **Step 8: Write utility modules**

```typescript
// src/utils/logger.ts
import chalk from 'chalk';

export const log = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(chalk.gray('⊙'), msg);
  },
  table: (data: Record<string, unknown>[]) => console.table(data),
};
```

```typescript
// src/utils/format.ts
import type { Address } from 'viem';
import { formatUnits } from 'viem';

export function shortenAddress(addr: Address, chars = 4): string {
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatTokenAmount(wei: string, decimals = 18): string {
  return parseFloat(formatUnits(BigInt(wei), decimals)).toFixed(6);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
```

```typescript
// src/utils/retry.ts
import { log } from './logger.js';

export async function retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delay?: number; label?: string } = {},
): Promise<T> {
  const { retries = 3, delay = 1000, label = 'operation' } = opts;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      const wait = delay * Math.pow(2, i);
      log.warn(`${label} failed (attempt ${i + 1}/${retries + 1}), retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error('Unreachable');
}
```

- [ ] **Step 9: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Initialize Git and GitHub repo**

```bash
git init
git add -A
git commit -m "feat: project scaffolding with types, config, and utilities"
gh repo create defi-yield-tracker --public --source=. --push
```

- [ ] **Step 11: Create CHANGELOG.md**

Create `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format with the initial entry.

- [ ] **Step 12: Code review via `superpowers:code-review`**

Review all files created in this task before proceeding.

---

## Task 2: SQLite Database Layer

**Files:**
- Create: `src/db/connection.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/repositories/address.repo.ts`
- Create: `src/db/repositories/transaction.repo.ts`
- Create: `src/db/repositories/position.repo.ts`
- Create: `src/db/repositories/price.repo.ts`

- [ ] **Step 1: Write failing test for database schema**

```typescript
// tests/unit/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create all required tables', () => {
    initializeSchema(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('addresses');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('positions');
    expect(tableNames).toContain('price_cache');
    expect(tableNames).toContain('sync_state');
  });

  it('should be idempotent (run twice without error)', () => {
    initializeSchema(db);
    expect(() => initializeSchema(db)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schema.test.ts`
Expected: FAIL — `initializeSchema` not found

- [ ] **Step 3: Implement schema and connection**

```typescript
// src/db/schema.ts
import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      sickle_addresses TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '0',
      gas_used TEXT NOT NULL DEFAULT '0',
      gas_price TEXT NOT NULL DEFAULT '0',
      gas_cost_usd REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'unknown',
      protocol TEXT NOT NULL DEFAULT '',
      pool_address TEXT,
      token0 TEXT,
      token1 TEXT,
      amount0 TEXT,
      amount1 TEXT,
      reward_token TEXT,
      reward_amount TEXT,
      address_id INTEGER NOT NULL,
      is_from_sickle INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (address_id) REFERENCES addresses(id),
      UNIQUE(hash, chain_id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address_id INTEGER NOT NULL,
      chain_id INTEGER NOT NULL,
      protocol TEXT NOT NULL,
      pool_address TEXT NOT NULL,
      token0 TEXT NOT NULL,
      token1 TEXT NOT NULL,
      token0_symbol TEXT NOT NULL DEFAULT '',
      token1_symbol TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      entry_timestamp INTEGER NOT NULL,
      exit_timestamp INTEGER,
      total_deposited_0 TEXT NOT NULL DEFAULT '0',
      total_deposited_1 TEXT NOT NULL DEFAULT '0',
      total_withdrawn_0 TEXT NOT NULL DEFAULT '0',
      total_withdrawn_1 TEXT NOT NULL DEFAULT '0',
      total_deposited_usd REAL NOT NULL DEFAULT 0,
      total_withdrawn_usd REAL NOT NULL DEFAULT 0,
      total_harvested_usd REAL NOT NULL DEFAULT 0,
      total_gas_cost_usd REAL NOT NULL DEFAULT 0,
      current_value_usd REAL,
      FOREIGN KEY (address_id) REFERENCES addresses(id),
      UNIQUE(address_id, chain_id, pool_address)
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id INTEGER NOT NULL,
      token_address TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      price_usd REAL NOT NULL,
      UNIQUE(chain_id, token_address, timestamp)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address_id INTEGER NOT NULL,
      chain_id INTEGER NOT NULL,
      last_block INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      FOREIGN KEY (address_id) REFERENCES addresses(id),
      UNIQUE(address_id, chain_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_address ON transactions(address_id);
    CREATE INDEX IF NOT EXISTS idx_tx_chain ON transactions(chain_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_positions_address ON positions(address_id);
    CREATE INDEX IF NOT EXISTS idx_price_lookup ON price_cache(chain_id, token_address, timestamp);
  `);
}
```

```typescript
// src/db/connection.ts
import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { initializeSchema } from './schema.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db: Database.Database | null = null;

export function getDb(path?: string): Database.Database {
  if (db) return db;
  const dbPath = path || DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Implement repository modules**

Write `src/db/repositories/address.repo.ts`, `transaction.repo.ts`, `position.repo.ts`, `price.repo.ts` with standard CRUD operations (insert, findById, findAll, update, upsert).

Each repo follows this pattern:
```typescript
// src/db/repositories/address.repo.ts
import type Database from 'better-sqlite3';
import type { TrackedAddress } from '../../types.js';

export class AddressRepo {
  constructor(private db: Database.Database) {}

  add(address: string, label: string, sickleAddresses: Record<number, string> = {}): number {
    const stmt = this.db.prepare(
      'INSERT INTO addresses (address, label, sickle_addresses) VALUES (?, ?, ?)'
    );
    const result = stmt.run(address.toLowerCase(), label, JSON.stringify(sickleAddresses));
    return result.lastInsertRowid as number;
  }

  findByAddress(address: string): TrackedAddress | undefined {
    const row = this.db.prepare('SELECT * FROM addresses WHERE address = ?')
      .get(address.toLowerCase()) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      address: row.address,
      label: row.label,
      sickleAddresses: JSON.parse(row.sickle_addresses),
      createdAt: row.created_at,
    };
  }

  findAll(): TrackedAddress[] {
    const rows = this.db.prepare('SELECT * FROM addresses ORDER BY id').all() as any[];
    return rows.map((row) => ({
      id: row.id,
      address: row.address,
      label: row.label,
      sickleAddresses: JSON.parse(row.sickle_addresses),
      createdAt: row.created_at,
    }));
  }

  updateSickle(id: number, chainId: number, sickleAddress: string): void {
    const row = this.db.prepare('SELECT sickle_addresses FROM addresses WHERE id = ?').get(id) as any;
    const sickles = JSON.parse(row.sickle_addresses);
    sickles[chainId] = sickleAddress.toLowerCase();
    this.db.prepare('UPDATE addresses SET sickle_addresses = ? WHERE id = ?')
      .run(JSON.stringify(sickles), id);
  }
}
```

- [ ] **Step 6: Write and run repo tests**

Run: `npx vitest run tests/unit/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: SQLite database layer with schema and repositories"
```

---

## Task 3: Block Explorer Scanner & Transaction Indexer

> [!WARNING]
> **Risk: Sickle ABIs are placeholder.** The ABIs in `decoder.ts` need to be fetched from the [vfat-io/sickle-public](https://github.com/vfat-io/sickle-public) GitHub repo or from verified contracts on Basescan. The plan includes skeleton ABIs — implementation must fetch and validate the real ones.

> [!WARNING]
> **Risk: Token amounts may require event log parsing.** Getting exact amounts from deposit/withdraw transactions may need `eth_getTransactionReceipt` + log decoding (ERC-20 Transfer events), not just calldata. If Etherscan `action=txlist` doesn't provide enough data, add `action=tokentx` (already included in scanner) and correlate by tx hash.

> [!WARNING]
> **Risk: Etherscan API V2 query format.** The V2 API uses a `chainid` parameter. **Must verify** the exact URL format during implementation: `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=txlist&...`. If format differs, adapt `scanner.ts` accordingly.

> [!WARNING]
> **Risk: Pagination for active addresses.** Etherscan returns max 10,000 txs per query. For addresses with >10k transactions, the scanner **must paginate** by using `startblock`/`endblock` ranges: fetch first page, get the last block number, use it as `startblock` for the next query. Loop until results < page size.

> [!IMPORTANT]
> **Pool identification strategy — Factory-based registry (robust approach):**
> Instead of matching pool addresses against a hardcoded list, use **on-chain factory verification**:
> 1. Maintain a registry of known factory addresses per protocol:
>    - Aerodrome PoolFactory: `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` (Base)
>    - Uniswap V3 Factory: check official deployment per chain
> 2. For each pool address encountered, call `pool.factory()` on-chain via `viem` multicall
> 3. Match the returned factory against the known registry
> 4. Cache results in SQLite to avoid repeated on-chain calls
> This is more robust than heuristics and scales to new protocols by just adding factory addresses.

**Files:**
- Create: `src/indexer/scanner.ts`
- Create: `src/indexer/decoder.ts`
- Create: `src/indexer/enricher.ts`
- Create: `src/indexer/sync.ts`
- Test: `tests/unit/decoder.test.ts`
- Test: `tests/integration/scanner.test.ts`

- [ ] **Step 1: Write failing test for ABI decoder**

```typescript
// tests/unit/decoder.test.ts
import { describe, it, expect } from 'vitest';
import { decodeSickleCall, categorizeTransaction } from '../../src/indexer/decoder.js';

describe('Sickle ABI Decoder', () => {
  it('should decode a FarmStrategy deposit call', () => {
    // Use a real calldata sample from a known deposit tx
    const result = decodeSickleCall('0x...deposit_calldata...', 'farmStrategy');
    expect(result.functionName).toBe('deposit');
    expect(result.category).toBe('deposit');
  });

  it('should categorize a transfer to sickle as deposit', () => {
    const category = categorizeTransaction({
      from: '0xUserEOA',
      to: '0xSickleAddress',
      methodId: '0x12345678',
      functionName: 'deposit(address,uint256)',
      isSickleRelated: true,
    });
    expect(category).toBe('deposit');
  });

  it('should categorize a plain ETH transfer as transfer_out', () => {
    const category = categorizeTransaction({
      from: '0xUserEOA',
      to: '0xSomeAddress',
      methodId: '0x',
      functionName: '',
      isSickleRelated: false,
    });
    expect(category).toBe('transfer_out');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/decoder.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement scanner (block explorer API client)**

```typescript
// src/indexer/scanner.ts
import type { ChainConfig, ExplorerTxResponse, ExplorerTx } from '../types.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';
import { EXPLORER_RATE_LIMIT } from '../config.js';

let lastCallTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const minInterval = 1000 / EXPLORER_RATE_LIMIT;
  const elapsed = now - lastCallTime;
  if (elapsed < minInterval) {
    await new Promise((r) => setTimeout(r, minInterval - elapsed));
  }
  lastCallTime = Date.now();
  return fetch(url);
}

export async function fetchTransactions(
  chain: ChainConfig,
  address: string,
  opts: { startBlock?: number; endBlock?: number; page?: number; offset?: number } = {},
): Promise<ExplorerTx[]> {
  const { startBlock = 0, endBlock = 99999999, page = 1, offset = 1000 } = opts;
  const url = new URL(chain.explorerApiUrl);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'txlist');
  url.searchParams.set('address', address);
  url.searchParams.set('startblock', startBlock.toString());
  url.searchParams.set('endblock', endBlock.toString());
  url.searchParams.set('page', page.toString());
  url.searchParams.set('offset', offset.toString());
  url.searchParams.set('sort', 'asc');
  if (chain.explorerApiKey) url.searchParams.set('apikey', chain.explorerApiKey);

  const response = await retry(
    () => rateLimitedFetch(url.toString()).then((r) => r.json() as Promise<ExplorerTxResponse>),
    { label: `fetch txs for ${address} on ${chain.name}` },
  );

  if (response.status !== '1' && response.result?.length === 0) {
    return [];
  }
  return response.result || [];
}

export async function fetchInternalTransactions(
  chain: ChainConfig,
  address: string,
  startBlock = 0,
): Promise<ExplorerTx[]> {
  // Same as fetchTransactions but with action=txlistinternal
  const url = new URL(chain.explorerApiUrl);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'txlistinternal');
  url.searchParams.set('address', address);
  url.searchParams.set('startblock', startBlock.toString());
  url.searchParams.set('sort', 'asc');
  if (chain.explorerApiKey) url.searchParams.set('apikey', chain.explorerApiKey);

  const response = await retry(
    () => rateLimitedFetch(url.toString()).then((r) => r.json() as Promise<ExplorerTxResponse>),
    { label: `fetch internal txs` },
  );
  return response.result || [];
}

export async function fetchTokenTransfers(
  chain: ChainConfig,
  address: string,
  startBlock = 0,
): Promise<ExplorerTx[]> {
  const url = new URL(chain.explorerApiUrl);
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'tokentx');
  url.searchParams.set('address', address);
  url.searchParams.set('startblock', startBlock.toString());
  url.searchParams.set('sort', 'asc');
  if (chain.explorerApiKey) url.searchParams.set('apikey', chain.explorerApiKey);

  const response = await retry(
    () => rateLimitedFetch(url.toString()).then((r) => r.json() as Promise<ExplorerTxResponse>),
    { label: `fetch token transfers` },
  );
  return response.result || [];
}
```

- [ ] **Step 4: Implement ABI decoder for Sickle strategies**

Use `viem`'s `decodeFunctionData` with the known ABIs of FarmStrategy, SimpleFarmStrategy, etc. to decode calldata from transactions that interact with Sickle contracts.

```typescript
// src/indexer/decoder.ts
import { decodeFunctionData, type Address } from 'viem';
import type { TxCategory, ExplorerTx } from '../types.js';
import { SICKLE_CONTRACTS } from '../config.js';

// Minimal ABIs for the strategy functions we care about
const FARM_STRATEGY_ABI = [
  { name: 'deposit', type: 'function', inputs: [/* ... */], outputs: [] },
  { name: 'withdraw', type: 'function', inputs: [/* ... */], outputs: [] },
  { name: 'harvest', type: 'function', inputs: [/* ... */], outputs: [] },
  { name: 'compound', type: 'function', inputs: [/* ... */], outputs: [] },
  { name: 'exit', type: 'function', inputs: [/* ... */], outputs: [] },
  { name: 'rebalance', type: 'function', inputs: [/* ... */], outputs: [] },
] as const;

// NOTE: Full ABIs will be fetched from verified contracts on Basescan/Polygonscan
// or from the vfat-io/sickle-public GitHub repo during implementation.

const SICKLE_METHOD_IDS: Record<string, TxCategory> = {
  // These will be populated with actual method selectors
};

export interface DecodedCall {
  functionName: string;
  category: TxCategory;
  args: Record<string, unknown>;
}

export function decodeSickleCall(input: string, strategy: string): DecodedCall {
  // Decode using viem's decodeFunctionData
  // Match against known strategy ABIs
  // Return structured decoded data
  const methodId = input.slice(0, 10);
  const category = SICKLE_METHOD_IDS[methodId] || 'unknown';
  return { functionName: '', category, args: {} };
}

export interface TxClassification {
  from: string;
  to: string;
  methodId: string;
  functionName: string;
  isSickleRelated: boolean;
}

export function categorizeTransaction(tx: TxClassification): TxCategory {
  if (tx.isSickleRelated) {
    // Check if it's a known Sickle strategy call
    const fnLower = tx.functionName.toLowerCase();
    if (fnLower.includes('deposit')) return 'deposit';
    if (fnLower.includes('withdraw')) return 'withdraw';
    if (fnLower.includes('harvest')) return 'harvest';
    if (fnLower.includes('compound')) return 'compound';
    if (fnLower.includes('exit')) return 'exit';
    if (fnLower.includes('rebalance')) return 'rebalance';
  }

  if (tx.methodId === '0x' || tx.methodId === '') {
    return 'transfer_out'; // plain ETH transfer
  }

  if (tx.functionName.toLowerCase().includes('approve')) {
    return 'approval';
  }

  if (tx.functionName.toLowerCase().includes('swap')) {
    return 'swap';
  }

  return 'unknown';
}
```

- [ ] **Step 5: Implement enricher (adds token info, protocol detection)**

```typescript
// src/indexer/enricher.ts
// - Detects which protocol a pool belongs to (Aerodrome, Uniswap V3, etc.)
// - Resolves token symbols via on-chain calls (viem multicall)
// - Tags transactions with pool metadata
```

- [ ] **Step 6: Implement sync orchestrator**

```typescript
// src/indexer/sync.ts
// - For a given tracked address + chain:
//   1. Get last synced block from sync_state table
//   2. Fetch all new txs (normal + internal + token transfers)
//   3. Decode and categorize each tx
//   4. Enrich with token/pool metadata
//   5. Get historical prices for each tx timestamp
//   6. Insert into transactions table
//   7. Update positions table
//   8. Update sync_state
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: transaction scanner, ABI decoder, and sync engine"
```

---

## Task 4: Price Provider (DeFiLlama)

**Files:**
- Create: `src/prices/defillama.ts`
- Create: `src/prices/provider.ts`
- Test: `tests/unit/defillama.test.ts`

- [ ] **Step 1: Write failing test for price fetching**

```typescript
// tests/unit/defillama.test.ts
import { describe, it, expect } from 'vitest';
import { getHistoricalPrice, getCurrentPrice } from '../../src/prices/defillama.js';

describe('DeFiLlama Price Provider', () => {
  it('should fetch current ETH price on Base', async () => {
    const price = await getCurrentPrice(8453, '0x0000000000000000000000000000000000000000');
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(100000); // sanity check
  });

  it('should fetch historical price', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 86400; // yesterday
    const price = await getHistoricalPrice(
      8453,
      '0x0000000000000000000000000000000000000000',
      timestamp,
    );
    expect(price).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/defillama.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DeFiLlama client**

```typescript
// src/prices/defillama.ts
import { DEFILLAMA_API } from '../config.js';
import { retry } from '../utils/retry.js';

const CHAIN_MAP: Record<number, string> = {
  8453: 'base',
  137: 'polygon',
  1: 'ethereum',
  10: 'optimism',
  42161: 'arbitrum',
};

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
const WRAPPED: Record<number, string> = {
  8453: '0x4200000000000000000000000000000000000006', // WETH on Base
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC on Polygon
};

function getDefillamaId(chainId: number, tokenAddress: string): string {
  const chain = CHAIN_MAP[chainId];
  const addr = tokenAddress === NATIVE_TOKEN ? WRAPPED[chainId] || tokenAddress : tokenAddress;
  return `${chain}:${addr}`;
}

export async function getCurrentPrice(chainId: number, tokenAddress: string): Promise<number> {
  const id = getDefillamaId(chainId, tokenAddress);
  const url = `${DEFILLAMA_API}/prices/current/${id}`;
  const res = await retry(() => fetch(url).then((r) => r.json()), { label: 'current price' });
  return res.coins?.[id]?.price || 0;
}

export async function getHistoricalPrice(
  chainId: number,
  tokenAddress: string,
  timestamp: number,
): Promise<number> {
  const id = getDefillamaId(chainId, tokenAddress);
  const url = `${DEFILLAMA_API}/prices/historical/${timestamp}/${id}`;
  const res = await retry(() => fetch(url).then((r) => r.json()), { label: 'historical price' });
  return res.coins?.[id]?.price || 0;
}

export async function getBatchPrices(
  tokens: Array<{ chainId: number; address: string }>,
): Promise<Record<string, number>> {
  const ids = tokens.map((t) => getDefillamaId(t.chainId, t.address));
  const url = `${DEFILLAMA_API}/prices/current/${ids.join(',')}`;
  const res = await retry(() => fetch(url).then((r) => r.json()), { label: 'batch prices' });
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(res.coins || {})) {
    result[key] = (val as any).price || 0;
  }
  return result;
}
```

- [ ] **Step 4: Implement caching price provider**

```typescript
// src/prices/provider.ts
// Wraps DeFiLlama client with SQLite caching layer
// - Check price_cache first
// - If miss, fetch from API and store
// - Round timestamps to nearest hour for cache efficiency
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/defillama.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: DeFiLlama price provider with SQLite caching"
```

---

## Task 5: PnL Analytics Engine

> [!CAUTION]
> **V3 concentrated liquidity is the user's PRIMARY pool type.** PnL for V3-style positions (Aerodrome CL, Uniswap V3) requires tick-range-aware calculations. This is NOT deferred — it must work in MVP.
>
> **Approach for V3 PnL:**
> 1. Track deposit amounts (token0 + token1) at entry price
> 2. Track current position value by querying on-chain liquidity at current tick
> 3. Compare current value vs deposited value = unrealized PnL (includes IL)
> 4. Add harvested rewards and subtract gas costs for total PnL
> 5. For full IL calculation: compare "held" value (if tokens were just held) vs "provided" value (inside the pool)
>
> V2-style pools (constant-product) use the simpler formula already in the plan.

> [!TIP]
> **User wallet address for testing:** When integration testing is needed, **ask the user** to provide a real public wallet address with known Sickle positions for end-to-end validation against vfat.io's displayed values.

**Files:**
- Create: `src/analytics/pnl.ts`
- Create: `src/analytics/positions.ts`
- Create: `src/analytics/summary.ts`
- Test: `tests/unit/pnl.test.ts`
- Test: `tests/unit/positions.test.ts`

- [ ] **Step 1: Write failing test for PnL calculation (BDD-style with edge cases)**

```typescript
// tests/unit/pnl.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePositionPnl } from '../../src/analytics/pnl.js';

describe('PnL Calculator', () => {
  describe('when a position is fully exited with profit', () => {
    it('returns positive totalPnl considering deposits, withdrawals, harvests, and gas', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 800,
        totalHarvestedUsd: 350,
        currentValueUsd: 0,
        totalGasCostUsd: 15,
      });
      expect(pnl.totalPnl).toBe(135); // 800 + 350 - 1000 - 15
      expect(pnl.roi).toBeCloseTo(13.5);
    });
  });

  describe('when a position is still active with unrealized gains', () => {
    it('separates realized PnL (harvests - gas) from unrealized PnL (current value - deposited)', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 50,
        currentValueUsd: 1100,
        totalGasCostUsd: 10,
      });
      expect(pnl.realizedPnl).toBe(40);
      expect(pnl.unrealizedPnl).toBe(100);
      expect(pnl.totalPnl).toBe(140);
    });
  });

  describe('when gas costs exceed harvested rewards', () => {
    it('returns negative realized PnL', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 500,
        totalWithdrawnUsd: 500,
        totalHarvestedUsd: 5,
        currentValueUsd: 0,
        totalGasCostUsd: 30,
      });
      expect(pnl.totalPnl).toBe(-25); // 500 + 5 - 500 - 30
      expect(pnl.roi).toBeCloseTo(-5.0);
    });
  });

  describe('when position has zero deposits', () => {
    it('returns zero ROI to avoid division by zero', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 0,
        totalGasCostUsd: 0,
      });
      expect(pnl.roi).toBe(0);
      expect(pnl.totalPnl).toBe(0);
    });
  });

  describe('when position has only deposits and no activity yet', () => {
    it('returns unrealized PnL based on current value vs deposited', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 2000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 1800, // impermanent loss scenario
        totalGasCostUsd: 5,
      });
      expect(pnl.unrealizedPnl).toBe(-200);
      expect(pnl.totalPnl).toBeLessThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pnl.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PnL calculator**

```typescript
// src/analytics/pnl.ts
import type { PnlReport, Position } from '../types.js';

interface PnlInput {
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  currentValueUsd: number;
  totalGasCostUsd: number;
}

export function calculatePositionPnl(input: PnlInput): {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  roi: number;
} {
  const { totalDepositedUsd, totalWithdrawnUsd, totalHarvestedUsd, currentValueUsd, totalGasCostUsd } = input;

  const realizedPnl = totalWithdrawnUsd + totalHarvestedUsd - totalDepositedUsd - totalGasCostUsd;
  const unrealizedPnl = currentValueUsd > 0 ? currentValueUsd - totalDepositedUsd + totalWithdrawnUsd : 0;
  const totalPnl = currentValueUsd > 0
    ? unrealizedPnl + totalHarvestedUsd - totalGasCostUsd
    : realizedPnl;
  const roi = totalDepositedUsd > 0 ? (totalPnl / totalDepositedUsd) * 100 : 0;

  return { realizedPnl, unrealizedPnl, totalPnl, roi };
}

export function generatePnlReport(position: Position): PnlReport {
  const pnl = calculatePositionPnl({
    totalDepositedUsd: position.totalDepositedUsd,
    totalWithdrawnUsd: position.totalWithdrawnUsd,
    totalHarvestedUsd: position.totalHarvestedUsd,
    currentValueUsd: position.currentValueUsd || 0,
    totalGasCostUsd: position.totalGasCostUsd,
  });

  return {
    position,
    depositedUsd: position.totalDepositedUsd,
    withdrawnUsd: position.totalWithdrawnUsd,
    harvestedUsd: position.totalHarvestedUsd,
    currentValueUsd: position.currentValueUsd || 0,
    gasCostUsd: position.totalGasCostUsd,
    ...pnl,
  };
}
```

- [ ] **Step 4: Implement positions aggregator and summary generator**

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/pnl.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: PnL analytics engine with position tracking"
```

---

## Task 6: CLI Commands

**Files:**
- Modify: `src/index.ts`
- Create: `src/commands/add.ts`
- Create: `src/commands/sync.ts`
- Create: `src/commands/positions.ts`
- Create: `src/commands/pnl.ts`
- Create: `src/commands/history.ts`
- Create: `src/commands/config.ts`

- [ ] **Step 1: Implement CLI entry point**

```typescript
// src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { addCommand } from './commands/add.js';
import { syncCommand } from './commands/sync.js';
import { positionsCommand } from './commands/positions.js';
import { pnlCommand } from './commands/pnl.js';
import { historyCommand } from './commands/history.js';

const program = new Command();

program
  .name('dyt')
  .description('DeFi Yield Tracker — Track your LP positions, harvests, and PnL')
  .version('0.1.0');

program.addCommand(addCommand);
program.addCommand(syncCommand);
program.addCommand(positionsCommand);
program.addCommand(pnlCommand);
program.addCommand(historyCommand);

program.parse();
```

- [ ] **Step 2: Implement `add` command**

```
dyt add <address> --label "My Wallet" --sickle-base 0x... --sickle-polygon 0x...
```
Adds an address to track. Stores EOA + Sickle addresses per chain.

- [ ] **Step 3: Implement `sync` command**

```
dyt sync [--address 0x...] [--chain base|polygon|all] [--from-date 2024-01-01]
```
Fetches new transactions for tracked addresses. Shows progress bar.

- [ ] **Step 4: Implement `positions` command**

```
dyt positions [--address 0x...] [--chain base|polygon] [--active|--all]
```
Shows active and historical LP positions with current values.

- [ ] **Step 5: Implement `pnl` command**

```
dyt pnl [--address 0x...] [--pool 0x...] [--chain base|polygon]
```
Shows PnL breakdown per pool and aggregate PnL. Formatted table output.

- [ ] **Step 6: Implement `history` command**

```
vyt history [--address 0x...] [--category deposit|withdraw|harvest|...] [--limit 50]
```
Shows transaction history with filters.

- [ ] **Step 7: Manual test all commands**

Run:
```bash
npx tsx src/index.ts add 0xYourAddress --label "Main Wallet"
npx tsx src/index.ts sync --chain base
npx tsx src/index.ts positions
npx tsx src/index.ts pnl
npx tsx src/index.ts history --limit 10
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: CLI commands for add, sync, positions, pnl, and history"
```

---

## Task 7: Sickle Wallet Discovery (On-Chain)

> [!WARNING]
> **Risk: SickleFactory address on Polygon.** The plan uses the same address as Base (`0x71D234A3...`). This must be verified on-chain during implementation by checking if the contract exists at that address on Polygon. If different, update `CHAINS[137].sickleFactory` in config.

**Files:**
- Create: `src/indexer/sickle.ts`

- [ ] **Step 1: Implement SickleFactory query**

Use `viem` to call `SickleFactory.sickles(userAddress)` on-chain to auto-discover the user's Sickle wallet address per chain.

```typescript
// src/indexer/sickle.ts
import { createPublicClient, http, type Address } from 'viem';
import { base, polygon } from 'viem/chains';
import { CHAINS } from '../config.js';

const SICKLE_FACTORY_ABI = [
  {
    name: 'sickles',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

export async function discoverSickleAddress(
  chainId: number,
  userAddress: Address,
): Promise<Address | null> {
  const chain = chainId === 8453 ? base : polygon;
  const config = CHAINS[chainId];
  const client = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const sickle = await client.readContract({
    address: config.sickleFactory,
    abi: SICKLE_FACTORY_ABI,
    functionName: 'sickles',
    args: [userAddress],
  });

  const zero = '0x0000000000000000000000000000000000000000';
  return sickle === zero ? null : (sickle as Address);
}
```

- [ ] **Step 2: Integrate into `add` command**

Auto-discover Sickle addresses when adding an EOA, so the user doesn't need to manually provide them.

- [ ] **Step 3: Test discovery**

Run: `npx tsx src/index.ts add 0xYourAddress --label "Test" --discover-sickle`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: auto-discover Sickle wallet addresses on-chain"
```

---

## Task 8: Integration Testing & Polish

> [!IMPORTANT]
> **Request user's wallet address** for integration testing. We need a real address with known Sickle positions on Base/Polygon to validate the full pipeline (sync → positions → PnL) against what vfat.io shows.

**Files:**
- Test: `tests/integration/sync.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write integration test for full sync cycle**

Tests the full pipeline: add address → sync → check positions → check PnL using a known test address on Base.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Write comprehensive README**

Document: installation, configuration (.env), CLI usage with examples, architecture overview.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "docs: comprehensive README and integration tests"
```

---

## Verification Plan

### Automated Tests

```bash
# Run all unit tests
npx vitest run tests/unit/

# Run integration tests (requires API keys in .env)
npx vitest run tests/integration/

# Type checking
npx tsc --noEmit
```

### Manual Verification

1. **Add a real address:** `npx tsx src/index.ts add <your_address> --label "Main"` → should auto-discover Sickle addresses and confirm
2. **Sync Base:** `npx tsx src/index.ts sync --chain base` → should show progress and # of transactions indexed
3. **View positions:** `npx tsx src/index.ts positions` → should list LP pools with token pairs and current values
4. **View PnL:** `npx tsx src/index.ts pnl` → should show formatted PnL table per pool with ROI %
5. **View history:** `npx tsx src/index.ts history --limit 5` → should show last 5 categorized transactions

---

## Future Tasks (Post-MVP)

These are out of scope for the initial plan but documented for reference:

- **Task 9:** Frontend Dashboard (Next.js + Recharts, served from same data)
- **Task 10:** Historical PnL chart (time-series snapshots)
- **Task 11:** Auto-refresh / WebSocket live updates
- **Task 12:** Alchemy upgrade for richer data (decoded logs, token transfers API)
- **Task 13:** Impermanent Loss calculation refinement (tick-level for concentrated liquidity)
- **Task 14:** Multi-protocol support (QuickSwap, SushiSwap, Balancer)
- **Task 15:** Deploy to Railway/Vercel with API endpoints
