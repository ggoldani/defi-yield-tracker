import type { Command } from 'commander';
import Table from 'cli-table3';
import { getDb } from '../../db/connection.js';
import { AddressRepo } from '../../db/repositories/address.repo.js';
import { TransactionRepo } from '../../db/repositories/transaction.repo.js';
import { formatUsd, shortenAddress } from '../../utils/format.js';
import { log } from '../../utils/logger.js';

export function setupHistoryCommand(program: Command): void {
  program
    .command('history [address_id]')
    .description('View recent transaction history')
    .option('-l, --limit <number>', 'Number of transactions to show', '20')
    .action((addressIdStr?: string, options?: { limit: string }) => {
      try {
        const db = getDb();
        const addressRepo = new AddressRepo(db);
        const txRepo = new TransactionRepo(db);
        
        const limit = parseInt(options?.limit || '20', 10);
        if (isNaN(limit)) throw new Error('Limit must be a number');

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
          const txs = txRepo.findByAddress(addr.id!, { limit });
          
          console.log(`\nHistory for ${addr.label || addr.address} (ID: ${addr.id})`);
          
          if (txs.length === 0) {
            console.log('  No transactions found.');
            continue;
          }

          const table = new Table({
            head: ['Date', 'Category', 'Protocol', 'Tx Hash', 'Gas Cost'],
            style: { head: ['cyan'] }
          });

          for (const tx of txs) {
            const date = new Date(tx.timestamp * 1000).toLocaleString();
            table.push([
              date,
              tx.category.toUpperCase(),
              tx.protocol || '-',
              shortenAddress(tx.hash, 10),
              formatUsd(tx.gasCostUsd)
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
