// 金币：形状取自 Monad logo 的轮廓（四边外鼓的圆角菱形，中间斜转的圆角方孔），矢量绘制，配色沿用本项目的金色和现付蓝
export const MONAD_PATH =
  'M11.782 0C8.37963 0 0 8.53443 0 11.9999C0 15.4654 8.37963 24 11.782 24C15.1844 24 23.5642 15.4653 23.5642 11.9999C23.5642 8.53458 15.1845 0 11.782 0ZM9.94598 18.8619C8.51124 18.4637 4.65378 11.5912 5.04481 10.1299C5.43584 8.66856 12.1834 4.73984 13.6181 5.1381C15.0529 5.5363 18.9104 12.4087 18.5194 13.87C18.1283 15.3314 11.3807 19.2602 9.94598 18.8619Z';

export type CoinKind = 'gold' | 'cash';

const PAL: Record<CoinKind, { hi: string; mid: string; lo: string; edge: string; rim: string }> = {
  gold: { hi: '#fff6c4', mid: '#ffcc3d', lo: '#ef8f12', edge: '#c06a00', rim: '#fff0b0' },
  cash: { hi: '#f0fdff', mid: '#8eecff', lo: '#3aa8c4', edge: '#2a8fae', rim: '#e2fbff' },
};

/** 渐变定义，整页放一份 */
export function CoinDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {(Object.keys(PAL) as CoinKind[]).map((k) => (
          <linearGradient key={k} id={`cj-coin-${k}`} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
            <stop offset="0" stopColor={PAL[k].hi} />
            <stop offset="0.45" stopColor={PAL[k].mid} />
            <stop offset="1" stopColor={PAL[k].lo} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

/** 在 24×24 的坐标里画一枚金币（含描边，约占 -0.6 到 24.6） */
export function CoinShape({ kind = 'gold' }: { kind?: CoinKind }) {
  const p = PAL[kind];
  return (
    <g shapeRendering="geometricPrecision">
      <path d={MONAD_PATH} transform="translate(0.6 1)" fill="#000" fillRule="evenodd" opacity="0.35" />
      <path d={MONAD_PATH} fill={`url(#cj-coin-${kind})`} fillRule="evenodd" stroke={p.edge} strokeWidth="0.8" strokeLinejoin="round" />
      <path d={MONAD_PATH} fill="none" stroke={p.rim} strokeWidth="0.7" strokeDasharray="9 60" strokeDashoffset="-2" strokeLinecap="round" opacity="0.9" transform="translate(0.9 0.9) scale(0.925)" />
      <ellipse cx="7.2" cy="8.4" rx="1.5" ry="0.9" transform="rotate(-45 7.2 8.4)" fill="#ffffff" opacity="0.85" />
    </g>
  );
}

/** 独立使用的金币图标 */
export function Coin({ size, kind = 'gold' }: { size: number; kind?: CoinKind }) {
  return (
    <svg width={size} height={size} viewBox="-1 -1 26 26" aria-hidden>
      <CoinShape kind={kind} />
    </svg>
  );
}
