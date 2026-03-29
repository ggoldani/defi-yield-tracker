import chalk from 'chalk';
import type { Command } from 'commander';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { CHAINS } from '../../config.js';

export function setupListCommand(program: Command): void {
  program
    .command('list')
    .description('List all tracked addresses')
    .action(() => {
      const db = getDb();
      const addressRepo = new AddressRepo(db);
      
      const addresses = addressRepo.findAll();
      
      if (addresses.length === 0) {
        console.log(chalk.yellow('No addresses are currently being tracked.'));
        console.log(chalk.gray('Use `dyt add <address>` to get started.'));
        return;
      }
      
      console.log(chalk.blue.bold('\nTracked Addresses:\n'));
      
      for (const addr of addresses) {
        console.log(`ID: ${chalk.green(addr.id!.toString())} | Label: ${chalk.cyan(addr.label || 'None')}`);
        console.log(`EOA: ${chalk.whiteBright(addr.address)}`);
        
        const sickleCount = Object.keys(addr.sickleAddresses).length;
        if (sickleCount > 0) {
          console.log(chalk.gray('  Discovered Sickle Wallets:'));
          for (const [chainIdStr, sickleAddr] of Object.entries(addr.sickleAddresses)) {
            const chainId = parseInt(chainIdStr, 10);
            const chainName = CHAINS[chainId]?.name || `Chain ${chainId}`;
            console.log(chalk.gray(`    - ${chainName}: ${sickleAddr}`));
          }
        } else {
          console.log(chalk.gray('  No Sickle Wallets discovered yet. Run `dyt sync`.'));
        }
        console.log(''); // newline
      }
    });
}
