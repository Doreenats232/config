// Keeps the original config file so it can be handed to a VPN app after a successful test.
const key = (id: string) => `cfgtester.file.${id}`;
const MAX = 600_000; // bytes

export function saveFile(id: string, file: File): Promise<void> {
  return new Promise((resolve) => {
    if (file.size > MAX) return resolve();
    const fr = new FileReader();
    fr.onload = () => {
      try {
        localStorage.setItem(key(id), JSON.stringify({ name: file.name, type: file.type, data: fr.result }));
      } catch {
        /* storage full – the file just won't be re-shareable later */
      }
      resolve();
    };
    fr.onerror = () => resolve();
    fr.readAsDataURL(file);
  });
}

export async function getFile(id: string): Promise<File | null> {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const { name, type, data } = JSON.parse(raw);
    const blob = await (await fetch(data)).blob();
    return new File([blob], name, { type: type || 'application/octet-stream' });
  } catch {
    return null;
  }
}

export const hasFile = (id: string) => !!localStorage.getItem(key(id));
export const deleteFile = (id: string) => localStorage.removeItem(key(id));
export function deleteAllFiles() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('cfgtester.file.'))
    .forEach((k) => localStorage.removeItem(k));
}
