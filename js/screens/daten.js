import { DB } from '../core/db.js';
import { esc, formatDatum } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, dialog } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import {
  leseDatei, normalisiere, analysiere, importiere, beschreibe,
  exportBackup, exportUebersichtCsv, kannTeilen,
} from '../io/austausch.js';

const ARTEN = { anlagen: 'Anlagen', protokolle: 'Protokolle', vorlagen: 'Vorlagen' };
const STATUS = { neu: 'neu', neuer: 'neuer als vorhanden', aelter: 'älter als vorhanden', gleich: 'unverändert' };

export async function importDialog(dateien) {
  let analyse;
  try {
    const pakete = [];
    for (const d of dateien) pakete.push(await normalisiere(await leseDatei(d), d.name));
    analyse = await analysiere(pakete);
  } catch (e) {
    toast(e.message, 'error', 6000);
    return null;
  }

  const zaehle = (art, st) => analyse[art].filter(x => x.status === st).length;
  const leer = Object.keys(ARTEN).every(a => !analyse[a].length);
  if (leer && !analyse.einstellungen) { toast('Die Datei enthält keine Daten', 'warning'); return null; }
  const konflikte = Object.keys(ARTEN).some(a => zaehle(a, 'neuer') + zaehle(a, 'aelter') > 0);

  const { wert, daten } = await dialog({
    titel: 'Import prüfen',
    breit: true,
    inhalt: `
      ${analyse.alt ? `<div class="banner">${icon('info')}<div><strong>Älteres Dateiformat</strong><span>Die Daten werden automatisch in das neue Format umgewandelt (NEA-Vorlage).</span></div></div>` : ''}
      <table class="import-tabelle">
        <thead><tr><th></th><th>Neu</th><th>Neuer</th><th>Älter</th><th>Gleich</th></tr></thead>
        <tbody>${Object.entries(ARTEN).filter(([a]) => analyse[a].length).map(([a, l]) => `
          <tr><th>${l}</th>${['neu', 'neuer', 'aelter', 'gleich'].map(st => `<td>${zaehle(a, st) || '–'}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      ${konflikte ? `
        <fieldset class="optionen">
          <legend>Bereits vorhandene Einträge</legend>
          <label class="check"><input type="radio" name="strategie" value="neuere" checked><span><strong>Nur neuere übernehmen</strong> – empfohlen</span></label>
          <label class="check"><input type="radio" name="strategie" value="alle"><span><strong>Alles aus der Datei übernehmen</strong> – überschreibt auch neuere Stände</span></label>
          <label class="check"><input type="radio" name="strategie" value="nurNeue"><span><strong>Vorhandene nicht anfassen</strong> – nur Neues hinzufügen</span></label>
        </fieldset>` : ''}
      ${analyse.einstellungen?.firma ? `<label class="check"><input type="checkbox" name="firma"><span>Briefkopf (Firma/Logo) aus der Datei übernehmen</span></label>` : ''}
      <details class="import-details"><summary>Einträge anzeigen</summary>
        ${Object.entries(ARTEN).filter(([a]) => analyse[a].length).map(([a, l]) => `
          <h4>${l}</h4><ul>${analyse[a].map(x => `<li>${esc(beschreibe[a](x.obj))} <span class="tag tag-leise">${STATUS[x.status]}</span></li>`).join('')}</ul>`).join('')}
      </details>`,
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: 'Importieren', wert: 'ok', art: 'primary', icon: 'import' }],
    auslesen: dlg => ({
      strategie: dlg.querySelector('[name="strategie"]:checked')?.value || 'neuere',
      firma: !!dlg.querySelector('[name="firma"]')?.checked,
    }),
  });
  if (wert !== 'ok') return null;

  const z = await importiere(analyse, daten.strategie, { einstellungen: daten.firma });
  const text = Object.entries(ARTEN).map(([a, l]) => z[a] ? `${z[a]} ${l}` : '').filter(Boolean).join(', ');
  toast(text ? `Importiert: ${text}` : 'Nichts zu importieren – alles aktuell', text ? 'success' : 'info', 4500);
  return z;
}

async function logoLaden(datei) {
  const bild = await createImageBitmap(datei);
  const max = 600;
  const f = Math.min(1, max / Math.max(bild.width, bild.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.width * f);
  c.height = Math.round(bild.height * f);
  c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
  return c.toDataURL(datei.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
}

export async function render(el) {
  setzeKopf({ titel: 'Daten & Einstellungen', eyebrow: 'Import · Export · Briefkopf' });

  const [anlagen, protokolle, vorlagen, firma, techniker, letztesBackup] = await Promise.all([
    DB.anlagen.alle(), DB.protokolle.alle(), DB.vorlagen.alle(),
    DB.einstellung('firma', {}), DB.einstellung('techniker', ''), DB.einstellung('letztesBackup'),
  ]);
  const f = firma || {};
  const teilen = kannTeilen();
  const tageSeitBackup = letztesBackup ? Math.floor((Date.now() - new Date(letztesBackup)) / 864e5) : null;

  el.innerHTML = `
    <div class="daten-raster">
      <section class="karte">
        <h2 class="karte-titel">${icon('import')} Import</h2>
        <label class="ablage" id="ablage">
          <input type="file" id="datei" accept=".json,application/json" multiple hidden>
          ${icon('import')}
          <strong>Dateien auswählen oder hierher ziehen</strong>
          <span>Backups, Anlagen, Protokolle, Vorlagen – auch Dateien der alten App-Version</span>
        </label>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('export')} Export</h2>
        <div class="backup-info ${tageSeitBackup === null || tageSeitBackup > 30 ? 'backup-alt' : ''}">
          ${letztesBackup ? `Letzte Sicherung: <strong>${formatDatum(letztesBackup)}</strong>${tageSeitBackup > 30 ? ' – eine neue Sicherung wird empfohlen.' : ''}` : 'Noch keine Sicherung erstellt. Die Daten liegen nur in diesem Browser.'}
        </div>
        <p class="hinweis">${anlagen.length} Anlagen · ${protokolle.length} Protokolle · ${vorlagen.length} eigene Vorlagen</p>
        <div class="knopfreihe">
          <button class="btn btn-primary" data-x="backup">${icon('export')}Komplettsicherung</button>
          ${teilen ? `<button class="btn btn-ghost" data-x="backup-teilen">${icon('teilen')}Sicherung teilen</button>` : ''}
          <button class="btn btn-ghost" data-x="csv">${icon('liste')}Übersicht als CSV</button>
        </div>
        <p class="hinweis">Einzelne Anlagen, Protokolle und Vorlagen lassen sich direkt in den jeweiligen Listen über das Menü ${icon('mehr')} exportieren.</p>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('pdf')} Briefkopf für Berichte</h2>
        <div class="feldraster">
          <label class="feld"><span class="feld-label">Firmenname</span><input class="inp" type="text" data-f="name" value="${esc(f.name)}"></label>
          <label class="feld"><span class="feld-label">Standard-Techniker</span><input class="inp" type="text" id="techniker" value="${esc(techniker)}" placeholder="wird in neue Protokolle eingetragen"></label>
          <label class="feld"><span class="feld-label">Anschrift</span><textarea class="inp" rows="3" data-f="adresse">${esc(f.adresse)}</textarea></label>
          <label class="feld"><span class="feld-label">Kontakt</span><textarea class="inp" rows="3" data-f="kontakt" placeholder="Telefon, E-Mail, Web">${esc(f.kontakt)}</textarea></label>
        </div>
        <div class="logo-zeile">
          <div class="logo-vorschau" id="logo-vorschau">${f.logo ? `<img src="${f.logo}" alt="Logo">` : '<span>Kein Logo</span>'}</div>
          <label class="btn btn-ghost">${icon('datei')}Logo wählen<input type="file" accept="image/*" id="logo" hidden></label>
          ${f.logo ? `<button class="btn btn-ghost" id="logo-weg">${icon('loeschen')}Entfernen</button>` : ''}
        </div>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('info')} Speicher & App</h2>
        <p class="hinweis" id="speicher">Speicherbelegung wird ermittelt …</p>
        <div class="knopfreihe"><button class="btn btn-ghost" id="persist">${icon('schloss')}Dauerhafte Speicherung anfordern</button></div>
        <p class="hinweis">Alle Daten liegen lokal in diesem Browser (IndexedDB) und funktionieren offline. Beim Löschen der Browserdaten gehen sie verloren – regelmäßig sichern!</p>
      </section>
    </div>`;

  const neuLaden = () => navigiere('/daten', { ersetzen: true });
  const datei = el.querySelector('#datei');
  const ablage = el.querySelector('#ablage');
  const imp = async (liste) => { if (liste.length && await importDialog([...liste])) neuLaden(); };
  datei.addEventListener('change', () => { imp(datei.files); datei.value = ''; });
  ablage.addEventListener('dragover', e => { e.preventDefault(); ablage.classList.add('ziehen'); });
  ablage.addEventListener('dragleave', () => ablage.classList.remove('ziehen'));
  ablage.addEventListener('drop', e => { e.preventDefault(); ablage.classList.remove('ziehen'); imp(e.dataTransfer.files); });

  el.addEventListener('click', async e => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    try {
      if (x.dataset.x === 'csv') toast(`Exportiert: ${await exportUebersichtCsv()}`, 'success');
      else {
        const r = await exportBackup({ teilen: x.dataset.x === 'backup-teilen' });
        if (r.r !== 'abgebrochen') toast(`Sicherung erstellt: ${r.name}`, 'success');
      }
    } catch (err) {
      toast(`Export fehlgeschlagen: ${err.message}`, 'error');
    }
  });

  const speichereFirma = async () => { await DB.setzeEinstellung('firma', f); };
  el.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
    f[inp.dataset.f] = inp.value.trim();
    speichereFirma();
    toast('Briefkopf gespeichert', 'success', 1500);
  }));
  el.querySelector('#techniker').addEventListener('change', e => DB.setzeEinstellung('techniker', e.target.value.trim()));
  el.querySelector('#logo').addEventListener('change', async e => {
    const d = e.target.files[0];
    if (!d) return;
    f.logo = await logoLaden(d);
    await speichereFirma();
    neuLaden();
  });
  el.querySelector('#logo-weg')?.addEventListener('click', async () => { delete f.logo; await speichereFirma(); neuLaden(); });

  el.querySelector('#persist').addEventListener('click', async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'Daten werden dauerhaft gespeichert' : 'Der Browser hat die dauerhafte Speicherung nicht gewährt', ok ? 'success' : 'warning');
  });
  navigator.storage?.estimate?.().then(async s => {
    const mb = (b) => (b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const dauerhaft = await navigator.storage.persisted?.();
    el.querySelector('#speicher').textContent =
      `Belegt: ${mb(s.usage)} MB von ${mb(s.quota)} MB · Speicherung ${dauerhaft ? 'dauerhaft' : 'nicht dauerhaft (Browser darf bei Platzmangel löschen)'}`;
  });
}
