# DeFi Yield Tracker

**`dyt`** is a local-first CLI: index on-chain activity for an EOA that uses **Sickle**-style smart wallets (e.g. Aerodrome / Slipstream style flows on **Base** and **Polygon**), store everything in **SQLite**, then inspect **LP positions**, **history**, and **PnL** in the terminal.

---

## Overview

| Layer | What it does |
|--------|----------------|
| **Sync** | Pulls transactions from a Blockscout-compatible explorer API, enriches them (pool, tokens, protocol, gas USD, NFT ids where applicable). |
| **Positions** | Rebuilds `positions` rows from indexed txs (V2 LP, concentrated liquidity NFTs, etc.). |
| **Analytics** | Surfaces deposits, withdrawals, harvests, and PnL (realized / unrealized / ROI) using indexed flows plus **current** USD marks where available. |

Stack: **TypeScript**, **Node.js**, **better-sqlite3**, **viem**, **Commander**.

---

## Requirements

- **Node.js** 20+ (matches `@types/node` in the project)
- **npm**
- An **Etherscan API key** (used as configured in code; see [`.env.example`](.env.example))

---

## Quick start

```bash
git clone https://github.com/ggoldani/defi-yield-tracker.git
cd defi-yield-tracker
npm install
cp .env.example .env    # edit values — never commit .env
npm run build
```

Run the CLI:

```bash
node bin/dyt.js --help
# or, after npm link / global install:
dyt --help
```

`bin/dyt.js` loads environment variables via **dotenv**; ensure `.env` exists next to your working directory or export variables in your shell.

---

## Configuration

Copy [`.env.example`](.env.example) to `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `ETHERSCAN_API_KEY` | Yes | API key from [Etherscan](https://etherscan.io/myapikey) (project uses it per chain configuration in code). |
| `BASE_RPC_URL` | No | Base RPC; defaults to a public endpoint if unset. |
| `POLYGON_RPC_URL` | No | Polygon RPC; defaults to a public endpoint if unset. |
| `DB_PATH` | No | SQLite file path; default `./data/tracker.db` (parent directory is created automatically). |

Supported **chain IDs** in [`src/config.ts`](src/config.ts) are **8453** (Base) and **137** (Polygon). Other IDs are rejected with a clear error.

---

## CLI reference

### `dyt add <address>`

Register an EOA to track.

| Option | Description |
|--------|-------------|
| `-l, --label <string>` | Optional label. |
| `-s, --sickle <address>` | Set the Sickle (smart wallet) address **manually** for **every** configured chain, skipping auto-discovery on sync. |

If the address is already tracked, the command warns and exits. To change a manual Sickle mapping, **`remove`** the address and **`add`** again.

### `dyt list`

Print all tracked addresses (id, label, shortened EOA, Sickle per chain).

### `dyt remove <id_or_address>`

Remove a tracked address by **numeric id** or **0x…** address. Deletes associated indexed data for that address.

### `dyt sync [address_id]`

Incremental sync: fetch new transactions from the explorer, enrich, and update the database. If `address_id` is omitted, all tracked addresses are processed.

| Option | Description |
|--------|-------------|
| `-c, --chain <id>` | Restrict sync to one chain (e.g. `8453`). |
| `-r, --rebuild-positions` | **No** explorer fetch. Recomputes **`positions`** (and related USD marks) from **existing** rows only — useful after decoder fixes or DB repair. |

### `dyt positions [address_id]`

Tabular view of LP positions (active by default).

| Option | Description |
|--------|-------------|
| `-a, --all` | Include closed / exited positions. |
| `-c, --chain <id>` | Filter to one chain. |

Concentrated-liquidity rows show an **NFT id** column when `position_kind` is `v3_nft`.

### `dyt pnl [address_id]`

PnL summary: ROI, realized, unrealized, totals. Optional `-c, --chain <id>` filters by chain.

### `dyt history [address_id]`

Recent indexed transactions.

| Option | Description |
|--------|-------------|
| `-l, --limit <n>` | Max rows (default `20`). |

---

## How data flows

1. **`add`** stores the EOA (and optional per-chain Sickle overrides).
2. **`sync`** pulls txs from the configured explorer API, classifies and enriches them, writes to SQLite.
3. **`sync`** (normal mode) can rebuild positions after new data; **`sync -r`** rebuilds from the DB only.
4. **`positions`** / **`pnl`** / **`history`** read from SQLite and format tables in the terminal.

Historical USD in aggregates depends on **DeFi Llama** (and related price logic) coverage in the indexer. Missing historical prices can understate past USD amounts and PnL; the CLI surfaces a short caveat where relevant.

---

## Project layout

```
src/
├── cli/                 # Commander entrypoint + commands
├── db/                  # Schema, migrations, repositories
├── indexer/             # Sync pipeline, decode, enrich, position rebuild, NFT reconciliation
├── analytics/           # PnL and position valuation helpers
├── prices/              # Historical / spot price providers
├── config.ts            # Chains, RPCs, explorer URLs, contract constants
├── config/pools.ts      # Known pool metadata for enrichment / rebuild
└── abis/                # JSON ABIs used for calldata decoding
```

---

## Development

```bash
npm run build      # tsc → dist/
npm test           # vitest run
npm run test:watch
npm run lint
npm run format
```

Type-check and run from source (without a separate build step):

```bash
npm run dev -- --help
```

---

## Operator checklist (manual smoke)

Run after `npm run build` and a configured `.env`:

1. `dyt add <YOUR_EOA>` (or use an existing id from `dyt list`).
2. `dyt sync -c 8453` (or `dyt sync <id> -c 8453`) until transactions are indexed.
3. `dyt positions` / `dyt pnl`, optionally with `-c 8453` on multi-chain setups.
4. `dyt sync --rebuild-positions -c 8453` — row counts and USD totals should match step 3 (no double counting).
5. *(Optional)* Spot-check CL **NFT ids** against a block explorer for the Sickle address.

| Check | Pass criteria |
|-------|----------------|
| V2 row | At least one `v2_lp` with non-zero deposited USD, or a documented data gap. |
| CL rows | Distinct NFT ids for distinct CL positions on the same pool. |
| Rebuild | A second `--rebuild-positions` does not inflate totals. |
| PnL | Plausible order of magnitude vs your expectations. |
| Warnings | No silent wrong `nft_token_id` — expect warnings when the indexer cannot resolve an NFT. |