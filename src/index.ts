#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('dyt')
  .description('DeFi Yield Tracker — Track your LP positions, harvests, and PnL')
  .version('0.1.0');

// Commands will be added in Task 6
program.parse();
