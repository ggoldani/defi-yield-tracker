import type { Command } from 'commander';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { syncAddress } from '../../indexer/sync.js';
import { log } from '../../utils/logger.js';

export function setupSyncCommand(program: Command): void {
  program
    .command('sync [address_id]')
    .description('Sync on-chain transactions for tracked addresses')
    .option('-c, --chain <id>', 'Only sync a specific chain ID (e.g., 8453 for Base)')
    .action(async (addressIdStr?: string, options?: { chain?: string }) => {
      try {
        const db = getDb();
        const repo = new AddressRepo(db);
        
        let addresses = [];
        if (addressIdStr) {
          const id = parseInt(addressIdStr, 10);
          if (isNaN(id)) throw new Error('Address ID must be a number');
          const addr = repo.findById(id);
          if (!addr) throw new Error(`No address found with ID ${id}`);
          addresses.push(addr);
        } else {
          addresses = repo.findAll();
          if (addresses.length === 0) {
            log.info('No addresses to sync. Run `dyt add <address>` first.');
            return;
          }
        }

        const chainIds = options?.chain ? [parseInt(options.chain, 10)] : undefined;
        if (chainIds && isNaN(chainIds[0])) {
          throw new Error('Chain ID must be a number');
        }

        log.info(`Syncing ${addresses.length} address(es)...`);

        for (const addr of addresses) {
          await syncAddress(db, addr, chainIds);
        }
        
        log.success('Sync complete!');
      } catch (err) {
        if (err instanceof Error) {
          log.error(`Sync failed: ${err.message}`);
        }
      }
    });
}
