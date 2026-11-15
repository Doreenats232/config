import { useEffect, useState } from 'react';
import type { ConfigResult } from '../lib/tester';
import { appFor } from '../lib/apps';
import { getFile } from '../lib/fileStore';
import { isNative, openExternal, shareFileNative } from '../lib/native';

export default function UseInternetModal({ r, extra, onClose }: { r: ConfigResult; extra: number; onClose: () => void }) {
  const ext = (r.name.split('.').pop() || '').toLowerCase();
  const app = appFor(ext, r.format);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [step, setStep] = useState<'ask' | 'manual'>('ask');

  useEffect(() => {
    getFile(r.id).then(setFile);
  }, [r.id]);

  const hosts = r.endpoints
    .filter((e) => e.status === 'working' || e.status === 'likely')
    .map((e) => `${e.host}:${e.port}`);

  const download = () => {
    if (!file) return;
    if (isNative()) {
      shareFileNative(file).catch(() => setMsg('Could not open the share menu.'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg('Saved to your Downloads folder.');
  };

  const send = async () => {
    setMsg('');
    if (!file) {
      setStep('manual');
      return;
    }
    if (isNative()) {
      try {
        await shareFileNative(file);
        setMsg(`Pick ${app.name} in the list. ${app.tip}`);
      } catch (e) {
        const m = e instanceof Error ? e.message : '';
        if (!/cancel/i.test(m)) setStep('manual');
      }
      return;
    }
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        setMsg(`Pick ${app.name} in the list. ${app.tip}`);
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    // Sharing this file type is not allowed by the browser: fall back to download.
    download();
    setStep('manual');
  };

  const copyHosts = async () => {
    try {
      await navigator.clipboard.writeText(hosts.join('\n'));
      setMsg('Hosts copied ✓');
    } catch {
      setMsg('Could not copy.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-emerald-400/30 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl ring-4 ring-emerald-400/20">
            {r.verdict === 'working' ? '✅' : '🟡'}
          </div>
          <h2 className="mt-3 text-xl font-extrabold text-white">
            {r.verdict === 'working' ? 'This config works!' : 'This config looks alive'}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            <b className="text-white">{r.name}</b>
            {r.country ? ` · ${r.flag} ${r.country}` : ''}
          </p>
          <p className="text-xs text-slate-400">
            Reachable on <b className="text-emerald-300">{r.isp}</b>
            {r.best?.latency != null ? ` · ${r.best.latency} ms` : ''}
          </p>
          {extra > 0 && <p className="mt-1 text-xs text-slate-500">+{extra} other working config{extra > 1 ? 's' : ''} in Results</p>}
        </div>

        {step === 'ask' ? (
          <>
            <p className="mt-5 text-center text-base font-semibold text-white">Do you want to use this internet?</p>
            <div className="mt-3 rounded-2xl bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">Opens with</p>
              <p className="mt-0.5 text-lg font-bold text-white">
                {app.icon} {app.name}
              </p>
              <p className="mt-1 text-xs text-slate-400">{app.tip}</p>
            </div>
            <button onClick={send} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-4 text-base font-extrabold text-slate-900 shadow-lg shadow-emerald-500/30 active:scale-[0.98]">
              🚀 Yes, use this internet
            </button>
            <a
              href={app.store}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openExternal(app.store);
              }}
              className="mt-2 block rounded-2xl bg-white/10 py-3 text-center text-sm font-semibold text-white active:scale-[0.98]">
              Don't have {app.name}? Get it
            </a>
            <button onClick={onClose} className="mt-2 w-full py-3 text-sm font-medium text-slate-400">
              Not now
            </button>
          </>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {file
                ? 'Your browser can’t send this file type directly, so it was saved to Downloads. Do this:'
                : 'The original file isn’t saved on this device. Do this:'}
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-100/90">
                <li>
                  Open <b>{app.name}</b>
                </li>
                <li>{file ? 'Import the file from Downloads.' : 'Import the file again from where you got it.'}</li>
                <li>{app.tip}</li>
              </ol>
            </div>
            {file && (
              <button onClick={download} className="w-full rounded-xl bg-white/10 py-3 text-sm font-semibold text-white active:scale-95">
                ⬇ Download file again
              </button>
            )}
            <button onClick={onClose} className="w-full rounded-xl bg-emerald-400 py-3 text-sm font-bold text-slate-900 active:scale-95">
              Done
            </button>
          </div>
        )}

        {hosts.length > 0 && (
          <button onClick={copyHosts} className="mt-2 w-full rounded-xl py-2 text-xs font-medium text-emerald-300/80 underline">
            Copy working hosts ({hosts.length})
          </button>
        )}
        {msg && <p className="mt-2 rounded-xl bg-emerald-500/10 p-3 text-center text-sm text-emerald-200">{msg}</p>}
      </div>
    </div>
  );
}
