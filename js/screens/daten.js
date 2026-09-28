import { DB } from '../core/db.js';
import { esc, formatDatum } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, dialog } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { UNTERSCHRIFT_STANDARD } from '../core/model.js';
import { bildVerkleinern } from '../core/bild.js';
import { thema, setzeThema } from '../core/thema.js';
import { ERINNERUNG_STANDARD } from './erinnerung.js';
import {
  leseDatei, normalisiere, analysiere, importiere, beschreibe,
  schluessel, loeschSchluessel, vorausgewaehlt, loeschungVorausgewaehlt, zeitstempelVon,
  exportBackup, exportUebersichtCsv, kannTeilen,
} from '../io/austausch.js';

const ARTEN = { anlagen: 'Anlagen', protokolle: 'Protokolle', vorlagen: 'Vorlagen' };
const STATUS = { neu: 'neu', neuer: 'neuer als vorhanden', aelter: 'älter als vorhanden', gleich: 'unverändert', geloescht: 'hier gelöscht' };

const zeit = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';

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
  if (leer && !analyse.loeschen.length && !Object.keys(analyse.einstellungen || {}).length) { toast('Die Datei enthält keine Daten', 'warning'); return null; }
  // Auf einem frischen Gerät (noch kein Briefkopf) Einstellungen standardmäßig übernehmen
  const e = analyse.einstellungen || {};
  const einstellungenText = [
    e.firma && (e.firma.logo ? 'Briefkopf mit Logo' : 'Briefkopf'),
    e.techniker && 'Standard-Techniker',
    e.unterschriftFelder && 'Unterschriftsfelder',
    e.syncErinnerung?.hinweis && 'Hinweis zur Aktualisierung',
  ].filter(Boolean).join(', ');
  const neuesGeraet = !(await DB.einstellung('firma'))?.name;
  const konflikte = analyse.loeschen.length || Object.keys(ARTEN).some(a => zaehle(a, 'neuer') + zaehle(a, 'aelter') + zaehle(a, 'geloescht') > 0);

  // Auswählbare Einträge (unveränderte werden nur gezählt)
  const gruppen = Object.entries(ARTEN).map(([art, label]) => ({
    art, label,
    eintraege: analyse[art].filter(x => x.status !== 'gleich').map(x => ({
      key: schluessel(art, x.obj.id), status: x.status, text: beschreibe[art](x.obj),
      info: x.status === 'neu' ? `Datei: ${zeit(zeitstempelVon(x.obj))}`
        : `Datei: ${zeit(zeitstempelVon(x.obj))} · ${x.status === 'geloescht' ? 'hier gelöscht' : 'Gerät'}: ${zeit(x.lokal)}`,
    })),
    gleich: zaehle(art, 'gleich'),
  }));
  if (analyse.loeschen.length) {
    gruppen.push({ art: 'loeschen', label: 'Löschungen (auf anderem Gerät gelöscht)', gleich: 0,
      eintraege: analyse.loeschen.map(x => ({
        key: loeschSchluessel(x.art, x.obj.id), status: 'loeschen', text: beschreibe[x.art](x.obj),
        info: `${ARTEN[x.art]} · wird hier gelöscht`,
      })) });
  }
  const vorauswahl = (strategie) => new Set(gruppen.flatMap(g => g.eintraege
    .filter(x => x.status === 'loeschen' ? loeschungVorausgewaehlt(strategie) : vorausgewaehlt(x.status, strategie))
    .map(x => x.key)));
  let auswahl = vorauswahl('neuere');

  const listeHtml = gruppen.filter(g => g.eintraege.length || g.gleich).map(g => `
    <div class="iw-gruppe" data-gruppe="${g.art}">
      <div class="iw-kopf">
        <strong>${esc(g.label)}</strong>
        ${g.eintraege.length ? `<button type="button" class="link" data-alle="${g.art}">alle</button>
          <button type="button" class="link" data-keine="${g.art}">keine</button>` : ''}
        ${g.gleich ? `<span class="hinweis">${g.gleich} unverändert</span>` : ''}
      </div>
      ${g.eintraege.map(x => `
        <label class="iw-zeile">
          <input type="checkbox" data-key="${esc(x.key)}">
          <span class="iw-text">${esc(x.text)}<small>${esc(x.info)}</small></span>
          <span class="tag ${x.status === 'loeschen' || x.status === 'aelter' ? 'tag-fehler' : 'tag-leise'}">${STATUS[x.status] || 'löschen'}</span>
        </label>`).join('')}
    </div>`).join('');

  const { wert, daten } = await dialog({
    titel: 'Import prüfen',
    breit: true,
    inhalt: `
      ${analyse.alt ? `<div class="banner">${icon('info')}<div><strong>Älteres Dateiformat</strong><span>Die Daten werden automatisch in das neue Format umgewandelt (NEA-Vorlage).</span></div></div>` : ''}
      ${konflikte ? `
        <fieldset class="optionen">
          <legend>Vorauswahl</legend>
          <label class="check"><input type="radio" name="strategie" value="neuere" checked><span><strong>Abgleichen</strong> – neuere Stände und Löschungen (empfohlen)</span></label>
          <label class="check"><input type="radio" name="strategie" value="alle"><span><strong>Alles aus der Datei</strong> – auch ältere Stände, holt hier Gelöschtes zurück</span></label>
          <label class="check"><input type="radio" name="strategie" value="nurNeue"><span><strong>Nur Neues</strong> – Vorhandenes nicht anfassen, nichts löschen</span></label>
        </fieldset>` : ''}
      <div class="iw-liste">${listeHtml || '<p class="hinweis">Alle Einträge sind bereits aktuell.</p>'}</div>
      ${einstellungenText ? `<label class="check"><input type="checkbox" name="firma" ${neuesGeraet ? 'checked' : ''}>
        <span>Einstellungen übernehmen: ${esc(einstellungenText)}</span></label>` : ''}`,
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: 'Importieren', wert: 'ok', art: 'primary', icon: 'import' }],
    onOpen: (dlg) => {
      const knopf = dlg.querySelector('[data-dlg-aktion="1"]');
      const zeige = () => {
        dlg.querySelectorAll('[data-key]').forEach(cb => { cb.checked = auswahl.has(cb.dataset.key); });
        knopf.lastChild.textContent = auswahl.size ? `Importieren (${auswahl.size})` : 'Importieren';
      };
      dlg.addEventListener('change', ev => {
        if (ev.target.name === 'strategie') { auswahl = vorauswahl(ev.target.value); zeige(); }
        if (ev.target.dataset.key) {
          if (ev.target.checked) auswahl.add(ev.target.dataset.key); else auswahl.delete(ev.target.dataset.key);
          zeige();
        }
      });
      dlg.addEventListener('click', ev => {
        const b = ev.target.closest('[data-alle], [data-keine]');
        if (!b) return;
        const g = gruppen.find(x => x.art === (b.dataset.alle || b.dataset.keine));
        g.eintraege.forEach(x => (b.dataset.alle ? auswahl.add(x.key) : auswahl.delete(x.key)));
        zeige();
      });
      zeige();
    },
    auslesen: dlg => ({ firma: !!dlg.querySelector('[name="firma"]')?.checked }),
  });
  if (wert !== 'ok') return null;

  const z = await importiere(analyse, auswahl, { einstellungen: daten.firma });
  const text = [...Object.entries(ARTEN).map(([a, l]) => z[a] ? `${z[a]} ${l}` : ''), z.geloescht ? `${z.geloescht} gelöscht` : '']
    .filter(Boolean).join(', ');
  const gesamt = [text, daten.firma && einstellungenText ? 'Einstellungen' : ''].filter(Boolean).join(', ');
  toast(gesamt ? `Importiert: ${gesamt}` : 'Nichts importiert', gesamt ? 'success' : 'info', 4500);
  return z;
}

export async function render(el) {
  setzeKopf({ titel: 'Daten & Einstellungen', eyebrow: 'Import · Export · Briefkopf' });

  const [anlagen, protokolle, vorlagen, firma, techniker, letztesBackup, usFelder, erinnerung] = await Promise.all([
    DB.anlagen.alle(), DB.protokolle.alle(), DB.vorlagen.alle(),
    DB.einstellung('firma', {}), DB.einstellung('techniker', ''), DB.einstellung('letztesBackup'),
    DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD),
    DB.einstellung('syncErinnerung', ERINNERUNG_STANDARD),
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
        <div class="erinnerung-einstellung">
          <label class="check"><input type="checkbox" id="erinnerung-aktiv" ${erinnerung.aktiv ? 'checked' : ''}>
            <span>Einmal täglich beim Start an das Aktualisieren erinnern</span></label>
          <label class="feld"><span class="feld-label">Hinweis in der Erinnerung</span>
            <textarea class="inp" rows="3" id="erinnerung-hinweis" placeholder="z. B. Dateien › iCloud Drive › Wartung › neueste Wartung_Backup-Datei wählen">${esc(erinnerung.hinweis)}</textarea>
            <span class="feld-hinweis">Wird mit der Sicherung auf andere Geräte übertragen.</span></label>
        </div>
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

  const speichereErinnerung = () => DB.setzeEinstellung('syncErinnerung', {
    aktiv: el.querySelector('#erinnerung-aktiv').checked,
    hinweis: el.querySelector('#erinnerung-hinweis').value.trim(),
  });
  el.querySelector('#erinnerung-aktiv').addEventListener('change', speichereErinnerung);
  el.querySelector('#erinnerung-hinweis').addEventListener('change', async () => {
    await speichereErinnerung();
    toast('Hinweis gespeichert', 'success', 1500);
  });

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
