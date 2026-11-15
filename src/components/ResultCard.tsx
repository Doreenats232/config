import { useState } from 'react';
import type { ConfigResult, EndpointStatus, Verdict } from '../lib/tester';

export const verdictStyle: Record<Verdict, { label: string; chip: string; dot: string; emoji: string }> = {
  working: { label: 'WORKING', chip: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40', dot: 'bg-emerald-400', emoji: '✅' },
  likely: { label: 'LIKELY WORKS', chip: 'bg-amber-500/20 text-amber-300 ring-amber-400/40', dot: 'bg-amber-400', emoji: '🟡' },
  dead: { label: 'NOT WORKING', chip: 'bg-rose-500/20 text-rose-300 ring-rose-400/40', dot: 'bg-rose-400', emoji: '❌' },
  unreadable: { label: 'LOCKED FILE', chip: 'bg-slate-500/20 text-slate-300 ring-slate-400/40', dot: 'bg-slate-400', emoji: '🔒' },
};

const epDot: Record<EndpointStatus, string> = {
  working: 'bg-emerald-400',
  likely: 'bg-amber-400',
  blocked: 'bg-rose-400',
  dead: 'bg-rose-500',
};

const kindLabel = {
  server: 'Server',
  proxy: 'Proxy',
  sni: 'SNI',
  'host-header': 'Bug host',
  found: 'Host',
} as const;

export default function ResultCard({ r, onDelete, onUse }: { r: ConfigResult; onDelete?: () => void; onUse?: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const v = verdictStyle[r.verdict];

  const copy = async () => {
    const txt = r.endpoints
      .filter((e) => e.status === 'working' || e.status === 'likely')
      .map((e) => `${e.host}:${e.port}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(txt || r.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="text-3xl leading-none">{r.flag || v.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1 ${v.chip}`}>{v.label}</span>
            {r.best?.latency != null && <span className="text-[11px] text-slate-400">{r.best.latency} ms</span>}
          </div>
          <p className="mt-1 truncate font-semibold text-white">{r.name}</p>
          <p className="truncate text-xs text-slate-400">
            {r.format} · {r.country || 'Location unknown'}
          </p>
          <p className="truncate text-xs text-slate-500">
            Tested on <span className="text-slate-300">{r.isp}</span> · {new Date(r.testedAt).toLocaleString()}
          </p>
        </div>
        <span className={`mt-1 text-slate-500 transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/5 bg-black/20 p-4">
          {r.endpoints.length === 0 && (
            <p className="text-sm text-slate-400">No readable servers in this file. Try “Quick test” with the host name.</p>
          )}
          {r.endpoints.map((e, i) => (
            <div key={i} className="rounded-xl bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${epDot[e.status]}`} />
                <span className="truncate font-mono text-sm text-white">
                  {e.host}:{e.port}
                </span>
                <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                  {kindLabel[e.kind]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{e.detail}</p>
              {e.ip && (
                <p className="mt-1 text-xs text-slate-500">
                  {e.ip}
                  {e.geo ? ` · ${e.geo.flag} ${e.geo.city ? e.geo.city + ', ' : ''}${e.geo.country}` : ''}
                  {e.geo?.org ? ` · ${e.geo.org}` : ''}
                </p>
              )}
            </div>
          ))}
          {onUse && (r.verdict === 'working' || r.verdict === 'likely') && (
            <button onClick={onUse} className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3 text-sm font-extrabold text-slate-900 active:scale-95">
              🚀 Use this internet
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={copy} className="flex-1 rounded-xl bg-emerald-500/20 py-2 text-sm font-semibold text-emerald-200 active:scale-95">
              {copied ? 'Copied ✓' : 'Copy working hosts'}
            </button>
            {onDelete && (
              <button onClick={onDelete} className="rounded-xl bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-300 active:scale-95">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
