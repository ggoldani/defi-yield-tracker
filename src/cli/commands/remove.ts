import chalk from 'chalk';
import type { Command } from 'commander';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';

export function setupRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Remove a tracked address and all its associated data')
    .argument('<id_or_address>', 'The numeric ID or the hex address to remove')
    .action((input: string) => {
      const db = getDb();
      const addressRepo = new AddressRepo(db);
      
      let addrRecord;
      if (input.startsWith('0x')) {
        addrRecord = addressRepo.findByAddress(input);
      } else {
        const id = parseInt(input, 10);
        if (!isNaN(id)) {
          addrRecord = addressRepo.findById(id);
        }
      }
      
      if (!addrRecord) {
        console.error(chalk.red(`\nError: Could not find address matching "${input}".\n`));
        console.log(chalk.gray('Use `dyt list` to see all tracked addresses and their IDs.'));
        process.exit(1);
      }
      
      try {
        addressRepo.remove(addrRecord.id!);
        console.log(chalk.green(`\n✓ Successfully removed address ${addrRecord.address} (ID: ${addrRecord.id})\n`));
      } catch (err) {
        console.error(chalk.red(`\nFailed to remove address: ${(err as Error).message}\n`));
        process.exit(1);
      }
    });
}
