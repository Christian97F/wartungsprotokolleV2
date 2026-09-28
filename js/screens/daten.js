import { DB } from '../core/db.js';
import { esc, formatDatum } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, dialog } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { UNTERSCHRIFT_STANDARD } from '../core/model.js';
import { bildVerkleinern } from '../core/bild.js';
import { thema, setzeThema } from '../core/thema.js';
import {
  leseDatei, normalisiere, analysiere, importiere, beschreibe,
  exportBackup, exportUebersichtCsv, kannTeilen,
} from '../io/austausch.js';

const ARTEN = { anlagen: 'Anlagen', protokolle: 'Protokolle', vorlagen: 'Vorlagen' };
const STATUS = { neu: 'neu', neuer: 'neuer als vorhanden', aelter: 'älter als vorhanden', gleich: 'unverändert', geloescht: 'hier gelöscht' };

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
  if (leer && !analyse.loeschen.length && !analyse.einstellungen) { toast('Die Datei enthält keine Daten', 'warning'); return null; }
  const konflikte = analyse.loeschen.length || Object.keys(ARTEN).some(a => zaehle(a, 'neuer') + zaehle(a, 'aelter') + zaehle(a, 'geloescht') > 0);

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
      ${analyse.loeschen.length ? `<div class="banner banner-warn">${icon('loeschen')}<div><strong>${analyse.loeschen.length} Löschung(en)</strong>
        <span>Auf einem anderen Gerät gelöscht: ${analyse.loeschen.map(x => esc(beschreibe[x.art](x.obj))).join(', ')}</span></div></div>` : ''}
      ${konflikte ? `
        <fieldset class="optionen">
          <legend>Bereits vorhandene Einträge</legend>
          <label class="check"><input type="radio" name="strategie" value="neuere" checked><span><strong>Abgleichen</strong> – neuere Stände und Löschungen übernehmen (empfohlen)</span></label>
          <label class="check"><input type="radio" name="strategie" value="alle"><span><strong>Alles aus der Datei übernehmen</strong> – überschreibt auch neuere Stände, holt hier Gelöschtes zurück</span></label>
          <label class="check"><input type="radio" name="strategie" value="nurNeue"><span><strong>Vorhandene nicht anfassen</strong> – nur Neues hinzufügen, nichts löschen</span></label>
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
  const text = [...Object.entries(ARTEN).map(([a, l]) => z[a] ? `${z[a]} ${l}` : ''), z.geloescht ? `${z.geloescht} gelöscht` : '']
    .filter(Boolean).join(', ');
  toast(text ? `Importiert: ${text}` : 'Nichts zu importieren – alles aktuell', text ? 'success' : 'info', 4500);
  return z;
}

export async function render(el) {
  setzeKopf({ titel: 'Daten & Einstellungen', eyebrow: 'Import · Export · Briefkopf' });

  const [anlagen, protokolle, vorlagen, firma, techniker, letztesBackup, usFelder] = await Promise.all([
    DB.anlagen.alle(), DB.protokolle.alle(), DB.vorlagen.alle(),
    DB.einstellung('firma', {}), DB.einstellung('techniker', ''), DB.einstellung('letztesBackup'),
    DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD),
  ]);
  const f = firma || {};
  const teilen = kannTeilen();
  const tageSeitBackup = letztesBackup ? Math.floor((Date.now() - new Date(letztesBackup)) / 864e5) : null;

  el.innerHTML = `
    <div class="daten-raster">
      <section class="karte">
        <h2 class="karte-titel">${icon('import')} Import</h2>
        <label class="ablage" id="ablage">
          <input type="file" id="datei" accept=".json,application/json" multiple class="datei-input">
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
        <div class="feld us-wahl">
          <span class="feld-label">Unterschriftsfelder im Bericht</span>
          <div class="knopfreihe">
            <label class="check"><input type="checkbox" data-us="techniker" ${usFelder.techniker ? 'checked' : ''}><span>Techniker</span></label>
            <label class="check"><input type="checkbox" data-us="kunde" ${usFelder.kunde ? 'checked' : ''}><span>Kunde / Betreiber</span></label>
          </div>
          <span class="feld-hinweis">Gilt für alle Protokolle – außer denen, bei denen unter „Abschluss“ etwas anderes eingestellt wurde.</span>
        </div>
        <div class="logo-zeile">
          <div class="logo-vorschau" id="logo-vorschau">${f.logo ? `<img src="${f.logo}" alt="Logo">` : '<span>Kein Logo</span>'}</div>
          <label class="btn btn-ghost">${icon('datei')}Logo wählen<input type="file" accept="image/*" id="logo" class="datei-input"></label>
          ${f.logo ? `<button class="btn btn-ghost" id="logo-weg">${icon('loeschen')}Entfernen</button>` : ''}
        </div>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('info')} App & Speicher</h2>
        <div class="feld">
          <span class="feld-label">Darstellung</span>
          <div class="segment" role="group" id="thema-wahl">
            ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([w, l]) =>
              `<button type="button" class="seg" data-thema="${w}" aria-pressed="${thema() === w}">${l}</button>`).join('')}
          </div>
        </div>
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
  el.querySelectorAll('[data-us]').forEach(cb => cb.addEventListener('change', () => {
    usFelder[cb.dataset.us] = cb.checked;
    DB.setzeEinstellung('unterschriftFelder', { ...usFelder });
  }));
  el.querySelector('#techniker').addEventListener('change', e => DB.setzeEinstellung('techniker', e.target.value.trim()));
  el.querySelector('#logo').addEventListener('change', async e => {
    const d = e.target.files[0];
    if (!d) return;
    try {
      f.logo = await bildVerkleinern(d, { max: 600, format: 'image/png' });
      await speichereFirma();
      toast('Logo gespeichert', 'success');
      neuLaden();
    } catch (err) {
      toast(`Logo konnte nicht geladen werden: ${err.message}`, 'error', 6000);
    }
  });
  el.querySelector('#logo-weg')?.addEventListener('click', async () => { delete f.logo; await speichereFirma(); neuLaden(); });

  el.querySelector('#thema-wahl').addEventListener('click', e => {
    const b = e.target.closest('[data-thema]');
    if (!b) return;
    setzeThema(b.dataset.thema);
    el.querySelectorAll('[data-thema]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
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
