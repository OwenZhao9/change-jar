'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEther, type Address } from 'viem';
import { createBackend } from '@/lib/backend';
import { CONTRACT_ADDRESS, EXPLORER_URL, FAUCET_PAGE } from '@/lib/config';
import { NOTES, specHashFor, specHashV0 } from '@/lib/presets';
import { isMuted, setMuted, sfx } from '@/lib/audio';
import { loadWallets, ROLE_LABEL, ROLES, type Role, type Wallet } from '@/lib/wallets';
import type { Backend, Call, Change, Project, TxResult, TxStage } from '@/lib/types';
import { Jar } from './Jar';
import { Timeline } from './Timeline';
import { Devs, PmCard } from './Devs';
import { fmt } from './Mon';
import { AVATAR, AVATAR_PM, PAL_D1, PAL_D2, PAL_PM, Sprite, COIN, COIN_GOLD } from './Sprite';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const MIN_BAL: Record<Role, bigint> = { pm: parseEther('1'), dev1: parseEther('0.02'), dev2: parseEther('0.02') };
const PID_KEY = `cj.pid.${CONTRACT_ADDRESS ?? 'local'}`;
const LABEL: Record<Call['fn'], string> = {
  createProject: '创建项目', acknowledge: '已收到', submitChange: '提交变更', launch: '上线', withdraw: '领取',
};

type Snap = {
  project: Project | null;
  changes: Change[];
  acks: Record<string, boolean>;
  claimable: Record<Role, bigint>;
  balance: Record<Role, bigint>;
};
const EMPTY: Snap = {
  project: null, changes: [], acks: {},
  claimable: { pm: 0n, dev1: 0n, dev2: 0n }, balance: { pm: 0n, dev1: 0n, dev2: 0n },
};
type LastTx = { label: string; r: TxResult } | null;
type TxView = { id: number; label: string; who: string; stage: TxStage | 'done' | 'error'; r?: TxResult; msg?: string };

/** 把节点报错翻译成一句人话 */
function friendly(m: string, who: string): string {
  if (/insufficient funds|exceeds the balance/i.test(m)) return `${who} 钱包余额不足`;
  if (/nonce/i.test(m)) return '交易顺序冲突，请稍后重试';
  if (/timeout|timed out/i.test(m)) return '网络超时，请重试';
  if (/fetch|network|HTTP request failed/i.test(m)) return '连不上 Monad 测试网节点，请重试';
  if (/reverted|合约拒绝/i.test(m)) return '合约拒绝了这笔交易';
  return m.split('\n')[0].slice(0, 100);
}

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [wallets, setWallets] = useState<Record<Role, Wallet> | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>('pm');
  const [pid, setPid] = useState<bigint | null>(null);
  const [snap, setSnap] = useState<Snap>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<LastTx>(null);
  const [block, setBlock] = useState<bigint | null>(null);
  const [muted, setMute] = useState(false);
  const [noteIdx, setNoteIdx] = useState(0);
  const [fee, setFee] = useState('0.1');
  const [deposit, setDeposit] = useState('0.8');
  const [funding, setFunding] = useState<string | null>(null);
  const [flown, setFlown] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tx, setTx] = useState<TxView | null>(null);
  const [pending, setPending] = useState<{ version: number; note: string } | null>(null);
  const [robotStep, setRobotStep] = useState(0);
  const robotHide = useRef<number | undefined>(undefined);
  const txSeq = useRef(0);
  const txHide = useRef<number | undefined>(undefined);

  const jarRef = useRef<HTMLDivElement>(null);
  const avatarRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const pidRef = useRef<bigint | null>(null);
  const prevStatus = useRef<number | null>(null);

  // 初始化：钱包、后端、项目编号
  useEffect(() => {
    const w = loadWallets();
    setWallets(w);
    const b = createBackend();
    setBackend(b);
    try { const m = localStorage.getItem('cj.muted') === '1'; setMute(m); setMuted(m); } catch {}
    (async () => {
      if (!b) { setReady(true); return; }
      let id: bigint | null = null;
      if (b.kind === 'chain') {
        try {
          const s = localStorage.getItem(PID_KEY);
          if (s && /^\d+$/.test(s)) {
            const p = await b.project(BigInt(s));
            if (p.pm.toLowerCase() === w.pm.address.toLowerCase()) id = BigInt(s);
          }
          if (id === null) {
            const n = await b.projectCount();
            const ids: bigint[] = [];
            for (let k = n - 1n; k >= 0n && k >= n - 20n; k--) ids.push(k);
            const ps = await Promise.all(ids.map((k) => b.project(k).catch(() => null)));
            const hit = ps.findIndex((p) => p && p.pm.toLowerCase() === w.pm.address.toLowerCase());
            if (hit >= 0) id = ids[hit];
          }
        } catch {}
      }
      pidRef.current = id;
      setPid(id);
      setReady(true);
    })();
  }, []);

  const optimistic = useRef<{ pid: bigint; version: number; until: number } | null>(null);
  const load = useCallback(async (): Promise<Snap | null> => {
    if (!backend || !wallets) return null;
    try {
      const id = pidRef.current;
      const [cp, cd1, cd2, bp, bd1, bd2] = await Promise.all([
        backend.claimable(wallets.pm.address), backend.claimable(wallets.dev1.address), backend.claimable(wallets.dev2.address),
        backend.balance(wallets.pm.address), backend.balance(wallets.dev1.address), backend.balance(wallets.dev2.address),
      ]);
      let project: Project | null = null;
      let changes: Change[] = [];
      let acks: Record<string, boolean> = {};
      if (id !== null) {
        [project, changes] = await Promise.all([backend.project(id), backend.changes(id)]);
        acks = await backend.acks(id, project.devs, project.version);
      }
      if (id !== pidRef.current) return null;
      const opt = optimistic.current;
      if (project && opt && opt.pid === id && Date.now() < opt.until && project.status === 0 && project.version < opt.version) {
        // 节点还没追上刚确认的交易，先保留回执带来的状态
        return null;
      }
      const next: Snap = {
        project, changes, acks,
        claimable: { pm: cp, dev1: cd1, dev2: cd2 },
        balance: { pm: bp, dev1: bd1, dev2: bd2 },
      };
      setSnap(next);
      return next;
    } catch {
      // 读取失败时保留上一次状态
      return null;
    }
  }, [backend, wallets]);

  // 同一时间只有一个读取；交易后的读取排在当前读取之后
  const inflightP = useRef<Promise<Snap | null> | null>(null);
  const refresh = useCallback(async (): Promise<Snap | null> => {
    while (inflightP.current) await inflightP.current;
    const p = load();
    inflightP.current = p;
    try { return await p; } finally { if (inflightP.current === p) inflightP.current = null; }
  }, [load]);
  const poll = useCallback(() => { if (!inflightP.current) void refresh(); }, [refresh]);

  /** 交易确认后读到链上新状态为止 */
  const refreshUntil = useCallback(async (ok: (s: Snap) => boolean) => {
    for (let k = 0; k < 12; k++) {
      const s = await refresh();
      if (s && ok(s)) return s;
      await sleep(250);
    }
    return null;
  }, [refresh]);

  // 轮询
  useEffect(() => {
    if (!ready) return;
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [ready, pid, poll]);

  useEffect(() => {
    if (!backend) return;
    let on = true;
    const tick = async () => { try { const n = await backend.blockNumber(); if (on) setBlock(n); } catch {} };
    void tick();
    const t = setInterval(tick, 1500);
    return () => { on = false; clearInterval(t); };
  }, [backend]);

  // 自动领测试币
  useEffect(() => {
    if (!ready || !backend || !wallets) return;
    let on = true;
    (async () => {
      const need: [Role, bigint][] = [['pm', parseEther('1.5')], ['dev1', parseEther('0.2')], ['dev2', parseEther('0.2')]];
      for (const [r, min] of need) {
        for (let attempt = 0; attempt < 2 && on; attempt++) {
          let bal = 0n;
          try { bal = await backend.balance(wallets[r].address); } catch { break; }
          if (bal >= min) break;
          setFunding(`${ROLE_LABEL[r]} 领取测试币…`);
          try { await backend.fund(wallets[r].address); await sleep(backend.kind === 'chain' ? 2500 : 100); } catch { break; }
        }
      }
      if (on) setFunding(null);
      void refresh();
    })();
    return () => { on = false; };
  }, [ready, backend, wallets, refresh]);

  // 上线：罐里的钱分两股飞向开发头像
  useEffect(() => {
    const st = snap.project?.status ?? null;
    const prev = prevStatus.current;
    prevStatus.current = st;
    if (st === 1 && prev === 0) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { setFlown(true); sfx.payout(); return; }
      setFlown(false);
      fly(jarRef.current, avatarRefs.current, Math.max(6, Math.min(24, snap.changes.length * 2)));
      sfx.whoosh();
      setTimeout(() => { setFlown(true); sfx.payout(); }, 1500);
    } else if (st !== 1) {
      setFlown(true);
    }
  }, [snap.project?.status, snap.changes.length]);

  const send = useCallback(async (r: Role, call: Call): Promise<TxResult | null> => {
    if (!backend || !wallets) return null;
    sfx.unlock();
    setErr(null);
    const id = ++txSeq.current;
    const label = LABEL[call.fn];
    const who = ROLE_LABEL[r];
    window.clearTimeout(txHide.current);
    setTx({ id, label, who, stage: 'signing' });
    const upd = (v: Partial<TxView>) => setTx((t) => (t && t.id === id ? { ...t, ...v } : t));
    try {
      const res = await backend.send(wallets[r].pk, call, (stage) => upd({ stage }));
      setLast({ label, r: res });
      upd({ stage: 'done', r: res });
      txHide.current = window.setTimeout(() => setTx((t) => (t && t.id === id ? null : t)), 4500);
      return res;
    } catch (e) {
      sfx.error();
      const m = String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e);
      const msg = friendly(m, who);
      setErr(msg);
      upd({ stage: 'error', msg });
      txHide.current = window.setTimeout(() => setTx((t) => (t && t.id === id ? null : t)), 8000);
      return null;
    }
  }, [backend, wallets]);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  };

  const createProject = () => run('创建项目', async () => {
    if (!wallets) return;
    setRole('pm');
    let f: bigint, d: bigint;
    try { f = parseEther(fee); d = parseEther(deposit); } catch { setErr('金额格式不正确'); return; }
    if (f <= 0n || d < f) { setErr('保证金不能少于每张变更单费用'); return; }
    const res = await send('pm', { fn: 'createProject', devs: [wallets.dev1.address, wallets.dev2.address], fee: f, specHash: specHashV0(), value: d });
    if (res?.createdId !== undefined) {
      pidRef.current = res.createdId;
      prevStatus.current = null;
      setSnap((s) => ({ ...s, project: null, changes: [], acks: {} }));
      setPid(res.createdId);
      try { localStorage.setItem(PID_KEY, res.createdId.toString()); } catch {}
      await refreshUntil((x) => !!x.project);
    }
  });

  const submitOne = async (note: string) => {
    if (!backend || pidRef.current === null) return false;
    const p = await backend.project(pidRef.current);
    const value = p.deposit >= p.fee ? 0n : p.fee;
    setPending({ version: p.version + 1, note });
    const res = await send('pm', { fn: 'submitChange', id: pidRef.current, specHash: specHashFor(p.version + 1, note), note, value });
    setPending(null);
    if (!res) return false;
    // 回执到手即落币
    const fromDeposit = value === 0n;
    optimistic.current = { pid: pidRef.current, version: p.version + 1, until: Date.now() + 15000 };
    setSnap((x) => x.project ? {
      ...x,
      project: { ...x.project, version: p.version + 1, jar: p.jar + p.fee, deposit: fromDeposit ? p.deposit - p.fee : p.deposit },
      changes: [...x.changes.slice(0, p.version + 1), { specHash: specHashFor(p.version + 1, note), note, fee: p.fee, timestamp: Math.floor(Date.now() / 1000), paidFromDeposit: fromDeposit }],
    } : x);
    await refreshUntil((x) => (x.project?.version ?? 0) > p.version);
    return true;
  };

  const submit = () => run('提交变更', async () => {
    const note = NOTES[noteIdx % NOTES.length];
    if (await submitOne(note)) setNoteIdx((i) => (i + 1) % NOTES.length);
  });

  const robot = () => run('机器人连改', async () => {
    let idx = noteIdx;
    window.clearTimeout(robotHide.current);
    setRobotStep(0);
    for (let k = 0; k < 6; k++) {
      setBusy(`机器人连改 ${k + 1}/6`);
      const t0 = performance.now();
      const ok = await submitOne(NOTES[idx % NOTES.length]);
      if (!ok) break;
      setRobotStep(k + 1);
      idx++;
      setNoteIdx(idx % NOTES.length);
      const gap = 1100 - (performance.now() - t0);
      if (gap > 0 && k < 5) await sleep(gap);
    }
    robotHide.current = window.setTimeout(() => setRobotStep(0), 1500);
  });

  const launch = () => run('上线', async () => {
    if (pidRef.current === null) return;
    const r: Role = role;
    if (await send(r, { fn: 'launch', id: pidRef.current })) await refreshUntil((x) => x.project?.status === 1);
  });

  const ack = (v: number) => run('已收到', async () => {
    if (pidRef.current === null || role === 'pm') return;
    const who = wallets?.[role].address;
    if (await send(role, { fn: 'acknowledge', id: pidRef.current, version: v })) { sfx.click(); await refreshUntil((x) => !!x.acks[`${who}:${v}`]); }
  });

  const claim = (r: Role) => run('领取', async () => {
    if (await send(r, { fn: 'withdraw' })) { sfx.payout(); await refreshUntil((x) => x.claimable[r] === 0n); }
  });

  const newProject = () => {
    pidRef.current = null;
    prevStatus.current = null;
    setPid(null);
    setSnap((s) => ({ ...s, project: null, changes: [], acks: {} }));
    try { localStorage.removeItem(PID_KEY); } catch {}
  };

  const fundMe = () => run('领取测试币', async () => {
    if (!backend || !wallets) return;
    let failed = false;
    for (const r of ROLES) {
      if (snap.balance[r] >= MIN_BAL[r]) continue;
      try { await backend.fund(wallets[r].address); } catch { failed = true; }
    }
    await sleep(2000); await refresh();
    if (failed) setErr('自动领取未成功，请复制地址到 faucet.monad.xyz 领取');
  });

  const toggleMute = () => {
    const m = !muted; setMute(m); setMuted(m);
    try { localStorage.setItem('cj.muted', m ? '1' : '0'); } catch {}
    if (!m) sfx.coin();
  };

  const copy = async (a: string) => {
    try { await navigator.clipboard.writeText(a); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };

  const { project, changes } = snap;
  const status = project?.status ?? -1;
  const jarShown = project ? project.jar : 0n;
  const anyLow = !!wallets && !funding && ROLES.some((r) => snap.balance[r] < MIN_BAL[r]);
  const nextNeedsCash = !!project && project.status === 0 && project.deposit < project.fee;
  const devIdx = role === 'dev1' ? 0 : role === 'dev2' ? 1 : -1;
  const pal = useMemo(() => ({ pm: PAL_PM, dev1: PAL_D1, dev2: PAL_D2 }), []);

  if (!ready) {
    return (
      <main className="boot">
        <div className="boot-coin"><Sprite map={COIN} palette={COIN_GOLD} cell={4} /></div>
        <h1 className="px title">需求变更罐</h1>
        <p className="boot-msg">正在连接 Monad 测试网<span className="confirming" /></p>
      </main>
    );
  }
  if (!backend) {
    return (
      <main className="boot">
        <h1 className="px title">需求变更罐</h1>
        <p>未配置合约地址：请设置 <code>NEXT_PUBLIC_CHANGE_JAR_ADDRESS</code></p>
      </main>
    );
  }

  return (
    <div className="app">
      <div className="crt" aria-hidden />
      <div className="coin-template" hidden><Sprite map={COIN} palette={COIN_GOLD} cell={3} /></div>
      <header className="top">
        <div className="brand">
          <Sprite map={COIN} palette={COIN_GOLD} cell={2} />
          <h1 className="px title">需求变更罐</h1>
        </div>
        <nav className="roles" aria-label="角色切换">
          {ROLES.map((r) => (
            <button key={r} className={`role ${role === r ? 'on' : ''}`} onClick={() => { sfx.unlock(); sfx.click(); setRole(r); }} aria-pressed={role === r}>
              <Sprite map={r === 'pm' ? AVATAR_PM : AVATAR} palette={pal[r]} cell={2} />
              <span>{ROLE_LABEL[r]}</span>
            </button>
          ))}
        </nav>
        <div className="wallet">
          <button className="icon" onClick={toggleMute} aria-label={muted ? '打开声音' : '静音'} title={muted ? '打开声音' : '静音'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {wallets && (
        <div className="wallets" aria-label="钱包">
          {ROLES.map((r) => {
            const low = snap.balance[r] < MIN_BAL[r];
            return (
              <div key={r} className={`wcell ${role === r ? 'on' : ''} ${low && !funding ? 'low' : ''}`}>
                <span className="wname">{ROLE_LABEL[r]}</span>
                <button className="waddr" onClick={() => copy(wallets[r].address)} title={`${wallets[r].address}（点击复制）`}>
                  <span className="short">{short(wallets[r].address)}</span>
                </button>
                <b className="wbal px">{fmt(snap.balance[r], 3)}</b><span className="dim">MON</span>
              </div>
            );
          })}
          <span className="wtip">{copied ? '地址已复制' : funding ?? (anyLow ? <>余额不足：复制地址后到 <a href={FAUCET_PAGE} target="_blank" rel="noreferrer">faucet.monad.xyz</a> 领取 <button className="btn mini" disabled={!!busy} onClick={fundMe}>自动领取</button></> : '')}</span>
        </div>
      )}

      <main className="grid">
        <div className="col-timeline">
          <Timeline
            project={project} changes={changes} acks={snap.acks}
            canAck={role !== 'pm' && wallets ? (wallets[role].address as Address) : null}
            busy={!!busy} onAck={ack} pending={pending}
          />
        </div>

        <section className="panel center" aria-label="变更罐">
          <Jar ref={jarRef} key={pid?.toString() ?? 'none'} project={project} changes={changes} />
          {!project && (
            <div className="create">
              <h2 className="px">新项目</h2>
              <div className="fields">
                <label><span>开发</span><b>2 人</b></label>
                <label><span>每张变更单</span><input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" /> MON</label>
                <label><span>保证金</span><input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" /> MON</label>
              </div>
              <button className="btn big-btn" disabled={!!busy} onClick={createProject}>{busy === '创建项目' ? '创建中…' : '创建项目'}</button>
            </div>
          )}
          {wallets && (
            <PmCard
              claimable={snap.claimable.pm} balance={snap.balance.pm} launched={status === 1}
              busy={!!busy} onClaim={() => claim('pm')} active={role === 'pm'}
            />
          )}
        </section>

        <div className="col-devs">
          <Devs
            project={project} jarShown={jarShown}
            claimable={[snap.claimable.dev1, snap.claimable.dev2]}
            balances={[snap.balance.dev1, snap.balance.dev2]}
            active={devIdx} busy={!!busy} onClaim={(i) => claim(i === 0 ? 'dev1' : 'dev2')}
            refs={avatarRefs} flown={flown}
          />
        </div>
      </main>

      <footer className="bottom">
        <div className="actions">
          {status === 0 && role === 'pm' && (
            <>
              <select className="note-pick" value={noteIdx} onChange={(e) => setNoteIdx(Number(e.target.value))} aria-label="变更说明" disabled={!!busy}>
                {NOTES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
              <button className={`btn submit ${busy === '提交变更' ? 'working' : ''}`} disabled={!!busy} onClick={submit}>
                {busy === '提交变更' ? '提交中…' : <>提交变更{nextNeedsCash && project ? <small> · 现付 {fmt(project.fee)}</small> : ''}</>}
              </button>
              <button className={`btn hot ${busy?.startsWith('机器人') ? 'working' : ''}`} disabled={!!busy} onClick={robot}>
                {busy?.startsWith('机器人') ? `连改中 ${Math.min(robotStep + 1, 6)}/6` : '机器人连改 6 次'}
              </button>
            </>
          )}
          {status === 0 && (
            <button className={`btn launch ${busy === '上线' ? 'working' : ''}`} disabled={!!busy} onClick={launch}>{busy === '上线' ? '上线中…' : '上线'}</button>
          )}
          {status === 1 && role === 'pm' && (
            <button className="btn" disabled={!!busy} onClick={newProject}>新项目</button>
          )}
          {status === -1 && <span className="dim launched-hint">{role === 'pm' ? '填好参数后点「创建项目」开始' : '切换到「产品经理」创建项目'}</span>}
          {status === 1 && <span className="dim launched-hint">项目已上线，各自领取分成</span>}
          {(busy?.startsWith('机器人') || robotStep > 0) && (
            <div className="robot-progress" aria-label={`机器人进度 ${robotStep}/6`}>
              {Array.from({ length: 6 }, (_, k) => <i key={k} className={k < robotStep ? 'on' : k === robotStep && busy ? 'now' : ''} />)}
            </div>
          )}
        </div>
        {tx && <TxToast tx={tx} explorer={backend.kind === 'chain' ? EXPLORER_URL : null} onClose={() => setTx(null)} />}
        <div className="statusbar" role="status">
          <span className="live"><i className="dot" /> Monad 测试网 · 区块 <b className="px">{block?.toString() ?? '—'}</b></span>
          {last && (
            <span>
              {last.label} · 确认 <b className="px gold">{last.r.ms}ms</b> · {last.r.mode === 'sync' ? '同步回执' : '发送后等待回执'}
              {backend.kind === 'chain' && (
                <> · <a href={`${EXPLORER_URL}/tx/${last.r.hash}`} target="_blank" rel="noreferrer">{short(last.r.hash)}</a></>
              )}
            </span>
          )}
          {CONTRACT_ADDRESS && pid !== null && (
            <a href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">项目 #{pid.toString()}</a>
          )}
          {err && !tx && <span className="red">{err}</span>}
        </div>
      </footer>
    </div>
  );
}

const STEPS: { key: TxStage | 'done'; label: string }[] = [
  { key: 'signing', label: '签名' },
  { key: 'sent', label: '上链' },
  { key: 'done', label: '确认' },
];

/** 交易进度：签名 → 上链 → 确认 */
function TxToast({ tx, explorer, onClose }: { tx: TxView; explorer: string | null; onClose: () => void }) {
  const at = tx.stage === 'error' ? -1 : STEPS.findIndex((s) => s.key === tx.stage);
  return (
    <div className={`toast toast-${tx.stage}`} role="status" aria-live="polite">
      <div className="toast-head">
        <b>{tx.label}</b>
        <span className="dim">{tx.who}</span>
        <button className="toast-x" onClick={onClose} aria-label="关闭">×</button>
      </div>
      {tx.stage === 'error' ? (
        <div className="toast-msg red">{tx.msg}</div>
      ) : (
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < at || tx.stage === 'done' ? 'done' : i === at ? 'now' : ''}>
              <i />{s.label}
            </li>
          ))}
        </ol>
      )}
      {tx.stage === 'done' && tx.r && (
        <div className="toast-msg">
          <b className="px gold">{tx.r.ms}ms</b> · {tx.r.mode === 'sync' ? '同步回执' : '发送后等待回执'}
          {explorer && <> · <a href={`${explorer}/tx/${tx.r.hash}`} target="_blank" rel="noreferrer">{short(tx.r.hash)}</a></>}
        </div>
      )}
    </div>
  );
}

/** 金币从罐口飞向两个头像 */
function fly(from: HTMLElement | null, to: (HTMLElement | null)[], count: number) {
  if (!from) return;
  const targets = to.filter(Boolean) as HTMLElement[];
  if (targets.length === 0) return;
  const svg = from.querySelector('.jar-svg') ?? from;
  const a = svg.getBoundingClientRect();
  const sx = a.left + a.width / 2;
  const sy = a.top + a.height * 0.62;
  const layer = document.createElement('div');
  layer.className = 'fly-layer';
  document.body.appendChild(layer);
  const coinSvg = (document.querySelector('.coin-template') as HTMLElement | null)?.innerHTML ?? '';
  for (let k = 0; k < count; k++) {
    const t = targets[k % targets.length].getBoundingClientRect();
    const tx = t.left + t.width / 2;
    const ty = t.top + t.height / 2;
    const el = document.createElement('div');
    el.className = 'fly-coin';
    el.innerHTML = coinSvg;
    layer.appendChild(el);
    const jx = (Math.random() - 0.5) * 50;
    const jy = (Math.random() - 0.5) * 30;
    const mx = (sx + tx) / 2 + jx;
    const my = Math.min(sy, ty) - 120 - Math.random() * 60;
    el.animate(
      [
        { transform: `translate(${sx + jx * 0.4}px, ${sy + jy}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${sx + jx * 0.6}px, ${sy - 40}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${mx}px, ${my}px) scale(1.25)`, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 1, offset: 0.95 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 1000, delay: k * 45, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' },
    );
  }
  targets.forEach((t, i) => setTimeout(() => {
    t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit');
  }, 950 + i * 45));
  setTimeout(() => layer.remove(), 1000 + count * 45 + 300);
}
