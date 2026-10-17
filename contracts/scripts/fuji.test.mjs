import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuration } from './fuji.mjs';

const signer = '0x2222222222222222222222222222222222222222';
test('Fuji configuration accepts a public signer without requiring a private key', () => {
  assert.equal(configuration({ ESCROW_AUTHORIZATION_SIGNER: signer }).signer, signer);
});
test('preflight rejects wrong chain, token, missing signer, and mismatched key', () => {
  for (const env of [
    {},
    { ESCROW_AUTHORIZATION_SIGNER: signer, ESCROW_CHAIN_ID: '43114' },
    { ESCROW_AUTHORIZATION_SIGNER: signer, ESCROW_TOKEN_ADDRESS: signer },
    { ESCROW_AUTHORIZATION_SIGNER: signer, ESCROW_SIGNER_PRIVATE_KEY: '0x' + '11'.repeat(32) },
    { ESCROW_AUTHORIZATION_SIGNER: signer, FUJI_DEPLOYER_PRIVATE_KEY: 'invalid' },
  ]) assert.throws(() => configuration(env));
});
test('deployer cannot also be the authorization signer', () => {
  assert.throws(() => configuration({ ESCROW_SIGNER_PRIVATE_KEY: '0x' + '11'.repeat(32), FUJI_DEPLOYER_PRIVATE_KEY: '0x' + '11'.repeat(32) }), /separate/);
});
