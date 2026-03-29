import type { Command } from 'commander';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { validateAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';
import { CHAINS } from '../../config.js';

export function setupAddCommand(program: Command): void {
  program
    .command('add <address>')
    .description('Add a new EVM wallet address to track')
    .option('-l, --label <string>', 'Optional label for the address (e.g., "Main Wallet")', '')
    .option('-s, --sickle <address>', 'Manually set the Sickle Wallet address to bypass auto-discovery')
    .action((addressStr: string, options: { label: string, sickle?: string }) => {
      try {
        const address = validateAddress(addressStr);
        const db = getDb();
        const repo = new AddressRepo(db);

        const existing = repo.findByAddress(address);
        if (existing) {
          log.warn(`Address ${address} is already being tracked as "${existing.label}"`);
          log.info('To assign a sickle manual address, remove it first using `dyt remove` and re-add it.');
          return;
        }

        const initialSickles: Record<number, string> = {};
        if (options.sickle) {
          const sickleAddr = validateAddress(options.sickle);
          for (const chainId of Object.keys(CHAINS)) {
            initialSickles[parseInt(chainId, 10)] = sickleAddr.toLowerCase();
          }
          log.info(`Manual Sickle address provided. Auto-discovery will be bypassed.`);
        }

        const id = repo.add(address, options.label, initialSickles);
        log.success(`Added address ${address} (ID: ${id}) with label "${options.label}"`);
        log.info('Run `dyt sync` to fetch transactions for this address.');
      } catch (err) {
        if (err instanceof Error) {
          log.error(err.message);
        }
      }
    });
}
