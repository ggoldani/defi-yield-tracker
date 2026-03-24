import type { Command } from 'commander';
import { CHAINS } from '../../config.js';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { rebuildPositionsOnlyForAddress, syncAddress } from '../../indexer/sync.js';
import { log } from '../../utils/logger.js';

export function setupSyncCommand(program: Command): void {
  program
    .command('sync [address_id]')
    .description('Sync on-chain transactions for tracked addresses')
    .option('-c, --chain <id>', 'Only sync a specific chain ID (e.g., 8453 for Base)')
    .option(
      '-r, --rebuild-positions',
      'Skip explorer fetch; recompute positions from existing transactions only (decoder/DB repair/migration). If set, overrides normal sync fetch.',
      false,
    )
    .action(
      async (
        addressIdStr?: string,
        options?: { chain?: string; rebuildPositions?: boolean },
      ) => {
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

        let chainIds: number[] | undefined;
        if (options?.chain !== undefined) {
          const id = parseInt(options.chain, 10);
          if (Number.isNaN(id)) throw new Error('Chain ID must be a number');
          if (!CHAINS[id]) {
            const supported = Object.keys(CHAINS).join(', ');
            throw new Error(`Unknown or unsupported chain ID: ${options.chain} (supported: ${supported})`);
          }
          chainIds = [id];
        }

        const rebuildOnly = options?.rebuildPositions === true;

        if (rebuildOnly) {
          log.info(`Rebuilding positions for ${addresses.length} address(es) (no new tx fetch)...`);
          for (const addr of addresses) {
            await rebuildPositionsOnlyForAddress(db, addr, chainIds);
          }
          log.success('Position rebuild complete!');
        } else {
          log.info(`Syncing ${addresses.length} address(es)...`);
          for (const addr of addresses) {
            await syncAddress(db, addr, chainIds);
          }
          log.success('Sync complete!');
        }
      } catch (err) {
        if (err instanceof Error) {
          const mode =
            options?.rebuildPositions === true ? 'Position rebuild' : 'Sync';
          log.error(`${mode} failed: ${err.message}`);
        }
      }
    });
}
