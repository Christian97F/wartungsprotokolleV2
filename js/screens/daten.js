import { DB } from '../core/db.js';
import { esc, formatDatum } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, dialog } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { UNTERSCHRIFT_STANDARD } from '../core/model.js';
import { bildVerkleinern } from '../core/bild.js';
import { thema, setzeThema } from '../core/thema.js';
import { unterschriftFeld } from './unterschrift.js';
import { ERINNERUNG_STANDARD, backupErinnerung, sicherungErstellen } from './erinnerung.js';
import {
  leseDatei, normalisiere, analysiere, importiere, beschreibe,
  schluessel, loeschSchluessel, vorausgewaehlt, loeschungVorausgewaehlt, zeitstempelVon,
  exportUebersichtCsv, kannTeilen,
} from '../io/austausch.js';

const ARTEN = { anlagen: 'Anlagen', protokolle: 'Protokolle', vorlagen: 'Vorlagen' };
const STATUS = { neu: 'neu', neuer: 'neuer als vorhanden', aelter: 'älter als vorhanden', gleich: 'unverändert', geloescht: 'hier gelöscht' };

// Auswahl, die neuere Daten auf dem Gerät überschreibt oder löscht
const RISKANT = new Set(['aelter', 'loeschen']);

const zeit = (iso) => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';

// Zweite Sicherheitsstufe: jede riskante Auswahl einzeln aufführen und ausdrücklich bestätigen lassen
async function ueberschreibenBestaetigen(riskant, einstellungen) {
  const zeile = x => `<li><strong>${esc(x.text)}</strong><small>${esc(x.gruppe)} · ${esc(x.info)}</small></li>`;
  const aelter = riskant.filter(x => x.status === 'aelter');
  const weg = riskant.filter(x => x.status === 'loeschen');
  const wahl = await dialog({
    titel: 'Wirklich überschreiben?',
    inhalt: `
      ${aelter.length ? `<p class="dlg-text">Diese Einträge sind auf diesem Gerät <strong>neuer</strong> als in der Datei. Die neueren Änderungen gehen verloren:</p>
        <ul class="ue-liste">${aelter.map(zeile).join('')}</ul>` : ''}
      ${weg.length ? `<p class="dlg-text">Diese Einträge werden auf diesem Gerät <strong>gelöscht</strong>:</p>
        <ul class="ue-liste">${weg.map(zeile).join('')}</ul>` : ''}
      ${einstellungen ? `<p class="dlg-text">Die Einstellungen dieses Geräts werden ersetzt: ${esc(einstellungen)}.</p>` : ''}
      <label class="check ue-bestaetigung"><input type="checkbox" name="verstanden">
        <span>Ich habe geprüft, dass die Daten aus der Datei die richtigen sind.</span></label>`,
    aktionen: [
      { label: 'Zurück zur Auswahl', wert: null },
      { label: 'Überschreiben', wert: 'ok', art: 'danger' },
    ],
    onOpen: (dlg) => {
      const knopf = dlg.querySelector('[data-dlg-aktion="1"]');
      knopf.disabled = true;
      dlg.querySelector('[name="verstanden"]').addEventListener('change', e => { knopf.disabled = !e.target.checked; });
    },
  });
  return wahl === 'ok';
}

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
  const alleEintraege = gruppen.flatMap(g => g.eintraege.map(x => ({ ...x, gruppe: g.label })));
  const riskanteAuswahl = () => alleEintraege.filter(x => RISKANT.has(x.status) && auswahl.has(x.key));
  const warnText = (liste) => {
    const alt = liste.filter(x => x.status === 'aelter').length;
    const weg = liste.length - alt;
    return [alt && `${alt} ältere${alt === 1 ? 'r Stand überschreibt' : ' Stände überschreiben'} neuere Daten auf diesem Gerät`,
      weg && `${weg} Eintr${weg === 1 ? 'ag wird' : 'äge werden'} hier gelöscht`].filter(Boolean).join(' · ');
  };

  const listeHtml = gruppen.filter(g => g.eintraege.length || g.gleich).map(g => `
    <div class="iw-gruppe" data-gruppe="${g.art}">
      <div class="iw-kopf">
        <strong>${esc(g.label)}</strong>
        ${g.eintraege.length ? `<button type="button" class="link" data-alle="${g.art}">alle</button>
          <button type="button" class="link" data-keine="${g.art}">keine</button>` : ''}
        ${g.gleich ? `<span class="hinweis">${g.gleich} unverändert</span>` : ''}
      </div>
      ${g.eintraege.map(x => `
        <label class="iw-zeile ${RISKANT.has(x.status) ? 'iw-riskant' : ''}">
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
          <label class="check"><input type="radio" name="strategie" value="alle"><span><strong>Alles aus der Datei</strong> – auch ältere Stände (überschreibt Neueres!), holt hier Gelöschtes zurück</span></label>
          <label class="check"><input type="radio" name="strategie" value="nurNeue"><span><strong>Nur Neues</strong> – Vorhandenes nicht anfassen, nichts löschen</span></label>
        </fieldset>` : ''}
      <div class="banner banner-fehler" id="iw-warnung" hidden>${icon('warnung')}<div><strong>Achtung – Daten werden überschrieben</strong><span></span></div></div>
      <div class="iw-liste">${listeHtml || '<p class="hinweis">Alle Einträge sind bereits aktuell.</p>'}</div>
      ${einstellungenText ? `<label class="check"><input type="checkbox" name="firma" ${neuesGeraet ? 'checked' : ''}>
        <span>Einstellungen übernehmen: ${esc(einstellungenText)}</span></label>` : ''}`,
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: 'Importieren', wert: 'ok', art: 'primary', icon: 'import' }],
    onOpen: (dlg) => {
      const knopf = dlg.querySelector('[data-dlg-aktion="1"]');
      const zeige = () => {
        dlg.querySelectorAll('[data-key]').forEach(cb => { cb.checked = auswahl.has(cb.dataset.key); });
        knopf.lastChild.textContent = auswahl.size ? `Importieren (${auswahl.size})` : 'Importieren';
        const riskant = riskanteAuswahl();
        const warnung = dlg.querySelector('#iw-warnung');
        warnung.hidden = !riskant.length;
        warnung.querySelector('span').textContent = warnText(riskant);
        knopf.classList.toggle('btn-primary', !riskant.length);
        knopf.classList.toggle('btn-danger', !!riskant.length);
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
    vorSchliessen: async (_wert, dlg) => {
      const riskant = riskanteAuswahl();
      const einstellungenUeberschreiben = !neuesGeraet && dlg.querySelector('[name="firma"]')?.checked;
      if (!riskant.length && !einstellungenUeberschreiben) return true;
      return ueberschreibenBestaetigen(riskant, einstellungenUeberschreiben ? einstellungenText : '');
    },
  });
  if (wert !== 'ok') return null;

  const z = await importiere(analyse, auswahl, { einstellungen: daten.firma });
  const text = [...Object.entries(ARTEN).map(([a, l]) => z[a] ? `${z[a]} ${l}` : ''), z.geloescht ? `${z.geloescht} gelöscht` : '']
    .filter(Boolean).join(', ');
  const gesamt = [text, daten.firma && einstellungenText ? 'Einstellungen' : ''].filter(Boolean).join(', ');
  toast(gesamt ? `Importiert: ${gesamt}` : 'Nichts importiert', gesamt ? 'success' : 'info', 4500);
  await backupErinnerung();
  return z;
}

export async function render(el) {
  setzeKopf({ titel: 'Daten & Einstellungen', eyebrow: 'Import · Export · Briefkopf' });

  const [anlagen, protokolle, vorlagen, firma, techniker, letztesBackup, usFelder, erinnerung, ungesichert, meineUnterschrift] = await Promise.all([
    DB.anlagen.alle(), DB.protokolle.alle(), DB.vorlagen.alle(),
    DB.einstellung('firma', {}), DB.einstellung('techniker', ''), DB.einstellung('letztesBackup'),
    DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD),
    DB.einstellung('syncErinnerung', ERINNERUNG_STANDARD),
    DB.einstellung('ungesichert'),
    DB.einstellung('technikerUnterschrift'),
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
            <span>Beim Start an den Import erinnern, bis heute importiert wurde</span></label>
          <label class="check"><input type="checkbox" id="erinnerung-backup" ${erinnerung.backup !== false ? 'checked' : ''}>
            <span>An das Hochladen einer Sicherung erinnern, solange Änderungen ungesichert sind (erst nach dem Import)</span></label>
          <label class="feld"><span class="feld-label">Hinweis in der Erinnerung</span>
            <textarea class="inp" rows="3" id="erinnerung-hinweis" placeholder="z. B. Dateien › iCloud Drive › Wartung › neueste Wartung_Backup-Datei wählen">${esc(erinnerung.hinweis)}</textarea>
            <span class="feld-hinweis">Wird mit der Sicherung auf andere Geräte übertragen.</span></label>
        </div>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('export')} Export</h2>
        <div class="backup-info ${ungesichert || tageSeitBackup === null || tageSeitBackup > 30 ? 'backup-alt' : ''}">
          ${ungesichert ? `<strong>Ungesicherte Änderungen seit ${formatDatum(ungesichert)}.</strong> ` : ''}
          ${letztesBackup ? `Letzte Sicherung: <strong>${formatDatum(letztesBackup)}</strong>${tageSeitBackup > 30 ? ' – eine neue Sicherung wird empfohlen.' : ''}` : 'Noch keine Sicherung erstellt. Die Daten liegen nur in diesem Browser.'}
        </div>
        <p class="hinweis">${anlagen.length} Anlagen · ${protokolle.length} Protokolle · ${vorlagen.length} eigene Vorlagen</p>
        <div class="knopfreihe">
          <button class="btn btn-primary" data-x="backup">${icon('export')}Komplettsicherung</button>
          ${teilen ? `<button class="btn btn-ghost" data-x="backup-teilen">${icon('teilen')}Sicherung teilen</button>` : ''}
          <button class="btn btn-ghost" data-x="csv">${icon('liste')}Übersicht als CSV</button>
          <button class="btn btn-ghost" data-x="alt">${icon('export')}Anlagen im alten Format</button><!-- ALTFORMAT -->
        </div>
        <p class="hinweis">Einzelne Anlagen, Protokolle und Vorlagen lassen sich direkt in den jeweiligen Listen über das Menü ${icon('mehr')} exportieren.</p>
      </section>

      <section class="karte">
        <h2 class="karte-titel">${icon('pdf')} Briefkopf für Berichte</h2>
        <div class="feldraster">
          <label class="feld"><span class="feld-label">Firmenname</span><input class="inp" type="text" data-f="name" value="${esc(f.name)}"></label>
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
        <h2 class="karte-titel">${icon('person')} Techniker <span class="tag tag-leise">nur dieses Gerät</span></h2>
        <label class="feld"><span class="feld-label">Standard-Techniker</span><input class="inp" type="text" id="techniker" value="${esc(techniker)}" placeholder="wird in neue Protokolle eingetragen"></label>
        <div class="feld">
          <span class="feld-label">Gespeicherte Unterschrift</span>
          <div id="meine-unterschrift"></div>
          <span class="feld-hinweis">Lässt sich im Protokoll per Knopf einsetzen. Name und Unterschrift werden nicht in Sicherungen übernommen.</span>
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
      else if (x.dataset.x === 'alt') toast(`Exportiert: ${await (await import('../io/altformat.js')).exportAltAnlagen({ teilen: kannTeilen() })}`, 'success'); // ALTFORMAT
      else await sicherungErstellen({ teilen: x.dataset.x === 'backup-teilen' });
    } catch (err) {
      toast(`Export fehlgeschlagen: ${err.message}`, 'error');
    }
  });

  const speichereFirma = async () => { await DB.aendereEinstellung('firma', f); };
  el.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => {
    f[inp.dataset.f] = inp.value.trim();
    speichereFirma();
    toast('Briefkopf gespeichert', 'success', 1500);
  }));
  el.querySelectorAll('[data-us]').forEach(cb => cb.addEventListener('change', () => {
    usFelder[cb.dataset.us] = cb.checked;
    DB.aendereEinstellung('unterschriftFelder', { ...usFelder });
  }));
  el.querySelector('#techniker').addEventListener('change', async e => {
    const name = e.target.value.trim();
    await DB.setzeEinstellung('techniker', name);
    const us = await DB.einstellung('technikerUnterschrift');
    if (us) await DB.setzeEinstellung('technikerUnterschrift', { ...us, name });
  });
  unterschriftFeld(el.querySelector('#meine-unterschrift'), meineUnterschrift?.bild, async (bild) => {
    await DB.setzeEinstellung('technikerUnterschrift', bild ? { bild, name: el.querySelector('#techniker').value.trim() } : null);
    toast(bild ? 'Unterschrift gespeichert' : 'Unterschrift entfernt', 'success', 1500);
  });
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

  const speichereErinnerung = () => DB.aendereEinstellung('syncErinnerung', {
    aktiv: el.querySelector('#erinnerung-aktiv').checked,
    backup: el.querySelector('#erinnerung-backup').checked,
    hinweis: el.querySelector('#erinnerung-hinweis').value.trim(),
  });
  el.querySelector('#erinnerung-aktiv').addEventListener('change', speichereErinnerung);
  el.querySelector('#erinnerung-backup').addEventListener('change', speichereErinnerung);
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
