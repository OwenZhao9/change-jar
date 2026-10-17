// 仅本地开发使用的内存合约，逻辑与 ChangeJar.sol 一致
import { keccak256, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Backend, Call, Change, Project, TxResult } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STORE = 'cj.mem.v1';

type Mem = {
  projects: Project[];
  changes: Change[][];
  acks: Record<string, boolean>;
  claim: Record<string, bigint>;
  bal: Record<string, bigint>;
  block: number;
};

export function createMemBackend(): Backend {
  const m: Mem = { projects: [], changes: [], acks: {}, claim: {}, bal: {}, block: 1000 };
  const low = (a: string) => a.toLowerCase();
  const get = (id: bigint) => {
    const p = m.projects[Number(id)];
    if (!p) throw new Error('no project');
    return p;
  };
  const active = (id: bigint) => {
    const p = get(id);
    if (p.status !== 0) throw new Error('not active');
    return p;
  };
  const clone = (p: Project): Project => ({ ...p, devs: [...p.devs] });
  void STORE; void keccak256; void toHex;

  return {
    kind: 'memory',
    async projectCount() { return BigInt(m.projects.length); },
    async project(id) { return clone(get(id)); },
    async changes(id) { get(id); return m.changes[Number(id)].map((c) => ({ ...c })); },
    async acks(id, devs, upto) {
      const out: Record<string, boolean> = {};
      for (const d of devs) for (let v = 0; v <= upto; v++) out[`${d}:${v}`] = !!m.acks[`${id}:${low(d)}:${v}`];
      return out;
    },
    async claimable(a) { return m.claim[low(a)] ?? 0n; },
    async balance(a) { return m.bal[low(a)] ?? 0n; },
    async blockNumber() { return BigInt(m.block); },
    async fund(a) { await sleep(300); m.bal[low(a)] = (m.bal[low(a)] ?? 0n) + 5_000000000000000000n; },
    async send(pk: Hex, call: Call): Promise<TxResult> {
      const t0 = performance.now();
      const who = low(privateKeyToAccount(pk).address);
      await sleep(350 + Math.random() * 250);
      const bal = m.bal[who] ?? 0n;
      const value = 'value' in call ? call.value : 0n;
      if (bal < value) throw new Error('insufficient funds');
      let createdId: bigint | undefined;
      switch (call.fn) {
        case 'createProject': {
          if (call.devs.length < 1 || call.devs.length > 10) throw new Error('devs count');
          if (call.fee <= 0n) throw new Error('fee zero');
          if (value < call.fee) throw new Error('deposit < fee');
          const set = new Set(call.devs.map(low));
          if (set.size !== call.devs.length || set.has(who)) throw new Error('bad devs');
          const pm = privateKeyToAccount(pk).address;
          m.projects.push({ pm, devs: [...call.devs], fee: call.fee, deposit: value, jar: 0n, version: 0, status: 0 });
          m.changes.push([{ specHash: call.specHash, note: '', fee: 0n, timestamp: Math.floor(Date.now() / 1000), paidFromDeposit: false }]);
          createdId = BigInt(m.projects.length - 1);
          break;
        }
        case 'acknowledge': {
          const p = active(call.id);
          if (!p.devs.some((d) => low(d) === who)) throw new Error('not dev');
          if (call.version > p.version) throw new Error('future version');
          m.acks[`${call.id}:${who}:${call.version}`] = true;
          break;
        }
        case 'submitChange': {
          const p = active(call.id);
          if (low(p.pm) !== who) throw new Error('not pm');
          let fromDeposit = false;
          if (p.deposit >= p.fee) {
            if (value !== 0n) throw new Error('no payment needed');
            p.deposit -= p.fee;
            fromDeposit = true;
          } else if (value !== p.fee) throw new Error('pay exact fee');
          p.jar += p.fee;
          p.version += 1;
          m.changes[Number(call.id)].push({ specHash: call.specHash, note: call.note, fee: p.fee, timestamp: Math.floor(Date.now() / 1000), paidFromDeposit: fromDeposit });
          break;
        }
        case 'launch': {
          const p = active(call.id);
          if (low(p.pm) !== who && !p.devs.some((d) => low(d) === who)) throw new Error('not member');
          p.status = 1;
          const n = BigInt(p.devs.length);
          const per = p.jar / n;
          for (const d of p.devs) m.claim[low(d)] = (m.claim[low(d)] ?? 0n) + per;
          m.claim[low(p.pm)] = (m.claim[low(p.pm)] ?? 0n) + p.deposit + (p.jar % n);
          p.deposit = 0n;
          break;
        }
        case 'withdraw': {
          const c = m.claim[who] ?? 0n;
          if (c === 0n) throw new Error('nothing to claim');
          m.claim[who] = 0n;
          m.bal[who] = (m.bal[who] ?? 0n) + c;
          break;
        }
      }
      m.bal[who] = (m.bal[who] ?? 0n) - value;
      m.block += 1;
      const hash = keccak256(toHex(`${who}:${m.block}:${Math.random()}`));
      return { ms: Math.round(performance.now() - t0), mode: 'sync', hash, createdId };
    },
  };
}
export type { Address };
