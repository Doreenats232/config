# Config Tester

Tests free-internet configuration files (.hat, .ehi, .nm, .npv4, .ovpn, .json, vmess/vless links…), shows
which country the server is in, and — if it works — offers to open it in the right VPN app.

## Get the APK from GitHub (no coding needed)

1. Create a new repository on GitHub and upload **all** the files from this project
   (keep the `.github` folder – it contains the build instructions).
2. Open the **Actions** tab. The *Build Android APK* workflow starts by itself (takes ~5–8 minutes).
   Make sure Actions are enabled for the repo.
3. When it turns green, open the repo's **Releases** (right side of the main page) and download
   **ConfigTester.apk**. (It is also under the workflow run → *Artifacts*.)
4. Open the APK on your phone and tap **Install** (allow "Install unknown apps" if asked).

Every new push builds a fresh APK. You can also start a build manually: **Actions → Build Android APK → Run workflow**.

## Notes
- The APK is signed with a debug key, which is fine for personal installs.
  Keep the signing key stable by committing your own `keystore/debug.keystore` (alias `androiddebugkey`,
  password `android`); otherwise the workflow caches one for you.
- Run locally: `npm install && npm run dev`
- Build the Android project yourself: `npm run build && npx cap add android && npx cap sync android`,
  then open the `android` folder in Android Studio.
