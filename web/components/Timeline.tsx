'use client';
import type { Address } from 'viem';
import type { Change, Project } from '@/lib/types';
import { fmt } from './Mon';

type Props = {
  project: Project | null;
  changes: Change[];
  acks: Record<string, boolean>;
  canAck: Address | null; // 当前开发角色地址
  busy: boolean;
  onAck: (v: number) => void;
  pending: { version: number; note: string } | null; // 已发出、等待确认的变更单
};

const hhmmss = (t: number) => new Date(t * 1000).toLocaleTimeString('zh-CN', { hour12: false });

export function Timeline({ project, changes, acks, canAck, busy, onAck, pending }: Props) {
  const list = [...changes.map((c, v) => ({ c, v }))].reverse();
  const latest = changes.length - 1;
  const ghost = pending && pending.version > latest ? pending : null;
  const cashCount = changes.reduce((n, c, v) => n + (v > 0 && !c.paidFromDeposit ? 1 : 0), 0);
  return (
    <section className="panel timeline" aria-label="需求时间线">
      <div className="panel-head">
        <h2 className="px">需求时间线</h2>
        {changes.length > 0 && (
          <span className="head-meta">
            改了 <b className="px gold">{latest}</b> 次{cashCount > 0 && <> · 现付 <b className="px cash">{cashCount}</b></>}
          </span>
        )}
      </div>
      {changes.length === 0 && (
        <div className="empty">
          <ol className="rail skeleton" aria-hidden>
            {[0, 1, 2].map((k) => (
              <li key={k} className="vcard sk">
                <div className="vnode" />
                <div className="vbadge px">v{2 - k}</div>
                <div className="vbody"><i /><i /></div>
              </li>
            ))}
          </ol>
          <p className="dim">创建项目后，每提交一张变更单，这里多一版</p>
        </div>
      )}
      <ol className="rail">
        {ghost && (
          <li key={`p${ghost.version}`} className="vcard ghost" aria-live="polite">
            <div className="vnode" aria-hidden />
            <div className="vbadge px">v{ghost.version}</div>
            <div className="vbody">
              <div className="vnote">{ghost.note}</div>
              <div className="vmeta"><span className="confirming">区块确认中</span></div>
            </div>
          </li>
        )}
        {list.map(({ c, v }) => {
          const devs = project?.devs ?? [];
          const mine = canAck ? acks[`${canAck}:${v}`] : false;
          const isLatest = v === latest && v > 0;
          const cash = v > 0 && !c.paidFromDeposit;
          return (
            <li key={v} className={`vcard ${v === 0 ? 'v0' : ''} ${isLatest ? 'latest' : ''} ${cash ? 'cash' : ''}`}>
              <div className="vnode" aria-hidden />
              <div className="vbadge px">v{v}</div>
              <div className="vbody">
                <div className="vnote" title={v === 0 ? '初始需求' : c.note}>
                  {v === 0 ? '初始需求' : c.note}
                  {isLatest && <em className="newest">最新</em>}
                </div>
                <div className="vmeta">
                  <span className="time">{hhmmss(c.timestamp)}</span>
                  {v > 0 && (
                    <>
                      <span className="fee px">{fmt(c.fee)}</span>
                      <span className={`tag ${c.paidFromDeposit ? 'tag-dep' : 'tag-cash'}`}>{c.paidFromDeposit ? '保证金扣' : '现付'}</span>
                    </>
                  )}
                  <span className="acks">
                    {devs.map((d, i) => {
                      const ok = acks[`${d}:${v}`];
                      return <span key={d} className={`chip ${ok ? 'ok' : ''}`} title={`开发 ${i + 1}${ok ? ' 已收到' : ' 未确认'}`}>D{i + 1}{ok ? '✓' : ''}</span>;
                    })}
                  </span>
                </div>
              </div>
              {canAck && project?.status === 0 && !mine && (
                <button className="btn mini" disabled={busy} onClick={() => onAck(v)}>已收到</button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
