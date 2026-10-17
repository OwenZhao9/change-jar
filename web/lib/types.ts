import type { Address, Hex } from 'viem';

export type Change = { specHash: Hex; note: string; fee: bigint; timestamp: number; paidFromDeposit: boolean };
export type Project = { pm: Address; devs: Address[]; fee: bigint; deposit: bigint; jar: bigint; version: number; status: number };

export type Call =
  | { fn: 'createProject'; devs: Address[]; fee: bigint; specHash: Hex; value: bigint }
  | { fn: 'acknowledge'; id: bigint; version: number }
  | { fn: 'submitChange'; id: bigint; specHash: Hex; note: string; value: bigint }
  | { fn: 'launch'; id: bigint }
  | { fn: 'withdraw' };

export type TxStage = 'signing' | 'sent';
export type TxResult = { ms: number; mode: 'sync' | 'fallback'; hash: Hex; createdId?: bigint };

export interface Backend {
  readonly kind: 'chain' | 'memory';
  projectCount(): Promise<bigint>;
  project(id: bigint): Promise<Project>;
  changes(id: bigint): Promise<Change[]>;
  acks(id: bigint, devs: Address[], upto: number): Promise<Record<string, boolean>>; // key `${dev}:${version}`
  claimable(addr: Address): Promise<bigint>;
  balance(addr: Address): Promise<bigint>;
  blockNumber(): Promise<bigint>;
  send(pk: Hex, call: Call, onStage?: (s: TxStage) => void): Promise<TxResult>;
  fund(addr: Address): Promise<void>;
}
