import type { NetworkInfo } from '../lib/tester';

export default function NetworkCard({
  net,
  loading,
  error,
  onRefresh,
}: {
  net: NetworkInfo | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-cyan-500/10 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300/80">Your network right now</p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Checking…' : '↻ Refresh'}
        </button>
      </div>
      {loading && !net ? (
        <div className="mt-3 space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
      ) : net ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="text-4xl">{net.flag}</div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-white">{net.isp}</p>
            <p className="truncate text-sm text-slate-400">
              {net.city ? `${net.city}, ` : ''}
              {net.country} · {net.ip}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-amber-300">
          {error ? 'Could not detect your provider. You appear to be offline or the lookup is blocked – tests will still run.' : '—'}
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Tests run from <b className="text-slate-200">this phone on this connection</b>, so results are for the provider shown above.
        Switch SIM or Wi-Fi and test again to compare.
      </p>
    </div>
  );
}
