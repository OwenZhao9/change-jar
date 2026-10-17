'use client';
import { forwardRef } from 'react';
import type { Address } from 'viem';
import type { Project } from '@/lib/types';
import { AVATAR, AVATAR_PM, PAL_D1, PAL_D2, PAL_PM, Sprite } from './Sprite';
import { Mon } from './Mon';

type Props = {
  project: Project | null;
  jarShown: bigint; // 罐内已落地金额
  claimable: [bigint, bigint];
  balances: [bigint, bigint];
  active: number; // 当前角色: 0 = dev1, 1 = dev2, -1 其他
  busy: boolean;
  onClaim: (i: number) => void;
  refs: React.RefObject<(HTMLDivElement | null)[]>;
  flown: boolean;
};

export function Devs({ project, jarShown, claimable, balances, active, busy, onClaim, refs, flown }: Props) {
  const n = project ? project.devs.length : 2;
  const launched = project?.status === 1;
  const est = project ? (launched ? project.jar : jarShown) / BigInt(Math.max(1, n)) : 0n;
  return (
    <section className="panel devs" aria-label="开发者">
      <h2 className="px">开发者</h2>
      {[0, 1].map((i) => {
        const c = claimable[i];
        const waiting = launched && flown && c > 0n;
        return (
          <div key={i} className={`dev ${active === i ? 'me' : ''}`}>
            <div className="avatar" ref={(el) => { if (refs.current) refs.current[i] = el; }}>
              <Sprite map={AVATAR} palette={i === 0 ? PAL_D1 : PAL_D2} cell={6} />
            </div>
            <div className="dev-info">
              <div className="dev-name px">开发 {i + 1}</div>
              <div className="share">
                {launched ? '已分得' : '将分得'} <b className="gold px big"><Mon value={launched ? (flown ? (c > 0n ? c : est) : 0n) : est} /></b> MON
              </div>
              <div className="dim small">钱包余额 <Mon value={balances[i]} /> MON</div>
              {waiting && (
                <button className="btn gold-btn" disabled={busy} onClick={() => onClaim(i)}>领取 <Mon value={c} /> MON</button>
              )}
              {launched && flown && c === 0n && <div className="ok small">已领取</div>}
            </div>
          </div>
        );
      })}
      <p className="dim small note">上线前的数字为预估</p>
    </section>
  );
}

export function PmCard({ claimable, balance, launched, busy, onClaim, active }: { claimable: bigint; balance: bigint; launched: boolean; busy: boolean; onClaim: () => void; active: boolean }) {
  return (
    <div className={`pmcard ${active ? 'me' : ''}`}>
      <Sprite map={AVATAR_PM} palette={PAL_PM} cell={3} />
      <div className="dev-info">
        <div className="px small">产品经理</div>
        <div className="dim small">钱包余额 <Mon value={balance} /> MON</div>
        {launched && claimable > 0n && <button className="btn mini" disabled={busy} onClick={onClaim}>领取退回 <Mon value={claimable} /> MON</button>}
      </div>
    </div>
  );
}
