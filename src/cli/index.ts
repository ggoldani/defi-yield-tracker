import { Command } from 'commander';
import { getDb, closeDb } from '../db/connection.js';
import { setupAddCommand } from './commands/add.js';
import { setupSyncCommand } from './commands/sync.js';
import { setupPositionsCommand } from './commands/positions.js';
import { setupPnlCommand } from './commands/pnl.js';
import { setupHistoryCommand } from './commands/history.js';
import { setupListCommand } from './commands/list.js';
import { setupRemoveCommand } from './commands/remove.js';
import { log } from '../utils/logger.js';
import fs from 'node:fs';

const pkgPath = new URL('../../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

export function runCli(): void {
  const program = new Command();

  program
    .name('dyt')
    .description('DeFi Yield Tracker - CLI indexer for Sickle smart contract wallets')
    .version(pkg.version);

  // Setup commands
  setupAddCommand(program);
  setupSyncCommand(program);
  setupPositionsCommand(program);
  setupPnlCommand(program);
  setupHistoryCommand(program);
  setupListCommand(program);
  setupRemoveCommand(program);

  // Clean up database connection on exit
  const cleanup = () => {
    try {
      closeDb();
    } catch (e) {
      // Ignore cleanup errors
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Initialize DB before running
  try {
    getDb();
  } catch (err) {
    if (err instanceof Error) {
      log.error(`Database initialization failed: ${err.message}`);
      process.exit(1);
    }
  }

  program.parse(process.argv);
}
