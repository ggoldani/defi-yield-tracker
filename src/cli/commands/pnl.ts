import type { Command } from 'commander';
import Table from 'cli-table3';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { PositionRepo } from '../../db/repositories/position.repo.js';
import { calculatePositionPnl } from '../../analytics/pnl.js';
import { formatUsd, formatPercent, shortenAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';
import { CLI_HISTORICAL_PRICE_CAVEAT, resolveChainFilter } from '../chainFilter.js';

function nftIdCell(pos: { positionKind: string; nftTokenId: string }): string {
  return pos.positionKind === 'v3_nft' && pos.nftTokenId.trim() !== '' ? pos.nftTokenId : '-';
}

export function setupPnlCommand(program: Command): void {
  program
    .command('pnl [address_id]')
    .description(
      'View PnL analytics (ROI, realized / unrealized). ' + CLI_HISTORICAL_PRICE_CAVEAT,
    )
    .option('-c, --chain <id>', 'Only show PnL for positions on this chain ID (e.g. 8453 for Base)')
    .action((addressIdStr?: string, options?: { chain?: string }) => {
      try {
        const chainId = resolveChainFilter(options?.chain);

        const db = getDb();
        const addressRepo = new AddressRepo(db);
        const positionRepo = new PositionRepo(db);

        let addresses = [];
        if (addressIdStr) {
          const id = parseInt(addressIdStr, 10);
          const addr = addressRepo.findById(id);
          if (!addr) throw new Error(`No address found with ID ${id}`);
          addresses.push(addr);
        } else {
          addresses = addressRepo.findAll();
        }

        if (addresses.length === 0) {
          log.info('No tracked addresses found.');
          return;
        }

        for (const addr of addresses) {
          const positions = positionRepo.findByAddress(addr.id!, { chainId });

          const chainNote = chainId !== undefined ? ` (chain ${chainId})` : '';
          console.log(`\nPnL for ${addr.label || addr.address} (ID: ${addr.id})${chainNote}`);

          if (positions.length === 0) {
            console.log('  No positions found.');
            log.info(CLI_HISTORICAL_PRICE_CAVEAT);
            continue;
          }

          const table = new Table({
            head: [
              'Pool',
              'NFT id',
              'Deposited',
              'Current Val',
              'Realized',
              'Unrealized',
              'Total PnL',
              'ROI',
            ],
            style: { head: ['cyan'] },
          });

          let totalDep = 0;
          let totalRealized = 0;
          let totalUnrealized = 0;

          for (const pos of positions) {
            const pnl = calculatePositionPnl({
              totalDepositedUsd: pos.totalDepositedUsd,
              totalWithdrawnUsd: pos.totalWithdrawnUsd,
              totalHarvestedUsd: pos.totalHarvestedUsd,
              currentValueUsd: pos.currentValueUsd || 0,
              totalGasCostUsd: pos.totalGasCostUsd,
            });

            totalDep += pos.totalDepositedUsd;
            totalRealized += pnl.realizedPnl;
            totalUnrealized += pnl.unrealizedPnl;

            table.push([
              shortenAddress(pos.poolAddress, 6),
              nftIdCell(pos),
              formatUsd(pos.totalDepositedUsd),
              pos.isActive ? formatUsd(pos.currentValueUsd || 0) : '-',
              formatUsd(pnl.realizedPnl),
              formatUsd(pnl.unrealizedPnl),
              formatUsd(pnl.totalPnl),
              formatPercent(pnl.roi),
            ]);
          }

          const totalAllPnl = totalRealized + totalUnrealized;
          const totalRoi = totalDep > 0 ? (totalAllPnl / totalDep) * 100 : 0;

          table.push([]);
          table.push([
            'TOTAL',
            '-',
            formatUsd(totalDep),
            '-',
            formatUsd(totalRealized),
            formatUsd(totalUnrealized),
            formatUsd(totalAllPnl),
            formatPercent(totalRoi),
          ]);

          console.log(table.toString());
          log.info(CLI_HISTORICAL_PRICE_CAVEAT);
        }
      } catch (err) {
        if (err instanceof Error) {
          log.error(err.message);
        }
      }
    });
}
