import { DB } from '../core/db.js';
import { esc, jetztIso } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, dialog, eingabe } from '../core/ui.js';
import { setzeKopf, setzeKopfStatus } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { neueVorlage, vorlageKopie } from '../core/model.js';
import { alleVorlagen, holeVorlage } from '../vorlagen/vorlagen.js';
import { exportVorlage } from '../io/austausch.js';
import { pruefplanEditor } from './pruefplan-editor.js';
import { stammdatenGruppenEditor } from './stammdaten-editor.js';

// ── Liste ────────────────────────────────────────────────────

export async function renderListe(el) {
  setzeKopf({
    titel: 'Vorlagen',
    eyebrow: 'Prüfpläne',
    aktionen: [{ id: 'neu', label: 'Neue Vorlage', icon: 'plus', art: 'primary' }],
    onAktion: async () => {
      const name = await eingabe('Neue Vorlage', { label: 'Name', platzhalter: 'z. B. Brandmeldeanlage' });
      if (!name) return;
      const v = neueVorlage(name);
      await DB.vorlagen.speichere(v);
      navigiere(`/vorlage/${v.id}`);
    },
  });

  const [vorlagen, anlagen] = await Promise.all([alleVorlagen(), DB.anlagen.alle()]);
  const nutzung = (id) => anlagen.filter(a => a.vorlageId === id).length;

  const gruppe = (titel, liste) => liste.length ? `
    <h3 class="gruppen-titel">${esc(titel)}</h3>
    <div class="kartenraster">${liste.map(v => `
      <article class="karte vorlage-karte">
        <div class="ak-kopf">
          <span class="tag tag-leise">${esc(v.kategorie || 'Allgemein')}</span>
          <button class="btn-icon ak-menue" data-menue="${esc(v.id)}" aria-label="Weitere Aktionen">${icon('mehr')}</button>
        </div>
        <h3>${esc(v.name)}</h3>
        <p class="ak-meta">${esc(v.beschreibung || '')}</p>
        <p class="ak-meta ak-technik">${v.sektionen.length} Abschnitte · ${v.stammdaten.reduce((n, g) => n + g.felder.length, 0)} Stammdatenfelder · ${nutzung(v.id)} Anlagen</p>
        <div class="ak-aktionen">
          ${v.builtin
            ? `<button class="btn btn-ghost" data-kopie="${esc(v.id)}">${icon('kopie')}Duplizieren & anpassen</button>`
            : `<a class="btn btn-ghost" href="#/vorlage/${esc(v.id)}">${icon('bearbeiten')}Bearbeiten</a>`}
          <a class="btn btn-ghost" href="#/anlage/neu?vorlage=${encodeURIComponent(v.id)}">${icon('plus')}Anlage</a>
        </div>
      </article>`).join('')}
    </div>` : '';

  el.innerHTML = `
    <p class="einleitung">Vorlagen legen fest, welche Stammdaten und Prüfabschnitte eine neue Anlage bekommt. Jede Anlage kann ihren Prüfplan danach individuell anpassen.</p>
    ${gruppe('Eigene Vorlagen', vorlagen.filter(v => !v.builtin))}
    ${gruppe('Mitgeliefert', vorlagen.filter(v => v.builtin))}`;

  const duplizieren = async (v) => {
    const name = await eingabe('Vorlage duplizieren', { label: 'Name der neuen Vorlage', wert: `${v.name} (eigene)` });
    if (!name) return;
    const kopie = vorlageKopie(v, name);
    await DB.vorlagen.speichere(kopie);
    navigiere(`/vorlage/${kopie.id}`);
  };

  el.addEventListener('click', async e => {
    const k = e.target.closest('[data-kopie]');
    if (k) return duplizieren(vorlagen.find(v => v.id === k.dataset.kopie));
    const m = e.target.closest('[data-menue]');
    if (!m) return;
    const v = vorlagen.find(x => x.id === m.dataset.menue);
    menue(m, [
      ...(v.builtin ? [] : [{ label: 'Bearbeiten', icon: 'bearbeiten', aktion: () => navigiere(`/vorlage/${v.id}`) }]),
      { label: 'Duplizieren', icon: 'kopie', aktion: () => duplizieren(v) },
      { label: 'Exportieren', icon: 'export', aktion: async () => toast(`Exportiert: ${await exportVorlage(v, { teilen: true })}`, 'success') },
      ...(v.builtin ? [] : ['-', { label: 'Löschen', icon: 'loeschen', gefahr: true, aktion: async () => {
        if (!await bestaetigen(`Vorlage „${v.name}“ löschen?\nBestehende Anlagen behalten ihren Prüfplan.`, { titel: 'Vorlage löschen', ja: 'Löschen' })) return;
        await DB.vorlagen.loesche(v.id);
        toast('Vorlage gelöscht');
        navigiere('/vorlagen', { ersetzen: true });
      } }]),
    ]);
  });
}

// ── Editor ───────────────────────────────────────────────────

let vorlage = null;
let geaendert = false;

function markiere() {
  if (geaendert) return;
  geaendert = true;
  setzeKopfStatus('<span class="status-punkt status-ungespeichert">Nicht gespeichert</span>');
}

async function speichern() {
  if (!vorlage.name.trim()) { toast('Bitte einen Namen eingeben', 'error'); return false; }
  vorlage.geaendert_am = jetztIso();
  await DB.vorlagen.speichere(vorlage);
  geaendert = false;
  setzeKopfStatus('<span class="status-punkt status-ok">Gespeichert</span>');
  toast('Vorlage gespeichert', 'success');
  return true;
}

export async function renderEditor(el, params, query) {
  geaendert = false;
  vorlage = await holeVorlage(params.id);
  if (!vorlage) throw new Error('Vorlage nicht gefunden');
  if (vorlage.builtin) {
    navigiere('/vorlagen', { ersetzen: true });
    toast('Mitgelieferte Vorlagen bitte duplizieren, um sie anzupassen', 'warning');
    return;
  }

  setzeKopf({
    titel: vorlage.name,
    eyebrow: 'Vorlage bearbeiten',
    zurueckZu: '/vorlagen',
    aktionen: [{ id: 'speichern', label: 'Speichern', icon: 'check', art: 'primary' }],
    onAktion: speichern,
  });

  el.innerHTML = `
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="allgemein" aria-selected="true">Allgemein</button>
      <button role="tab" data-tab="stammdaten" aria-selected="false">Stammdaten-Felder</button>
      <button role="tab" data-tab="plan" aria-selected="false">Prüfplan</button>
    </div>
    <div data-panel="allgemein">
      <section class="karte">
        <div class="feldraster">
          <label class="feld"><span class="feld-label">Name *</span><input class="inp" type="text" data-v="name" value="${esc(vorlage.name)}"></label>
          <label class="feld"><span class="feld-label">Kategorie</span><input class="inp" type="text" data-v="kategorie" value="${esc(vorlage.kategorie)}" placeholder="z. B. Stromerzeugung"></label>
          <label class="feld feld-voll"><span class="feld-label">Beschreibung</span><textarea class="inp" rows="3" data-v="beschreibung">${esc(vorlage.beschreibung)}</textarea></label>
        </div>
      </section>
    </div>
    <div data-panel="stammdaten" hidden>
      <p class="hinweis panel-hinweis">Zusätzlich zu Kommission, Bezeichnung, Kunde, Standort, Hersteller, Typ, Seriennummer und Baujahr. „Intern“-Gruppen erscheinen nicht im Bericht.</p>
      <div id="sd-editor"></div>
    </div>
    <div data-panel="plan" hidden><div id="plan-editor"></div></div>
    <div class="fuss-aktionen"><button class="btn btn-primary btn-gross" id="unten-speichern">${icon('check')}Vorlage speichern</button></div>`;

  el.querySelectorAll('[data-v]').forEach(inp => inp.addEventListener('input', () => {
    vorlage[inp.dataset.v] = inp.value;
    if (inp.dataset.v === 'name') document.querySelector('.kopf-titel h1').textContent = inp.value;
    markiere();
  }));
  stammdatenGruppenEditor(el.querySelector('#sd-editor'), vorlage.stammdaten, markiere);
  pruefplanEditor(el.querySelector('#plan-editor'), vorlage.sektionen, markiere);

  const tab = (t) => {
    el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    el.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t; });
  };
  el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => tab(b.dataset.tab); });
  tab(query.tab || 'allgemein');
  el.querySelector('#unten-speichern').onclick = speichern;
}

export const ungespeichert = () => geaendert;

export async function verlassen() {
  if (!geaendert) return true;
  const wahl = await dialog({
    titel: 'Änderungen speichern?',
    inhalt: '<p class="dlg-text">Die Vorlage hat ungespeicherte Änderungen.</p>',
    aktionen: [
      { label: 'Verwerfen', wert: 'verwerfen', art: 'danger-leise' },
      { label: 'Abbrechen', wert: null },
      { label: 'Speichern', wert: 'speichern', art: 'primary' },
    ],
  });
  if (wahl === 'verwerfen') { geaendert = false; return true; }
  if (wahl === 'speichern') return speichern();
  return false;
}
