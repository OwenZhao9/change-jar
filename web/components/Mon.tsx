'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';

export function fmt(v: bigint, max = 4): string {
  const n = Number(formatEther(v));
  return n.toFixed(max).replace(/\.?0+$/, '') || '0';
}

/** 数字跳动 */
export function Mon({ value, className }: { value: bigint; className?: string }) {
  const [shown, setShown] = useState(Number(formatEther(value)));
  const from = useRef(shown);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    const to = Number(formatEther(value));
    const start = from.current;
    if (start === to) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { from.current = to; setShown(to); return; }
    setPop(true);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (to - start) * e;
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick); else { from.current = to; setPop(false); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const text = shown.toFixed(4).replace(/\.?0+$/, '') || '0';
  return <span className={`${className ?? ''} ${pop ? 'pop' : ''}`}>{text}</span>;
}
