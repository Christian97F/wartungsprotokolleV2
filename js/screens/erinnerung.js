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

export async function taeglicheErinnerung() {
  const e = await einstellung();
  const [letzterImport, letztesBackup] = await Promise.all([DB.einstellung('letzterImport'), DB.einstellung('letztesBackup')]);
  if (e.aktiv && !istHeute(letzterImport)) {
    let dateien = null;
    const auswahl = importAuswahl(d => { dateien = d; });
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
  await backupErinnerung();
}

/** Fragt nach einer Sicherung, wenn es ungesicherte Änderungen gibt und heute schon importiert wurde. */
export async function backupErinnerung() {
  const e = await einstellung();
  if (!e.backup) return;
  const [ungesichert, letzterImport, letztesBackup] = await Promise.all([
    DB.einstellung('ungesichert'), DB.einstellung('letzterImport'), DB.einstellung('letztesBackup')]);
  if (!ungesichert || !istHeute(letzterImport)) return;
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
 * und die neue Datei würde die aktuelle am Ablageort ersetzen.
 */
export async function sicherungErstellen({ teilen = false, geprueft = false } = {}) {
  if (!geprueft && !istHeute(await DB.einstellung('letzterImport'))) {
    let dateien = null;
    const auswahl = importAuswahl(d => { dateien = d; });
    const wahl = await dialog({
      titel: 'Erst importieren?',
      inhalt: `
        <div class="banner banner-fehler">${icon('warnung')}<div><strong>Heute noch nicht importiert</strong>
          <span>Änderungen anderer Geräte fehlen in dieser Sicherung. Ersetzt sie die aktuelle Datei am Ablageort, gehen diese Änderungen verloren.</span></div></div>
        <p class="dlg-text">Bitte zuerst die aktuelle Sicherung importieren und danach eine neue erstellen.</p>
        ${hinweisHtml(await einstellung())}
        ${auswahl.html}`,
      aktionen: [
        { label: 'Abbrechen', wert: null },
        { label: 'Trotzdem sichern', wert: 'trotzdem', art: 'danger-leise' },
      ],
      onOpen: auswahl.binde,
    });
    if (dateien) { await importieren(dateien); return; }
    if (wahl !== 'trotzdem') return;
  }
  try {
    const r = await exportBackup({ teilen });
    if (r.r !== 'abgebrochen') toast(`Sicherung erstellt: ${r.name}`, 'success');
    if (location.hash.startsWith('#/daten')) neuZeichnen();
  } catch (err) {
    toast(`Export fehlgeschlagen: ${err.message}`, 'error');
  }
}
