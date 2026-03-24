# DeFi Yield Tracker (`dyt`)

CLI indexer for tracking Sickle / Aerodrome-style LP activity: sync txs from a block explorer, rebuild **`positions`** from SQLite, spot **`current_value_usd`** (MVP), and **`pnl`** analytics.

## Setup

```bash
npm install
cp .env.example .env   # set ETHERSCAN_API_KEY, optional BASE_RPC_URL / DB_PATH
npm run build
```

Run the CLI via `node bin/dyt.js <command>` or link `dyt` globally.

## Usage (high level)

| Command | Notes |
|--------|--------|
| `dyt add <0x…>` | Track an EOA; run `dyt sync` to discover Sickle per chain. |
| `dyt sync [id]` | Incremental explorer fetch + enrich + optional position rebuild after new txs. |
| `dyt sync --chain 8453` | **Numeric** chain id only (e.g. `8453` = Base). Unknown ids error with supported list. |
| `dyt sync -r` / `--rebuild-positions` | **No** explorer tx list; recomputes **`positions`** (and USD marks) from DB only. Still uses RPC/DeFiLlama where rebuild needs them. |
| `dyt positions [id]` | Table includes **NFT id** for concentrated-liquidity rows (`v3_nft`). |
| `dyt pnl [id]` | ROI / realized / unrealized from aggregated flows + **`current_value_usd`**. |
| `dyt positions -c 8453` / `dyt pnl -c 8453` | Filter to one chain (same id rules as `sync`). |

**USD caveat:** Historical USD in aggregates depends on indexed DeFiLlama (or cache) coverage. Missing quotes can understate amounts and PnL; the CLI repeats this after tables.

**Plan reference:** `docs/superpowers/plans/2026-03-24-positions-pnl-accuracy.md`

## Manual smoke (Task 8 — operators)

Run on your machine after `npm run build` and `.env` configured. Tick when done.

- [ ] **1.** `dyt add 0x0000000000000000000000000000000000000000` (or use existing tracked id).
- [ ] **2.** `dyt sync -c 8453` (or `dyt sync <id> -c 8453`) until txs index.
- [ ] **3.** `dyt positions` / `dyt pnl` and again with `-c 8453` if multi-chain.
- [ ] **4.** `dyt sync --rebuild-positions -c 8453` — **row counts and USD totals** match step 3 (no duplicate inflation).
- [ ] **5. (optional)** Compare active CL **NFT id** count vs BaseScan / Aerodrome for the **Sickle** address.

**Definition-of-done (human):** mark each row PASS / FAIL in your notes.

| Check | Pass criteria |
|-------|----------------|
| V2 row | ≥1 `v2_lp` with non-zero `totalDepositedUsd` or documented data gap |
| CL rows | Distinct NFT ids for distinct CL positions on same pool |
| Rebuild idempotency | Second `--rebuild-positions` does not inflate totals |
| PnL | Order-of-magnitude plausible vs expectations |
| Ambiguity | No silent wrong `nft_token_id` (warnings if indexer can’t resolve) |

## Development

```bash
npm run build
npx vitest run
```
