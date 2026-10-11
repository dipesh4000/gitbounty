import type { EIP1193Provider } from "viem";

export type WalletOption = { id: string; name: string; provider: EIP1193Provider };
let selected: EIP1193Provider | undefined;

export function selectWallet(provider?: EIP1193Provider) { selected = provider; }
export function walletProvider() {
  return selected ?? (window as Window & { ethereum?: EIP1193Provider }).ethereum;
}

// Discovery only: never request accounts or signatures until the user clicks.
export function discoverWallets(update: (wallets: WalletOption[]) => void) {
  const wallets: WalletOption[] = [];
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: EIP1193Provider }>).detail;
    if (!detail?.provider || !detail.info?.uuid || wallets.some(wallet => wallet.id === detail.info.uuid)) return;
    wallets.push({ id: detail.info.uuid, name: detail.info.name, provider: detail.provider });
    update([...wallets]);
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  const fallback = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!wallets.length && fallback) wallets.push({ id: "default", name: "Browser default wallet", provider: fallback });
  update([...wallets]);
  return () => window.removeEventListener("eip6963:announceProvider", announce);
}

export function walletError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Wallet connection failed.";
  if (/tab is not active|requested resource not available/i.test(message)) return "Your wallet is unavailable. Open and unlock the selected wallet, finish its setup, then retry here. You can select another installed wallet. Do not reset an existing wallet without its recovery phrase.";
  if (/user rejected|user denied/i.test(message)) return "Wallet request cancelled. Retry when you are ready to connect or sign.";
  return message;
}
