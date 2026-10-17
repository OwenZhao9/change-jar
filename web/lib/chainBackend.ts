import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseEventLogs, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { changeJarAbi } from './abi';
import { CONTRACT_ADDRESS, FAUCET_API, monadTestnet, RPC_URL } from './config';
import type { Backend, Call, Change, Project, TxResult } from './types';

function encode(call: Call): { data: Hex; value: bigint } {
  switch (call.fn) {
    case 'createProject':
      return { data: encodeFunctionData({ abi: changeJarAbi, functionName: 'createProject', args: [call.devs, call.fee, call.specHash] }), value: call.value };
    case 'acknowledge':
      return { data: encodeFunctionData({ abi: changeJarAbi, functionName: 'acknowledge', args: [call.id, call.version] }), value: 0n };
    case 'submitChange':
      return { data: encodeFunctionData({ abi: changeJarAbi, functionName: 'submitChange', args: [call.id, call.specHash, call.note] }), value: call.value };
    case 'launch':
      return { data: encodeFunctionData({ abi: changeJarAbi, functionName: 'launch', args: [call.id] }), value: 0n };
    case 'withdraw':
      return { data: encodeFunctionData({ abi: changeJarAbi, functionName: 'withdraw' }), value: 0n };
  }
}

export function createChainBackend(): Backend {
  const address = CONTRACT_ADDRESS as Address;
  const pub = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });
  const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
    pub.readContract({ address, abi: changeJarAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

  return {
    kind: 'chain',
    projectCount: () => read<bigint>('projectCount'),
    async project(id) {
      const p = await read<{ pm: Address; devs: readonly Address[]; fee: bigint; deposit: bigint; jar: bigint; version: number; status: number }>('getProject', [id]);
      return { pm: p.pm, devs: [...p.devs], fee: p.fee, deposit: p.deposit, jar: p.jar, version: Number(p.version), status: Number(p.status) } satisfies Project;
    },
    async changes(id) {
      const cs = await read<readonly { specHash: Hex; note: string; fee: bigint; timestamp: bigint; paidFromDeposit: boolean }[]>('getChanges', [id]);
      return cs.map((c): Change => ({ specHash: c.specHash, note: c.note, fee: c.fee, timestamp: Number(c.timestamp), paidFromDeposit: c.paidFromDeposit }));
    },
    async acks(id, devs, upto) {
      const keys: string[] = [];
      const contracts = [];
      for (const d of devs) for (let v = 0; v <= upto; v++) {
        keys.push(`${d}:${v}`);
        contracts.push({ address, abi: changeJarAbi, functionName: 'acknowledged', args: [id, d, v] } as const);
      }
      const out: Record<string, boolean> = {};
      try {
        const res = await pub.multicall({ contracts, allowFailure: false });
        res.forEach((r, i) => (out[keys[i]] = Boolean(r)));
      } catch {
        for (let i = 0; i < contracts.length; i++) {
          out[keys[i]] = Boolean(await pub.readContract(contracts[i]));
        }
      }
      return out;
    },
    claimable: (addr) => read<bigint>('claimable', [addr]),
    balance: (addr) => pub.getBalance({ address: addr }),
    blockNumber: () => pub.getBlockNumber(),
    async send(pk, call, onStage): Promise<TxResult> {
      const account = privateKeyToAccount(pk);
      const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
      const { data, value } = encode(call);
      onStage?.('signing');
      // 估算 gas 时会暴露合约回滚原因
      const prepared = await wallet.prepareTransactionRequest({ to: address, data, value });
      const serialized = await wallet.signTransaction(prepared);
      const hash = keccak256(serialized);
      let receipt;
      let mode: 'sync' | 'fallback' = 'sync';
      onStage?.('sent');
      const t0 = performance.now(); // 从发出已签名交易到拿到回执
      try {
        receipt = await wallet.sendRawTransactionSync({ serializedTransaction: serialized });
      } catch {
        // 退路：同一笔已签名交易普通发送（节点已收到时忽略报错），再等回执
        mode = 'fallback';
        try { await pub.sendRawTransaction({ serializedTransaction: serialized }); } catch {}
        receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      }
      const ms = Math.round(performance.now() - t0);
      if (receipt.status !== 'success') throw new Error('交易被合约拒绝');
      let createdId: bigint | undefined;
      if (call.fn === 'createProject') {
        const logs = parseEventLogs({ abi: changeJarAbi, eventName: 'ProjectCreated', logs: receipt.logs });
        if (logs[0]) createdId = logs[0].args.id;
        else createdId = (await read<bigint>('projectCount')) - 1n;
      }
      return { ms, mode, hash: receipt.transactionHash, createdId };
    },
    async fund(addr) {
      const r = await fetch(FAUCET_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: 10143, address: addr }),
      });
      if (!r.ok) throw new Error('faucet ' + r.status);
    },
  };
}
