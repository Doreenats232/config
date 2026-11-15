import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetworkCard from './components/NetworkCard';
import ResultCard from './components/ResultCard';
import Guide from './components/Guide';
import UseInternetModal from './components/UseInternetModal';
import { saveFile, deleteFile, deleteAllFiles } from './lib/fileStore';
import { isNative, shareFileNative } from './lib/native';
import { parseFile, parseText, type ParsedConfig } from './lib/parser';
import { getNetworkInfo, testConfig, type ConfigResult, type NetworkInfo } from './lib/tester';

type Tab = 'test' | 'results' | 'guide';
const STORE = 'cfgtester.results.v1';

function loadResults(): ConfigResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '[]');
  } catch {
    return [];
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('test');
  const [net, setNet] = useState<NetworkInfo | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [netError, setNetError] = useState(false);
  const [queue, setQueue] = useState<ParsedConfig[]>([]);
  const [results, setResults] = useState<ConfigResult[]>(loadResults);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [quick, setQuick] = useState('');
  const [dragging, setDragging] = useState(false);
  const [latest, setLatest] = useState<ConfigResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'working' | 'likely' | 'dead'>('all');
  const [country, setCountry] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [useTarget, setUseTarget] = useState<{ r: ConfigResult; extra: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshNet = useCallback(async () => {
    setNetLoading(true);
    setNetError(false);
    try {
      setNet(await getNetworkInfo());
    } catch {
      setNet(null);
      setNetError(true);
    } finally {
      setNetLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNet();
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    if ('serviceWorker' in navigator && !isNative()) navigator.serviceWorker.register('./sw.js').catch(() => {});
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, [refreshNet]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(results.slice(0, 150)));
    } catch {
      /* storage full */
    }
  }, [results]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const parsed: ParsedConfig[] = [];
    for (const f of list) {
      try {
        const p = await parseFile(f);
        await saveFile(p.id, f);
        parsed.push(p);
      } catch {
        /* skip unreadable */
      }
    }
    setQueue((q) => [...q, ...parsed]);
  };

  const addQuick = () => {
    if (!quick.trim()) return;
    setQueue((q) => [...q, parseText(quick.trim(), quick.trim().length < 40 ? quick.trim() : 'Pasted configs')]);
    setQuick('');
  };

  const runAll = async () => {
    if (running || !queue.length) return;
    const jobs = [...queue];
    const batch: ConfigResult[] = [];
    setRunning(true);
    setLatest([]);
    setProgress({ done: 0, total: jobs.length, current: jobs[0].name });
    for (let i = 0; i < jobs.length; i++) {
      const cfg = jobs[i];
      setProgress({ done: i, total: jobs.length, current: cfg.name });
      const res = await testConfig(cfg, net);
      batch.push(res);
      setResults((r) => [res, ...r]);
      setLatest((l) => [res, ...l]);
      setQueue((q) => q.filter((x) => x.id !== cfg.id));
    }
    setProgress((p) => ({ ...p, done: jobs.length, current: '' }));
    setRunning(false);

    // Offer to use the best working config
    const good = batch
      .filter((b) => b.verdict === 'working' || b.verdict === 'likely')
      .sort((a, b) => (a.verdict === b.verdict ? (a.best?.latency ?? 9e9) - (b.best?.latency ?? 9e9) : a.verdict === 'working' ? -1 : 1));
    if (good.length) setUseTarget({ r: good[0], extra: good.length - 1 });
  };

  const install = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    setInstallEvt(null);
  };

  const countries = useMemo(() => {
    const m = new Map<string, string>();
    results.forEach((r) => r.countryCode && r.country && m.set(r.countryCode, `${r.flag} ${r.country}`));
    return Array.from(m.entries());
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (filter === 'working' && r.verdict !== 'working') return false;
      if (filter === 'likely' && r.verdict !== 'likely') return false;
      if (filter === 'dead' && r.verdict !== 'dead' && r.verdict !== 'unreadable') return false;
      if (country !== 'all' && r.countryCode !== country) return false;
      if (mineOnly && net && r.isp !== net.isp) return false;
      if (search && !(r.name + r.format + r.isp + (r.country || '')).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [results, filter, country, mineOnly, net, search]);

  const stats = useMemo(
    () => ({
      working: results.filter((r) => r.verdict === 'working').length,
      likely: results.filter((r) => r.verdict === 'likely').length,
      dead: results.filter((r) => r.verdict === 'dead' || r.verdict === 'unreadable').length,
    }),
    [results],
  );

  const exportReport = () => {
    const good = results.filter((r) => r.verdict === 'working' || r.verdict === 'likely');
    const lines = [
      'FREE NET CONFIG TESTER – REPORT',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...good.map(
        (r) =>
          `[${r.verdict.toUpperCase()}] ${r.name} | ${r.format} | ${r.country || '?'} | ISP: ${r.isp}\n   ` +
          r.endpoints.filter((e) => e.status === 'working' || e.status === 'likely').map((e) => `${e.host}:${e.port}`).join(', '),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    if (isNative()) {
      shareFileNative(new File([blob], 'working-configs.txt', { type: 'text/plain' })).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'working-configs.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-xl shadow-lg shadow-emerald-500/20">📡</div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold leading-tight text-white">Config Tester</h1>
          <p className="truncate text-xs text-slate-400">Find free-internet configs that really work</p>
        </div>
        {installEvt && (
          <button onClick={install} className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-900 active:scale-95">
            Install
          </button>
        )}
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28 pt-4">
        {tab === 'test' && (
          <>
            <NetworkCard net={net} loading={netLoading} error={netError} onRefresh={refreshNet} />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-3xl border-2 border-dashed p-6 text-center transition active:scale-[0.99] ${
                dragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/15 bg-slate-900/60 hover:border-emerald-400/60'
              }`}
            >
              <div className="text-4xl">📂</div>
              <p className="mt-2 text-base font-bold text-white">Tap to add config files</p>
              <p className="mt-1 text-xs text-slate-400">.hat · .ehi · .nm · .npv4 · .ovpn · .json · .txt · and more</p>
              <p className="text-xs text-slate-500">Select many files at once</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <p className="text-sm font-bold text-white">⚡ Quick test</p>
              <p className="mb-2 text-xs text-slate-400">Paste a host, IP:port, SNI, vmess:// / vless:// link, or file contents.</p>
              <textarea
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                rows={3}
                placeholder={'e.g. free.example.com:443\nvless://…'}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-sm text-white placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none"
              />
              <button
                onClick={addQuick}
                disabled={!quick.trim()}
                className="mt-2 w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
              >
                + Add to test list
              </button>
            </div>

            {queue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-white">Ready to test ({queue.length})</p>
                  {!running && (
                    <button onClick={() => setQueue([])} className="text-xs text-slate-400 underline">
                      Clear
                    </button>
                  )}
                </div>
                {queue.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                        <p className="text-xs text-slate-400">
                          {c.format} · {c.endpoints.length} host{c.endpoints.length === 1 ? '' : 's'} found
                          {c.encrypted ? ' · 🔒 encrypted' : ''}
                        </p>
                      </div>
                      {!running && (
                        <button onClick={() => setQueue((q) => q.filter((x) => x.id !== c.id))} className="px-2 text-slate-500">
                          ✕
                        </button>
                      )}
                    </div>
                    {c.endpoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.endpoints.slice(0, 5).map((e) => (
                          <span key={e.host} className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                            {e.host}
                          </span>
                        ))}
                        {c.endpoints.length > 5 && <span className="text-[11px] text-slate-500">+{c.endpoints.length - 5}</span>}
                      </div>
                    )}
                    {c.notes.map((n, i) => (
                      <p key={i} className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200/90">
                        {n}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {running && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-emerald-200">Testing {progress.done + 1 > progress.total ? progress.total : progress.done + 1}/{progress.total}</span>
                  <span className="text-emerald-300">{pct}%</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">{progress.current}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
                </div>
              </div>
            )}

            {latest.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-white">Latest results</p>
                {latest.map((r) => (
                  <ResultCard key={r.id + r.testedAt} r={r} onUse={() => setUseTarget({ r, extra: 0 })} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'results' && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat n={stats.working} label="Working" color="text-emerald-300" />
              <Stat n={stats.likely} label="Likely" color="text-amber-300" />
              <Stat n={stats.dead} label="Dead" color="text-rose-300" />
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, country, provider…"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none"
            />

            <div className="flex gap-2 overflow-x-auto pb-1">
              {(['all', 'working', 'likely', 'dead'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${
                    filter === f ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="all">🌍 All countries</option>
                {countries.map(([cc, label]) => (
                  <option key={cc} value={cc}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setMineOnly(!mineOnly)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${mineOnly ? 'bg-cyan-400 text-slate-900' : 'bg-white/10 text-slate-300'}`}
              >
                {mineOnly ? '✓ ' : ''}My provider
              </button>
            </div>

            {results.length > 0 && (
              <div className="flex gap-2">
                <button onClick={exportReport} className="flex-1 rounded-xl bg-emerald-500/20 py-2.5 text-sm font-semibold text-emerald-200 active:scale-95">
                  ⬇ Export working list
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete all saved results?')) {
                      deleteAllFiles();
                      setResults([]);
                    }
                  }}
                  className="rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-300 active:scale-95"
                >
                  Clear
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-5xl">🔎</div>
                <p className="mt-3 font-semibold text-white">{results.length ? 'Nothing matches your filters' : 'No results yet'}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {results.length ? 'Try changing the filters.' : 'Add some config files on the Test tab and run a test.'}
                </p>
                {!results.length && (
                  <button onClick={() => setTab('test')} className="mt-4 rounded-full bg-emerald-400 px-5 py-2 text-sm font-bold text-slate-900">
                    Go to Test
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => (
                  <ResultCard
                    key={r.id + r.testedAt}
                    r={r}
                    onUse={() => setUseTarget({ r, extra: 0 })}
                    onDelete={() => {
                      deleteFile(r.id);
                      setResults((all) => all.filter((x) => x !== r));
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'guide' && <Guide canInstall={!!installEvt} onInstall={install} />}
      </main>

      {tab === 'test' && queue.length > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto max-w-xl px-4">
          <button
            onClick={runAll}
            disabled={running}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-4 text-base font-extrabold text-slate-900 shadow-xl shadow-emerald-500/30 active:scale-[0.98] disabled:opacity-60"
          >
            {running ? 'Testing…' : `▶ Test ${queue.length} config${queue.length === 1 ? '' : 's'} now`}
          </button>
        </div>
      )}

      {useTarget && <UseInternetModal r={useTarget.r} extra={useTarget.extra} onClose={() => setUseTarget(null)} />}

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-xl grid-cols-3 border-t border-white/10 bg-slate-950/95 backdrop-blur">
        {(
          [
            ['test', '🧪', 'Test'],
            ['results', '📋', `Results${results.length ? ` (${results.length})` : ''}`],
            ['guide', '📖', 'Guide'],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tab === id ? 'text-emerald-300' : 'text-slate-500'}`}
          >
            <span className="text-xl">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 py-3">
      <p className={`text-2xl font-extrabold ${color}`}>{n}</p>
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}
