'use client';
import type { Address } from 'viem';
import type { Change, Project } from '@/lib/types';
import { EXPLORER_URL } from '@/lib/config';
import { fmt } from './Mon';

type Props = {
  project: Project | null;
  changes: Change[];
  acks: Record<string, boolean>;
  canAck: Address | null; // 当前开发角色地址
  busy: boolean;
  onAck: (v: number) => void;
  addrLink?: string;
};

const hhmmss = (t: number) => new Date(t * 1000).toLocaleTimeString('zh-CN', { hour12: false });

export function Timeline({ project, changes, acks, canAck, busy, onAck }: Props) {
  const list = [...changes.map((c, v) => ({ c, v }))].reverse();
  return (
    <section className="panel timeline" aria-label="需求时间线">
      <h2 className="px">需求时间线</h2>
      {changes.length === 0 && <p className="dim empty">创建项目后，这里记录每一版需求</p>}
      <ol>
        {list.map(({ c, v }) => {
          const devs = project?.devs ?? [];
          const mine = canAck ? acks[`${canAck}:${v}`] : false;
          return (
            <li key={v} className={`vcard ${v === 0 ? 'v0' : ''}`}>
              <div className="vbadge px">v{v}</div>
              <div className="vbody">
                <div className="vnote">{v === 0 ? '初始需求' : c.note}</div>
                <div className="vmeta">
                  <span>{hhmmss(c.timestamp)}</span>
                  {v > 0 && (
                    <>
                      <span className="gold">{fmt(c.fee)} MON</span>
                      <span className={`tag ${c.paidFromDeposit ? 'tag-dep' : 'tag-cash'}`}>{c.paidFromDeposit ? '保证金扣' : '现付'}</span>
                    </>
                  )}
                  {devs.map((d, i) => (
                    <span key={d} className={`chip ${acks[`${d}:${v}`] ? 'ok' : ''}`}>D{i + 1}{acks[`${d}:${v}`] ? '✓' : '·'}</span>
                  ))}
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
void EXPLORER_URL;
