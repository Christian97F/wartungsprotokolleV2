// App-Updates über den Service Worker: registrieren, im Hintergrund prüfen, auf Knopfdruck übernehmen.
import { toast } from './ui.js';

let registrierung = null;
// Neue Version ist aktiv, die geöffnete Seite läuft aber noch mit den alten Dateien
let bereit = false;

export const updateBereit = () => bereit;

function warteAufAktivierung(sw) {
  return new Promise(resolve => {
    if (sw.state === 'activated') return resolve();
    sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
  });
}

export function updatesEinrichten() {
  if (!('serviceWorker' in navigator)) return;
  const hatteVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    registrierung = reg;
    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      if (!neu || !hatteVersion) return;
      warteAufAktivierung(neu).then(() => {
        bereit = true;
        toast('Update installiert – unter „Daten“ mit „Jetzt aktualisieren“ übernehmen', 'info', 6000);
        document.dispatchEvent(new CustomEvent('update-bereit'));
      });
    });
    // iOS startet installierte Web-Apps selten neu: beim Zurückkehren nach Updates sehen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(err => console.warn('Service Worker:', err));
}

/** Version der aktiven App-Dateien (aus dem Service Worker) */
export function appVersion() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return Promise.resolve(null);
  return new Promise(resolve => {
    const kanal = new MessageChannel();
    kanal.port1.onmessage = (e) => resolve(e.data);
    sw.postMessage('version', [kanal.port2]);
    setTimeout(() => resolve(null), 1500);
  });
}

/**
 * Sucht nach einer neuen Version und lädt die App damit neu.
 * Liefert 'aktuell', wenn es nichts Neues gibt (dann kein Neuladen).
 */
export async function aktualisieren() {
  if (bereit) return location.reload();
  const reg = registrierung || await navigator.serviceWorker?.getRegistration();
  if (!reg) throw new Error('Updates werden von diesem Browser nicht unterstützt');
  await reg.update();
  const neu = reg.installing || reg.waiting;
  if (!neu) return 'aktuell';
  await warteAufAktivierung(neu);
  location.reload();
  return 'neu';
}
