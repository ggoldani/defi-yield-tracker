import { describe, it, expect } from 'vitest';
import { categorizeTransaction, type TxClassification } from '../../src/indexer/decoder.js';

describe('Transaction Categorizer', () => {
  describe('when transaction is Sickle-related', () => {
    it('categorizes deposit function as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x12345678',
        functionName: 'deposit(tuple,tuple,address[],address,bytes32)',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes simpleDeposit as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0xabcdef01',
        functionName: 'simpleDeposit(tuple,tuple,address,bytes32)',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes increase as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x11111111',
        functionName: 'increase(tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes withdraw as withdraw', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x22222222',
        functionName: 'withdraw(tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('withdraw');
    });

    it('categorizes harvest as harvest', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x33333333',
        functionName: 'harvest(tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('harvest');
    });

    it('categorizes compound as compound', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x44444444',
        functionName: 'compound(tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('compound');
    });

    it('categorizes exit as exit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x55555555',
        functionName: 'exit(tuple,tuple,address[],tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('exit');
    });

    it('categorizes rebalance as rebalance', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x66666666',
        functionName: 'rebalance(tuple,tuple)',
        isSickleRelated: true,
      });
      expect(category).toBe('rebalance');
    });

    it('categorizes harvestFor as harvest', () => {
      const category = categorizeTransaction({
        from: '0xAutomation',
        to: '0xStrategy',
        methodId: '0x77777777',
        functionName: 'harvestFor(address,tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('harvest');
    });

    it('categorizes compoundFor as compound', () => {
      const category = categorizeTransaction({
        from: '0xAutomation',
        to: '0xStrategy',
        methodId: '0x88888888',
        functionName: 'compoundFor(address,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('compound');
    });
  });

  describe('when transaction is not Sickle-related', () => {
    it('categorizes plain ETH transfer as transfer_out', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRecipient',
        methodId: '0x',
        functionName: '',
        isSickleRelated: false,
      });
      expect(category).toBe('transfer_out');
    });

    it('categorizes empty methodId as transfer_out', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRecipient',
        methodId: '',
        functionName: '',
        isSickleRelated: false,
      });
      expect(category).toBe('transfer_out');
    });

    it('categorizes approve as approval', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xToken',
        methodId: '0x095ea7b3',
        functionName: 'approve(address,uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('approval');
    });

    it('categorizes swap calls as swap', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRouter',
        methodId: '0x38ed1739',
        functionName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('swap');
    });

    it('categorizes unknown function as unknown', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xContract',
        methodId: '0x99999999',
        functionName: 'someRandomFunction(uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('unknown');
    });
  });
});
