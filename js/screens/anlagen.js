import { DB } from '../core/db.js';
import { esc, formatDatum, formatMonat, monateBis, klon, erzeugeId, jetztIso, formatZahl } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, leerZustand, dialog, eingabe } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { anlagenTitel, vorlageKopie } from '../core/model.js';
import { vorlagenZurAuswahl } from '../vorlagen/vorlagen.js';
import { exportAnlage } from '../io/austausch.js';

let suche = '';
let sortierung = 'kommission';

export function faelligkeit(naechste) {
  const m = monateBis(naechste);
  if (m === null) return { art: 'keine', text: 'Kein Termin' };
  if (m < 0) return { art: 'ueber', text: `Überfällig seit ${formatMonat(naechste)}` };
  if (m <= 1) return { art: 'bald', text: `Fällig ${formatMonat(naechste)}` };
  return { art: 'ok', text: `Nächste Prüfung ${formatMonat(naechste)}` };
}

export async function vorlageAuswahl() {
  const vorlagen = await vorlagenZurAuswahl();
  const r = await dialog({
    titel: 'Neue Anlage',
    breit: true,
    inhalt: `<p class="dlg-text">Mit welcher Vorlage soll der Prüfplan starten? Alles lässt sich danach für die Anlage anpassen.</p>
      <div class="vorlagen-wahl">${vorlagen.map(v => `
        <button type="button" class="vw-karte" data-vorlage="${esc(v.id)}">
          <span class="vw-kat">${esc(v.kategorie || 'Eigene Vorlage')}</span>
          <strong>${esc(v.name)}</strong>
          <span class="vw-text">${esc(v.beschreibung || '')}</span>
          <span class="vw-meta">${v.sektionen.length} Abschnitte${v.herkunft === 'mitgeliefert' ? ' · mitgeliefert' : ''}</span>
        </button>`).join('')}
      </div>`,
    auslesen: dlg => dlg.dataset.gewaehlt,
    onOpen: (dlg, schliessen) => {
      dlg.querySelectorAll('[data-vorlage]').forEach(b => b.addEventListener('click', () => {
        dlg.dataset.gewaehlt = b.dataset.vorlage;
        schliessen('ok');
      }));
    },
  });
  if (r.wert === 'ok') navigiere(`/anlage/neu?vorlage=${encodeURIComponent(r.daten)}`);
}

export async function render(el) {
  setzeKopf({
    titel: 'Anlagen',
    eyebrow: 'Übersicht',
    aktionen: [{ id: 'neu', label: 'Neue Anlage', icon: 'plus', art: 'primary' }],
    onAktion: vorlageAuswahl,
  });

  const [anlagen, protokolle] = await Promise.all([DB.anlagen.alle(), DB.protokolle.alle()]);
  const proAnlage = new Map();
  for (const p of protokolle) {
    const info = proAnlage.get(p.anlageId) || { letzte: null, entwurf: null, anzahl: 0 };
    info.anzahl++;
    if (p.status === 'entwurf') {
      if (!info.entwurf || p.geaendert_am > info.entwurf.geaendert_am) info.entwurf = p;
    } else if (!info.letzte || p.datum > info.letzte.datum) {
      info.letzte = p;
    }
    proAnlage.set(p.anlageId, info);
  }

  if (!anlagen.length) {
    el.innerHTML = leerZustand('anlage', 'Noch keine Anlagen',
      'Lege eine Anlage an – mit einer Vorlage für Netzersatzanlagen, USV oder einem eigenen Prüfplan. Oder übernimm vorhandene Daten über <a href="#/daten">Daten → Import</a>.',
      `<button class="btn btn-primary" id="leer-neu">${icon('plus')}Neue Anlage</button>`);
    el.querySelector('#leer-neu').onclick = vorlageAuswahl;
    return;
  }

  const ueberfaellig = anlagen.filter(a => ['ueber', 'bald'].includes(faelligkeit(proAnlage.get(a.id)?.letzte?.naechste_pruefung).art)).length;
  const entwuerfe = protokolle.filter(p => p.status === 'entwurf').length;

  el.innerHTML = `
    <div class="kennzahlen">
      <div class="kz"><span class="kz-wert">${anlagen.length}</span><span class="kz-label">Anlagen</span></div>
      <div class="kz ${ueberfaellig ? 'kz-warn' : ''}"><span class="kz-wert">${ueberfaellig}</span><span class="kz-label">fällig / überfällig</span></div>
      <a class="kz" href="#/protokolle?status=entwurf"><span class="kz-wert">${entwuerfe}</span><span class="kz-label">offene Entwürfe</span></a>
    </div>
    <div class="werkzeugleiste">
      <label class="suchfeld">${icon('suche')}<input type="search" id="suche" placeholder="Kommission, Kunde, Standort …" value="${esc(suche)}"></label>
      <select class="inp inp-klein" id="sortierung" aria-label="Sortierung">
        <option value="kommission">Nach Kommission</option>
        <option value="faellig">Nach Fälligkeit</option>
        <option value="kunde">Nach Kunde</option>
      </select>
    </div>
    <div class="kartenraster" id="liste"></div>`;

  const sortSel = el.querySelector('#sortierung');
  sortSel.value = sortierung;

  const zeichne = () => {
    const q = suche.toLowerCase();
    const liste = anlagen.filter(a => !q || [
      ...Object.values(a.stammdaten), a.vorlageName,
    ].some(v => String(v || '').toLowerCase().includes(q)));

    const termin = (a) => proAnlage.get(a.id)?.letzte?.naechste_pruefung || '9999';
    liste.sort((a, b) => {
      if (sortierung === 'faellig') return termin(a).localeCompare(termin(b));
      if (sortierung === 'kunde') return (a.stammdaten.kunde || '').localeCompare(b.stammdaten.kunde || '', 'de');
      return (a.stammdaten.kommission || '').localeCompare(b.stammdaten.kommission || '', 'de', { numeric: true });
    });

    el.querySelector('#liste').innerHTML = liste.map(a => {
      const s = a.stammdaten;
      const info = proAnlage.get(a.id) || {};
      const f = faelligkeit(info.letzte?.naechste_pruefung);
      const leistung = a.zusatz?.Leistung_kVA ? `${formatZahl(a.zusatz.Leistung_kVA)} kVA` : '';
      const technik = [s.hersteller, s.typ, leistung].filter(Boolean).join(' · ');
      return `
        <article class="karte anlage-karte">
          <div class="ak-kopf">
            <span class="kommission">${esc(s.kommission || '—')}</span>
            ${a.vorlageName ? `<span class="tag tag-leise">${esc(a.vorlageName)}</span>` : ''}
            <button class="btn-icon ak-menue" data-menue="${esc(a.id)}" aria-label="Weitere Aktionen">${icon('mehr')}</button>
          </div>
          <h3>${esc(s.bezeichnung || 'Ohne Bezeichnung')}</h3>
          ${s.kunde || s.standort ? `<p class="ak-meta">${esc([s.kunde, s.standort].filter(Boolean).join(' · '))}</p>` : ''}
          ${technik ? `<p class="ak-meta ak-technik">${esc(technik)}</p>` : ''}
          <div class="ak-status">
            <span class="faellig faellig-${f.art}">${esc(f.text)}</span>
            ${info.letzte ? `<span class="ak-letzte">Zuletzt ${formatDatum(info.letzte.datum)}</span>` : ''}
          </div>
          <div class="ak-aktionen">
            ${info.entwurf
              ? `<a class="btn btn-primary" href="#/protokoll/${esc(info.entwurf.id)}">${icon('protokoll')}Entwurf fortsetzen</a>`
              : `<button class="btn btn-primary" data-neu="${esc(a.id)}">${icon('plus')}Protokoll</button>`}
            <a class="btn btn-ghost" href="#/anlage/${esc(a.id)}">${icon('bearbeiten')}Bearbeiten</a>
          </div>
        </article>`;
    }).join('') || '<p class="hinweis">Keine Treffer.</p>';
  };

  el.addEventListener('click', async e => {
    const neu = e.target.closest('[data-neu]');
    if (neu) {
      navigiere(`/protokoll/neu?anlage=${encodeURIComponent(neu.dataset.neu)}`);
      return;
    }
    const m = e.target.closest('[data-menue]');
    if (!m) return;
    const a = anlagen.find(x => x.id === m.dataset.menue);
    const info = proAnlage.get(a.id) || {};
    menue(m, [
      { label: 'Neues Protokoll', icon: 'plus', aktion: () => navigiere(`/protokoll/neu?anlage=${encodeURIComponent(a.id)}`) },
      { label: `Protokolle (${info.anzahl || 0})`, icon: 'protokoll', aktion: () => navigiere(`/protokolle?anlage=${encodeURIComponent(a.id)}`) },
      '-',
      { label: 'Duplizieren', icon: 'kopie', aktion: async () => {
        const kopie = { ...klon(a), id: erzeugeId('a_'), erstellt_am: jetztIso(), geaendert_am: jetztIso() };
        kopie.stammdaten.kommission = `${a.stammdaten.kommission || ''} (Kopie)`.trim();
        await DB.anlagen.speichere(kopie);
        navigiere(`/anlage/${kopie.id}`);
      } },
      { label: 'Als Vorlage speichern', icon: 'vorlage', aktion: async () => {
        const name = await eingabe('Als Vorlage speichern', { label: 'Name der Vorlage', wert: a.vorlageName ? `${a.vorlageName} (angepasst)` : anlagenTitel(a.stammdaten) });
        if (!name) return;
        await DB.vorlagen.speichere(vorlageKopie(a, name));
        toast(`Vorlage „${name}“ gespeichert`, 'success');
      } },
      { label: 'Exportieren', icon: 'export', aktion: async () => {
        const mit = info.anzahl ? await bestaetigen(`Protokolle dieser Anlage (${info.anzahl}) mit exportieren?`, { titel: 'Anlage exportieren', ja: 'Mit Protokollen', art: 'primary' }) : false;
        const name = await exportAnlage(a.id, { mitProtokollen: mit, teilen: true });
        toast(`Exportiert: ${name}`, 'success');
      } },
      '-',
      { label: 'Löschen', icon: 'loeschen', gefahr: true, aktion: async () => {
        if (!await bestaetigen(`„${anlagenTitel(a.stammdaten)}“ löschen?\nVorhandene Protokolle bleiben erhalten.`, { titel: 'Anlage löschen', ja: 'Löschen' })) return;
        await DB.anlagen.loesche(a.id);
        anlagen.splice(anlagen.indexOf(a), 1);
        toast('Anlage gelöscht');
        zeichne();
      } },
    ]);
  });

  el.querySelector('#suche').addEventListener('input', e => { suche = e.target.value; zeichne(); });
  sortSel.addEventListener('change', e => { sortierung = e.target.value; zeichne(); });
  zeichne();
}
