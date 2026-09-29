// Erinnerungen zum Datenabgleich zwischen Geräten:
// 1. Import – beim Start, bis an diesem Tag importiert wurde.
// 2. Sicherung – getrennt davon, solange es lokale Änderungen seit der letzten Sicherung gibt.
//    Nur nach einem Import von heute, sonst würde ein veraltetes Backup die Daten anderer Geräte verdrängen.
import { DB } from '../core/db.js';
import { esc } from '../core/util.js';
import { icon } from '../core/icons.js';
import { dialog, toast } from '../core/ui.js';
import { exportBackup, kannTeilen } from '../io/austausch.js';

export const ERINNERUNG_STANDARD = { aktiv: true, backup: true, hinweis: '' };

const zeit = (iso) => iso
  ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  : 'noch nie';

const istHeute = (iso) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

async function einstellung() {
  return { ...ERINNERUNG_STANDARD, ...await DB.einstellung('syncErinnerung', ERINNERUNG_STANDARD) };
}

const hinweisHtml = (e) => e.hinweis
  ? `<div class="erinnerung-hinweis">${icon('info')}<div>${esc(e.hinweis).replace(/\n/g, '<br>')}</div></div>` : '';

const neuZeichnen = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Datei-Auswahl als Label, damit iOS den Dialog aus der Nutzeraktion heraus öffnet
function importAuswahl(onDateien) {
  return {
    html: `<label class="btn btn-primary btn-gross erinnerung-knopf">${icon('import')}Backup-Datei auswählen
      <input type="file" accept=".json,application/json" multiple class="datei-input" data-erinnerung-datei></label>`,
    binde: (dlg, schliessen) => dlg.querySelector('[data-erinnerung-datei]').addEventListener('change', e => {
      if (!e.target.files.length) return;
      onDateien([...e.target.files]);
      schliessen('datei');
    }),
  };
}

async function importieren(dateien) {
  const { importDialog } = await import('./daten.js');
  const z = await importDialog(dateien);
  if (z) neuZeichnen();
  return z;
}

// Wann welche Erinnerung zuletzt angezeigt wurde (gerätebezogen, nicht im Backup)
const merkeGezeigt = (art) => DB.setzeEinstellung(`erinnerungGezeigt_${art}`, new Date().toISOString());
const heuteGezeigt = async (art) => istHeute(await DB.einstellung(`erinnerungGezeigt_${art}`));
let laeuft = false;

/**
 * Beim Start immer; beim Zurückkehren aus dem Hintergrund jede Erinnerung (Import, Sicherung)
 * höchstens einmal am Tag.
 */
export async function taeglicheErinnerung({ ausHintergrund = false } = {}) {
  if (laeuft || document.querySelector('dialog[open]')) return;
  laeuft = true;
  try {
    await erinnern(ausHintergrund);
  } finally {
    laeuft = false;
  }
}

// Kurze Wechsel (Teilen-Menü, Dateiauswahl, Kamera) sollen keine Erinnerung auslösen
const MIN_HINTERGRUND_MS = 60_000;

export function hintergrundUeberwachen() {
  let verstecktSeit = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { verstecktSeit = Date.now(); return; }
    if (verstecktSeit && Date.now() - verstecktSeit >= MIN_HINTERGRUND_MS) {
      taeglicheErinnerung({ ausHintergrund: true }).catch(e => console.warn('Erinnerung:', e));
    }
    verstecktSeit = null;
  });
}

async function erinnern(ausHintergrund) {
  const e = await einstellung();
  const [letzterImport, letztesBackup] = await Promise.all([DB.einstellung('letzterImport'), DB.einstellung('letztesBackup')]);
  if (e.aktiv && !istHeute(letzterImport)) {
    if (ausHintergrund && await heuteGezeigt('import')) return;
    let dateien = null;
    const auswahl = importAuswahl(d => { dateien = d; });
    await merkeGezeigt('import');
    await dialog({
      titel: 'Daten aktualisieren',
      inhalt: `
        <p class="dlg-text">Bitte die aktuelle Sicherung importieren, damit dieses Gerät auf dem neuesten Stand ist.</p>
        ${hinweisHtml(e)}
        <p class="hinweis">Letzter Import auf diesem Gerät: <strong>${zeit(letzterImport)}</strong><br>
          Letzte Sicherung von diesem Gerät: <strong>${zeit(letztesBackup)}</strong></p>
        ${auswahl.html}`,
      aktionen: [{ label: 'Später', wert: null }],
      onOpen: auswahl.binde,
    });
    // Nach dem Import fragt importDialog selbst nach der Sicherung
    if (dateien) await importieren(dateien);
    return;
  }
  if (ausHintergrund && await heuteGezeigt('backup')) return;
  await backupErinnerung();
}

/** Fragt nach einer Sicherung, wenn es ungesicherte Änderungen gibt und heute schon importiert wurde. */
export async function backupErinnerung() {
  const e = await einstellung();
  if (!e.backup) return;
  const [ungesichert, letzterImport, letztesBackup] = await Promise.all([
    DB.einstellung('ungesichert'), DB.einstellung('letzterImport'), DB.einstellung('letztesBackup')]);
  if (!ungesichert || !istHeute(letzterImport)) return;
  await merkeGezeigt('backup');
  const wahl = await dialog({
    titel: 'Sicherung hochladen',
    inhalt: `
      <p class="dlg-text">Auf diesem Gerät gibt es Änderungen seit <strong>${zeit(ungesichert)}</strong>, die noch in keiner Sicherung enthalten sind.
        Bitte eine Sicherung erstellen und am gemeinsamen Ablageort speichern, damit die anderen Geräte sie bekommen.</p>
      ${hinweisHtml(e)}
      <p class="hinweis">Letzter Import: <strong>${zeit(letzterImport)}</strong><br>
        Letzte Sicherung von diesem Gerät: <strong>${zeit(letztesBackup)}</strong></p>`,
    aktionen: [
      { label: 'Später', wert: null },
      { label: 'Sicherung erstellen', wert: 'ok', art: 'primary', icon: 'export' },
    ],
  });
  if (wahl === 'ok') await sicherungErstellen({ teilen: kannTeilen(), geprueft: true });
}

/**
 * Komplettsicherung mit Schutz: Ohne Import von heute fehlen evtl. Änderungen anderer Geräte,
 * und die neue Datei würde die aktuelle am Ablageort ersetzen. Daher gesperrt – nur mit Notfall-Bestätigung.
 */
const NOTFALL_WORT = 'NOTFALL';

async function notfallBestaetigen() {
  const wahl = await dialog({
    titel: 'Notfall-Sicherung',
    inhalt: `
      <p class="dlg-text">Nur verwenden, wenn es wirklich keine aktuellere Sicherung gibt, z. B.:</p>
      <ul class="dlg-liste">
        <li>dies ist das erste Gerät, am Ablageort liegt noch keine Sicherung,</li>
        <li>die Datei am Ablageort ist beschädigt oder nicht erreichbar.</li>
      </ul>
      <div class="banner banner-fehler">${icon('warnung')}<div><strong>Risiko</strong>
        <span>Hat ein anderes Gerät inzwischen eine Sicherung hochgeladen, überschreibt diese Datei dessen Änderungen.</span></div></div>
      <label class="feld"><span class="feld-label">Zum Bestätigen „${NOTFALL_WORT}“ eingeben</span>
        <input class="inp" type="text" name="notfall" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`,
    aktionen: [
      { label: 'Abbrechen', wert: null },
      { label: 'Notfall-Sicherung erstellen', wert: 'ok', art: 'danger', icon: 'export' },
    ],
    onOpen: (dlg) => {
      const knopf = dlg.querySelector('[data-dlg-aktion="1"]');
      knopf.disabled = true;
      dlg.querySelector('[name="notfall"]').addEventListener('input', e => {
        knopf.disabled = e.target.value.trim().toUpperCase() !== NOTFALL_WORT;
      });
    },
  });
  return wahl === 'ok';
}

export async function sicherungErstellen({ teilen = false, geprueft = false } = {}) {
  if (!geprueft && !istHeute(await DB.einstellung('letzterImport'))) {
    let dateien = null;
    const auswahl = importAuswahl(d => { dateien = d; });
    const wahl = await dialog({
      titel: 'Erst importieren',
      inhalt: `
        <div class="banner banner-fehler">${icon('schloss')}<div><strong>Sicherung gesperrt – heute noch nicht importiert</strong>
          <span>Änderungen anderer Geräte würden in dieser Sicherung fehlen. Ersetzt sie die aktuelle Datei am Ablageort, gehen diese Änderungen verloren.</span></div></div>
        <p class="dlg-text">Bitte zuerst die aktuelle Sicherung importieren. Danach kann eine neue erstellt werden.</p>
        ${hinweisHtml(await einstellung())}
        ${auswahl.html}
        <button type="button" class="link notfall-link" data-notfall>Nichts zum Importieren? Notfall-Sicherung …</button>`,
      aktionen: [{ label: 'Abbrechen', wert: null }],
      onOpen: (dlg, schliessen) => {
        auswahl.binde(dlg, schliessen);
        dlg.querySelector('[data-notfall]').addEventListener('click', () => schliessen('notfall'));
      },
    });
    if (dateien) { await importieren(dateien); return; }
    if (wahl !== 'notfall' || !await notfallBestaetigen()) return;
  }
  try {
    const r = await exportBackup({ teilen });
    if (r.r !== 'abgebrochen') toast(`Sicherung erstellt: ${r.name}`, 'success');
    if (location.hash.startsWith('#/daten')) neuZeichnen();
  } catch (err) {
    toast(`Export fehlgeschlagen: ${err.message}`, 'error');
  }
}
