import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

export type Role = 'pm' | 'dev1' | 'dev2';
export const ROLES: Role[] = ['pm', 'dev1', 'dev2'];
export const ROLE_LABEL: Record<Role, string> = { pm: '产品经理', dev1: '开发 1', dev2: '开发 2' };
export type Wallet = { role: Role; pk: Hex; address: Address };

const KEY = 'cj.wallets.v1';

export function loadWallets(): Record<Role, Wallet> {
  let stored: Partial<Record<Role, Hex>> = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const out = {} as Record<Role, Wallet>;
  let changed = false;
  for (const r of ROLES) {
    let pk = stored[r];
    if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) { pk = generatePrivateKey(); stored[r] = pk; changed = true; }
    out[r] = { role: r, pk, address: privateKeyToAccount(pk).address };
  }
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch {} }
  return out;
}
