const formats = [
  ['.hat', 'HA Tunnel'],
  ['.ehi', 'HTTP Injector'],
  ['.nm', 'NetMod'],
  ['.npv4', 'NapsternetV'],
  ['.inpv', 'Injector NPV'],
  ['.sks', 'SocksIP'],
  ['.tnl / .dark', 'Tunnel apps'],
  ['.ovpn', 'OpenVPN'],
  ['.json / .txt', 'V2Ray, Xray, sing-box'],
  ['vmess:// vless://', 'Share links, trojan, ss'],
];

export default function Guide({ canInstall, onInstall }: { canInstall: boolean; onInstall: () => void }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <h2 className="font-bold text-white">How it works</h2>
        <ol className="mt-2 space-y-2 text-sm text-slate-300">
          <li><b className="text-emerald-300">1.</b> Add config files (or paste a host / link).</li>
          <li><b className="text-emerald-300">2.</b> The app reads out every server, SNI and bug host inside.</li>
          <li><b className="text-emerald-300">3.</b> Each one is checked: DNS lookup → connection test → location lookup.</li>
          <li><b className="text-emerald-300">4.</b> You get a verdict for <i>your</i> provider, plus the country of the server.</li>
          <li><b className="text-emerald-300">5.</b> If it works, the app asks <i>“Use this internet?”</i> and sends the file to the right VPN app (WireGuard, OpenVPN, HTTP Injector, HA Tunnel, NetMod, v2rayNG…) where you press Connect.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <h2 className="font-bold text-white">Supported files</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {formats.map(([a, b]) => (
            <div key={a} className="rounded-xl bg-white/5 px-3 py-2">
              <p className="font-mono text-sm text-emerald-300">{a}</p>
              <p className="text-xs text-slate-400">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <h2 className="font-bold text-white">Reading the verdicts</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-300">
          <li>✅ <b>Working</b> – the server answered on your connection.</li>
          <li>🟡 <b>Likely works</b> – host is alive and reachable, but it isn't a web server (normal for SSH/VPN ports).</li>
          <li>❌ <b>Not working</b> – domain is dead, or your provider blocks it.</li>
          <li>🔒 <b>Locked file</b> – the app that made it encrypted it (common with .hat/.ehi). Enter the host in Quick test.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
        <h2 className="font-bold text-amber-200">💡 Pro tip: find free-flow hosts</h2>
        <p className="mt-1 text-sm text-amber-100/80">
          Turn on mobile data with <b>zero balance</b>, then test. If a host shows ✅ while you have no bundle, your provider
          is likely zero-rating it, which is exactly what free-internet configs rely on.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
        <h2 className="font-bold text-white">Honest limits</h2>
        <p className="mt-1 text-sm text-slate-300">
          A phone browser can't open raw TCP/UDP tunnels, so this is a fast, accurate <i>reachability</i> test – not a full
          VPN handshake. A ✅ means the server is up and your network can reach it; the final proof is still connecting in
          your tunnel app. Passwords or payloads inside configs are never uploaded; only host names are looked up.
        </p>
      </section>

      <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
        <h2 className="font-bold text-emerald-200">📲 Install as an app</h2>
        <p className="mt-1 text-sm text-emerald-100/80">
          Open this page in Chrome, then tap <b>⋮ → Install app / Add to Home screen</b>. It runs full-screen like an APK and
          works offline for saved results.
        </p>
        <p className="mt-2 text-xs text-emerald-100/60">
          Need a real <b>.apk</b> file? Paste this site's URL into <span className="font-mono">pwabuilder.com</span> → Android, and
          it generates one for you.
        </p>
        {canInstall && (
          <button onClick={onInstall} className="mt-3 w-full rounded-xl bg-emerald-400 py-3 font-bold text-slate-900 active:scale-95">
            Install now
          </button>
        )}
      </section>
    </div>
  );
}
