export interface TunnelApp {
  name: string;
  icon: string;
  store: string;
  tip: string;
}

const play = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;
const search = (q: string) => `https://play.google.com/store/search?q=${encodeURIComponent(q)}&c=apps`;

const APPS: Record<string, TunnelApp> = {
  hat: { name: 'HA Tunnel Plus', icon: '🛡️', store: search('HA Tunnel Plus'), tip: 'Tap ⋮ / “Import config”, choose the .hat file, then press START.' },
  ehi: { name: 'HTTP Injector', icon: '💉', store: play('com.evozi.injector'), tip: 'Tap the “Open config” (folder) icon, pick the .ehi file, then press Start.' },
  nm: { name: 'NetMod VPN', icon: '🌐', store: play('com.netmod.syna'), tip: 'Tap ⋮ → Import / Open config, pick the .nm file, then press the connect button.' },
  npv4: { name: 'NapsternetV', icon: '🚀', store: play('com.napsternetlabs.napsternetv'), tip: 'Tap + → Import config from file, pick it, then tap the connect button.' },
  npvt: { name: 'NapsternetV', icon: '🚀', store: play('com.napsternetlabs.napsternetv'), tip: 'Tap + → Import config from file, pick it, then tap the connect button.' },
  inpv: { name: 'Injector NPV', icon: '🚀', store: search('Injector NPV'), tip: 'Import the file from inside the app, then connect.' },
  sks: { name: 'SocksIP Tunnel', icon: '🧦', store: search('SocksIP Tunnel'), tip: 'Import the .sks file from inside the app, then start.' },
  dark: { name: 'Dark Tunnel', icon: '🌑', store: search('Dark Tunnel VPN'), tip: 'Import the file from inside the app, then start.' },
  ovpn: { name: 'OpenVPN for Android', icon: '🔐', store: play('de.blinkt.openvpn'), tip: 'Tap + → import the .ovpn file, save, then tap the profile to connect.' },
  conf: { name: 'WireGuard', icon: '🐉', store: play('com.wireguard.android'), tip: 'Tap + → Import from file, pick the .conf file, then flip the switch on.' },
  json: { name: 'v2rayNG', icon: '⚡', store: play('com.v2ray.ang'), tip: 'Tap + → Import config from local file, then press the ▶ button.' },
  txt: { name: 'v2rayNG', icon: '⚡', store: play('com.v2ray.ang'), tip: 'Tap + → Import config from clipboard (copy the link first), then press ▶.' },
};

const FALLBACK: TunnelApp = {
  name: 'your VPN / tunnel app',
  icon: '📲',
  store: search('VPN tunnel'),
  tip: 'Open the app, use its “Import” option, pick the file, then connect.',
};

export function appFor(ext: string, format: string): TunnelApp {
  if (/vless|vmess|trojan|ss link|hysteria|tuic/i.test(format)) return APPS.json;
  if (/wireguard/i.test(format)) return APPS.conf;
  return APPS[ext.toLowerCase()] || FALLBACK;
}
