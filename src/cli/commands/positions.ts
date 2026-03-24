import type { Command } from 'commander';
import Table from 'cli-table3';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { PositionRepo } from '../../db/repositories/position.repo.js';
import { formatUsd, shortenAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';

export function setupPositionsCommand(program: Command): void {
  program
    .command('positions [address_id]')
    .description('View active and historical LP positions')
    .option('-a, --all', 'Show all positions including closed/exited ones', false)
    .action((addressIdStr?: string, options?: { all: boolean }) => {
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
          const activeOnly = !options?.all;
          const positions = positionRepo.findByAddress(addr.id!, { activeOnly });
          
          console.log(`\nPositions for ${addr.label || addr.address} (ID: ${addr.id})`);
          
          if (positions.length === 0) {
            console.log('  No positions found.');
            continue;
          }

          const table = new Table({
            head: ['Pool', 'Protocol', 'Chain', 'Tokens', 'Deposited', 'Withdrawn', 'Harvested', 'Status'],
            style: { head: ['cyan'] }
          });

          for (const pos of positions) {
            table.push([
              shortenAddress(pos.poolAddress, 6),
              pos.protocol,
              pos.chainId.toString(),
              `${pos.token0Symbol}/${pos.token1Symbol}`,
              formatUsd(pos.totalDepositedUsd),
              formatUsd(pos.totalWithdrawnUsd),
              formatUsd(pos.totalHarvestedUsd),
              pos.isActive ? 'Active' : 'Exited'
            ]);
          }

          console.log(table.toString());
        }
      } catch (err) {
        if (err instanceof Error) {
          log.error(err.message);
        }
      }
    });
}
