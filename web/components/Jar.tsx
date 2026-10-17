'use client';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther } from 'viem';
import type { Change, Project } from '@/lib/types';
import { sfx } from '@/lib/audio';
import { COIN, COIN_CASH, COIN_GOLD, Sprite, SpriteG } from './Sprite';
import { fmt } from './Mon';

const COLS = 5;
const SLOTS = 35;
const slot = (i: number) => {
  const s = i % SLOTS;
  const r = Math.floor(s / COLS);
  const c = s % COLS;
  const jitter = ((i * 7) % 5) - 2;
  return { x: 30 + c * 20 + jitter, y: 164 - r * 20 };
};
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Props = { project: Project | null; changes: Change[] };
type Coin = { i: number; fresh: boolean };

export const Jar = forwardRef<HTMLDivElement, Props>(function Jar({ project, changes }, ref) {
  const total = changes.length > 0 ? changes.length - 1 : 0; // 已提交变更数
  const launched = project?.status === 1;
  const [coins, setCoins] = useState<Coin[]>([]);
  const [stamp, setStamp] = useState<'none' | 'static' | 'slam'>('none');
  const [rain, setRain] = useState(0);
  const [shake, setShake] = useState(false);
  const [gone, setGone] = useState(false);
  const inited = useRef(false);
  const stampSeen = useRef(false);
  const queued = useRef(0);
  const nextAt = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 落币队列：首次读取直接摆好，之后新增的逐枚落下
  useEffect(() => {
    if (!inited.current) {
      inited.current = true;
      queued.current = total;
      setCoins(Array.from({ length: total }, (_, k) => ({ i: k + 1, fresh: false })));
      return;
    }
    if (total < queued.current) {
      queued.current = total;
      setCoins(Array.from({ length: total }, (_, k) => ({ i: k + 1, fresh: false })));
      return;
    }
    while (queued.current < total) {
      const i = ++queued.current;
      if (reduced()) { setCoins((c) => [...c, { i, fresh: false }]); later(sfx.coin, 0); continue; }
      const now = performance.now();
      const at = Math.max(now, nextAt.current);
      nextAt.current = at + 430;
      later(() => { setCoins((c) => [...c, { i, fresh: true }]); later(sfx.coin, 400); }, at - now);
    }
  }, [total]);

  // 上线后罐子清空
  useEffect(() => { setGone(launched); }, [launched]);

  const landed = coins.length;
  const spentLanded = useMemo(() => {
    let s = 0n;
    for (let k = 1; k <= landed && k < changes.length; k++) if (changes[k].paidFromDeposit) s += changes[k].fee;
    return s;
  }, [landed, changes]);
  const initialDeposit = useMemo(() => {
    if (!project) return 0n;
    let s = project.status === 0 ? project.deposit : 0n;
    for (let k = 1; k < changes.length; k++) if (changes[k].paidFromDeposit) s += changes[k].fee;
    return s;
  }, [project, changes]);
  const remaining = initialDeposit > spentLanded ? initialDeposit - spentLanded : 0n;
  const depleted = !!project && project.status === 0 && total >= 1 && project.deposit < project.fee;
  const allLanded = landed >= total;
  const visualDepleted = depleted && allLanded && remaining < project!.fee;

  // 盖章
  const prevDepleted = useRef(false);
  useEffect(() => {
    if (!project) { prevDepleted.current = false; setStamp('none'); return; }
    if (visualDepleted && !prevDepleted.current) {
      if (!stampSeen.current && landed === total && coins.every((c) => !c.fresh) ) {
        // 首次载入时已处于用完状态：直接显示
        stampSeen.current = true; setStamp('static');
      } else {
        stampSeen.current = true;
        later(() => {
          setStamp('slam'); setShake(true); setRain((n) => n + 1);
          sfx.stamp(); later(sfx.rain, 150);
          later(() => setShake(false), 600);
          later(() => setRain(0), 4200);
        }, reduced() ? 0 : 500);
      }
    }
    if (!visualDepleted && !depleted) { if (stamp !== 'none') setStamp('none'); }
    prevDepleted.current = visualDepleted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualDepleted, project]);

  const segs = project && initialDeposit > 0n ? Number(initialDeposit / project.fee) : 0;
  const lit = project && project.fee > 0n ? Number(remaining / project.fee) : 0;
  const pct = initialDeposit > 0n ? Number((remaining * 1000n) / initialDeposit) / 10 : 0;
  const landedFee = project ? project.fee * BigInt(landed) : 0n;
  const showCoins = !gone;

  return (
    <div className="jar-stage" ref={ref}>
      <div className={`jar-wrap ${shake ? 'shake' : ''} ${launched ? 'launched' : ''}`}>
        <svg className="jar-svg" viewBox="0 0 160 200" shapeRendering="crispEdges" role="img" aria-label="变更罐">
          <g className="glass-fill" fill="rgba(127,233,255,0.10)">
            <rect x="48" y="16" width="64" height="24" />
            <rect x="32" y="32" width="96" height="8" />
            <rect x="24" y="40" width="112" height="144" />
          </g>
          <g className={`coins ${showCoins ? '' : 'coins-out'}`}>
            {coins.map((c) => {
              const p = slot(c.i - 1);
              const paid = changes[c.i] ? !changes[c.i].paidFromDeposit : false;
              return (
                <g key={c.i} transform={`translate(${p.x} ${p.y})`}>
                  <g className={c.fresh ? 'coin-x' : ''} style={{ ['--dx' as string]: `${80 - 10 - p.x}px` }}>
                    <g className={c.fresh ? 'coin-y' : ''} style={{ ['--h' as string]: `${p.y + 50}px` }}>
                      <SpriteG map={COIN} palette={paid ? COIN_CASH : COIN_GOLD} cell={2.5} />
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
          <g fill="#8fe3ff">
            <rect x="36" y="8" width="88" height="8" />
            <rect x="40" y="16" width="8" height="16" />
            <rect x="112" y="16" width="8" height="16" />
            <rect x="24" y="32" width="16" height="8" />
            <rect x="120" y="32" width="16" height="8" />
            <rect x="16" y="40" width="8" height="8" />
            <rect x="136" y="40" width="8" height="8" />
            <rect x="16" y="48" width="8" height="136" />
            <rect x="136" y="48" width="8" height="136" />
            <rect x="24" y="184" width="112" height="8" />
          </g>
          <g fill="#ffffff" opacity="0.45">
            <rect x="28" y="56" width="4" height="64" />
            <rect x="28" y="128" width="4" height="8" />
            <rect x="52" y="18" width="4" height="12" />
          </g>
          <g fill="#3aa8c4" opacity="0.5">
            <rect x="128" y="52" width="4" height="120" />
            <rect x="24" y="176" width="112" height="4" />
          </g>
        </svg>
        {stamp !== 'none' && (
          <div className={`stamp ${stamp === 'slam' ? 'stamp-slam' : ''}`} role="status">
            <b>保证金已用完</b>
            <span>之后每次现付</span>
          </div>
        )}
        {launched && <div className="launched-tag px">已上线</div>}
      </div>

      <div className="jar-readout">
        <div className="tally">
          <span className="px big">{launched ? 0 : landed}</span>
          <span>枚 · 共 <b className="gold">{launched ? '0' : fmt(landedFee)}</b> MON</span>
        </div>
        {project && (
          <div className="deposit" aria-label="剩余保证金">
            <div className="deposit-head">
              <span>剩余保证金</span>
              <b className={remaining < project.fee && !launched ? 'red' : ''}>{launched ? '—' : fmt(remaining)} MON</b>
            </div>
            <div className="bar">
              {segs > 0 && segs <= 24
                ? Array.from({ length: segs }, (_, k) => <i key={k} className={k < lit ? 'on' : ''} />)
                : <i className="on" style={{ width: `${pct}%`, flex: 'none' }} />}
            </div>
          </div>
        )}
      </div>

      {rain > 0 && (
        <div className="rain" aria-hidden key={rain}>
          {Array.from({ length: 44 }, (_, k) => {
            const left = (k * 37) % 100;
            const size = 12 + ((k * 13) % 14);
            const delay = ((k * 29) % 100) / 70;
            const dur = 1.3 + ((k * 17) % 10) / 9;
            return (
              <span key={k} style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s`, width: size, height: size }}>
                <Sprite map={COIN} palette={k % 5 === 0 ? COIN_CASH : COIN_GOLD} cell={size / 8} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});

export { formatEther };
