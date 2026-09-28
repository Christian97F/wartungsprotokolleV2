// Einmal täglich beim Start an das Aktualisieren der Daten (Import der Sicherung) erinnern.
import { DB } from '../core/db.js';
import { esc, heuteIso } from '../core/util.js';
import { icon } from '../core/icons.js';
import { dialog } from '../core/ui.js';

export const ERINNERUNG_STANDARD = { aktiv: true, hinweis: '' };

const zeit = (iso) => iso
  ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  : 'noch nie';

export async function taeglicheErinnerung() {
  const einstellung = await DB.einstellung('syncErinnerung', ERINNERUNG_STANDARD);
  if (!einstellung.aktiv) return;
  // Pro Gerät gespeichert (nicht im Backup), damit jedes Tablet selbst fragt
  if ((await DB.einstellung('syncGefragtAm')) === heuteIso()) return;
  await DB.setzeEinstellung('syncGefragtAm', heuteIso());

  const [letzterImport, letztesBackup] = await Promise.all([DB.einstellung('letzterImport'), DB.einstellung('letztesBackup')]);
  let dateien = null;
  await dialog({
    titel: 'Daten aktualisieren',
    inhalt: `
      <p class="dlg-text">Bitte die aktuelle Sicherung importieren, damit dieses Gerät auf dem neuesten Stand ist.</p>
      ${einstellung.hinweis ? `<div class="erinnerung-hinweis">${icon('info')}<div>${esc(einstellung.hinweis).replace(/\n/g, '<br>')}</div></div>` : ''}
      <p class="hinweis">Letzter Import auf diesem Gerät: <strong>${zeit(letzterImport)}</strong><br>
        Letzte Sicherung von diesem Gerät: <strong>${zeit(letztesBackup)}</strong></p>
      <label class="btn btn-primary btn-gross erinnerung-knopf">${icon('import')}Backup-Datei auswählen
        <input type="file" accept=".json,application/json" multiple class="datei-input" id="erinnerung-datei"></label>`,
    aktionen: [{ label: 'Später', wert: null }],
    onOpen: (dlg, schliessen) => {
      dlg.querySelector('#erinnerung-datei').addEventListener('change', e => {
        if (!e.target.files.length) return;
        dateien = [...e.target.files];
        schliessen('datei');
      });
    },
  });
  if (!dateien) return;
  const { importDialog } = await import('./daten.js');
  if (await importDialog(dateien)) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
