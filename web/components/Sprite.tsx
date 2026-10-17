import { memo } from 'react';

export const COIN = ['..kkkk..', '.kyhhyk.', 'kyhyyyok', 'kyhyyyok', 'kyyyyyok', 'kyyyyook', '.kyoook.', '..kkkk..'];
export const COIN_GOLD = { k: '#9a4f00', y: '#ffcf3f', h: '#fff3a8', o: '#f08a00' };
export const COIN_CASH = { k: '#1d6a7a', y: '#7fe9ff', h: '#e6fbff', o: '#3aa8c4' };

export const AVATAR = [
  '..hhhhhh..', '.hhhhhhhh.', '.hssssssh.', '.hsessesh.', '.hssssssh.', '..ssmmss..',
  '..bbbbbb..', '.bbbbbbbb.', 'sbbbbbbbbs', 'sbbbbbbbbs', '.bb....bb.', '.kk....kk.',
];
export const AVATAR_PM = [
  '..hhhhhh..', '.hhhhhhhh.', '.hssssssh.', '.gegssegg.', '.hssssssh.', '..ssmmss..',
  '..bbwwbb..', '.bbbrrbbb.', 'sbbbrrbbbs', 'sbbbbbbbbs', '.bb....bb.', '.kk....kk.',
];
export const PAL_PM = { h: '#3a2d6b', s: '#ffd9b0', e: '#1a1230', g: '#9fe7ff', m: '#c0504d', b: '#4b4a8f', w: '#f4f0ff', r: '#ff4d5e', k: '#1a1230' };
export const PAL_D1 = { h: '#ff7a3d', s: '#ffd9b0', e: '#1a1230', m: '#c0504d', b: '#2fbf71', k: '#1a1230' };
export const PAL_D2 = { h: '#7a5cff', s: '#f2c294', e: '#1a1230', m: '#c0504d', b: '#ff5fa8', k: '#1a1230' };

type Props = { map: string[]; palette: Record<string, string>; cell: number; x?: number; y?: number };

/** 像素精灵：按行合并相邻同色格子 */
function SpriteRects({ map, palette, cell }: Omit<Props, 'x' | 'y'>) {
  const out: React.ReactElement[] = [];
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !palette[ch]) { x++; continue; }
      let e = x;
      while (e + 1 < row.length && row[e + 1] === ch) e++;
      out.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={(e - x + 1) * cell + 0.3} height={cell + 0.3} fill={palette[ch]} />);
      x = e + 1;
    }
  });
  return <>{out}</>;
}

export const SpriteG = memo(function SpriteG({ map, palette, cell, x = 0, y = 0 }: Props) {
  return (
    <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
      <SpriteRects map={map} palette={palette} cell={cell} />
    </g>
  );
});

export const Sprite = memo(function Sprite({ map, palette, cell }: Omit<Props, 'x' | 'y'>) {
  const w = map[0].length * cell;
  const h = map.length * cell;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      <SpriteRects map={map} palette={palette} cell={cell} />
    </svg>
  );
});
