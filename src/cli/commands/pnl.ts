import type { Command } from 'commander';
import Table from 'cli-table3';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { PositionRepo } from '../../db/repositories/position.repo.js';
import { calculatePositionPnl } from '../../analytics/pnl.js';
import { formatUsd, formatPercent, shortenAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';

export function setupPnlCommand(program: Command): void {
  program
    .command('pnl [address_id]')
    .description('View PnL Analytics (ROI, Realized, Unrealized PnL)')
    .action((addressIdStr?: string) => {
      try {
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
          const positions = positionRepo.findByAddress(addr.id!);
          
          console.log(`\nPnL for ${addr.label || addr.address} (ID: ${addr.id})`);
          
          if (positions.length === 0) {
            console.log('  No positions found.');
            continue;
          }

          const table = new Table({
            head: ['Pool', 'Deposited', 'Current Val', 'Realized', 'Unrealized', 'Total PnL', 'ROI'],
            style: { head: ['cyan'] }
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
              totalGasCostUsd: pos.totalGasCostUsd
            });

            totalDep += pos.totalDepositedUsd;
            totalRealized += pnl.realizedPnl;
            totalUnrealized += pnl.unrealizedPnl;

            table.push([
              shortenAddress(pos.poolAddress, 6),
              formatUsd(pos.totalDepositedUsd),
              pos.isActive ? formatUsd(pos.currentValueUsd || 0) : '-',
              formatUsd(pnl.realizedPnl),
              formatUsd(pnl.unrealizedPnl),
              formatUsd(pnl.totalPnl),
              formatPercent(pnl.roi)
            ]);
          }
          
          // Summary row
          const totalAllPnl = totalRealized + totalUnrealized;
          const totalRoi = totalDep > 0 ? (totalAllPnl / totalDep) * 100 : 0;
          
          table.push([]); // Empty row separator
          table.push([
            'TOTAL',
            formatUsd(totalDep),
            '-',
            formatUsd(totalRealized),
            formatUsd(totalUnrealized),
            formatUsd(totalAllPnl),
            formatPercent(totalRoi)
          ]);

          console.log(table.toString());
        }
      } catch (err) {
        if (err instanceof Error) {
          log.error(err.message);
        }
      }
    });
}
