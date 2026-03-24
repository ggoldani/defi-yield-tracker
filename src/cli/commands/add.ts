import type { Command } from 'commander';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { validateAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';

export function setupAddCommand(program: Command): void {
  program
    .command('add <address>')
    .description('Add a new EVM wallet address to track')
    .option('-l, --label <string>', 'Optional label for the address (e.g., "Main Wallet")', '')
    .action((addressStr: string, options: { label: string }) => {
      try {
        const address = validateAddress(addressStr);
        const db = getDb();
        const repo = new AddressRepo(db);

        const existing = repo.findByAddress(address);
        if (existing) {
          log.warn(`Address ${address} is already being tracked as "${existing.label}"`);
          return;
        }

        const id = repo.add(address, options.label);
        log.success(`Added address ${address} (ID: ${id}) with label "${options.label}"`);
        log.info('Run `dyt sync` to fetch transactions for this address.');
      } catch (err) {
        if (err instanceof Error) {
          log.error(err.message);
        }
      }
    });
}
