import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';

/** True when running inside the installed Android APK (Capacitor), false in a normal browser. */
export const isNative = () => Capacitor.isNativePlatform();

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Opens the Android share sheet with a real file (works inside the APK). */
export async function shareFileNative(file: File): Promise<void> {
  const path = `shared/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
  await Filesystem.writeFile({
    path,
    data: await toBase64(file),
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await Share.share({ title: file.name, dialogTitle: 'Open with your VPN app', files: [uri] });
}

export async function openExternal(url: string) {
  if (isNative()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener');
}
