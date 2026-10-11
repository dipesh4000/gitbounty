export type PaymentConfig = { enabled: boolean; chain_id: number; symbol: string; network: string;
  testnet: boolean; token_address: string | null; decimals: number; explorer: string; configuration_message?: string | null; provider?: string; fee_limit_usdc?: string };

export function promisedReward(bounty: { reward_avax?: string | null; reward_usdc?: string | null }) {
  if (bounty.reward_usdc) return `${bounty.reward_usdc} USDC · Fuji testnet`;
  if (bounty.reward_avax) return `${bounty.reward_avax} AVAX · Mainnet`;
  return null;
}
