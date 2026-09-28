import { DB } from '../core/db.js';
import { esc, jetztIso } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, dialog, eingabe } from '../core/ui.js';
import { setzeKopf, setzeKopfStatus } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { KERN_STAMMDATEN, neueAnlage, anlagenTitel, vorlageKopie } from '../core/model.js';
import { holeVorlage } from '../vorlagen/vorlagen.js';
import { exportAnlage } from '../io/austausch.js';
import { pruefplanEditor } from './pruefplan-editor.js';
import { stammdatenFeld, bindeFormular, stammdatenGruppenEditor } from './stammdaten-editor.js';

let anlage = null;
let istNeu = false;
let geaendert = false;
let tab = 'stammdaten';

function markiere() {
  if (geaendert) return;
  geaendert = true;
  setzeKopfStatus('<span class="status-punkt status-ungespeichert">Nicht gespeichert</span>');
}

async function speichern() {
  if (!anlage.stammdaten.kommission.trim()) {
    toast('Bitte eine Kommission / Anlagen-Nr. eingeben', 'error');
    wechsleTab('stammdaten');
    document.querySelector('[data-a="stammdaten.kommission"]')?.focus();
    return false;
  }
  anlage.geaendert_am = jetztIso();
  await DB.anlagen.speichere(anlage);
  geaendert = false;
  setzeKopfStatus('<span class="status-punkt status-ok">Gespeichert</span>');
  toast('Anlage gespeichert', 'success');
  if (istNeu) {
    istNeu = false;
    navigiere(`/anlage/${anlage.id}`, { ersetzen: true });
  }
  return true;
}

function wechsleTab(neu) {
  tab = neu;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === neu));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== neu; });
}

function stammdatenHtml() {
  const s = anlage.stammdaten;
  return `
    <section class="karte">
      <h2 class="karte-titel">Allgemein</h2>
      <div class="feldraster">
        ${KERN_STAMMDATEN.map(f => `
          <label class="feld"><span class="feld-label">${esc(f.label)}${f.pflicht ? ' *' : ''}</span>
            <input class="inp ${f.id === 'kommission' ? 'inp-mono' : ''}" type="text" data-a="stammdaten.${f.id}" value="${esc(s[f.id])}" placeholder="${esc(f.platzhalter || '')}"></label>`).join('')}
      </div>
    </section>
    ${anlage.zusatzFelder.filter(g => g.felder.length).map(g => `
      <section class="karte">
        <h2 class="karte-titel">${esc(g.titel)}${g.intern ? ' <span class="tag tag-leise">intern</span>' : ''}</h2>
        <div class="feldraster">${g.felder.map(f => stammdatenFeld(f, anlage.zusatz[f.id], `zusatz.${f.id}`)).join('')}</div>
      </section>`).join('')}
    <section class="karte">
      <h2 class="karte-titel">Vertrag & Notizen</h2>
      <div class="feldraster">
        <label class="check feld-check"><input type="checkbox" data-a="vertrag.aktiv" ${anlage.vertrag?.aktiv ? 'checked' : ''}><span>Wartungsvertrag vorhanden</span></label>
        <label class="feld"><span class="feld-label">Vertragsnummer</span>
          <input class="inp" type="text" data-a="vertrag.nummer" value="${esc(anlage.vertrag?.nummer)}"></label>
        <label class="feld feld-voll"><span class="feld-label">Notizen (intern)</span>
          <textarea class="inp" rows="3" data-a="notizen">${esc(anlage.notizen)}</textarea></label>
      </div>
    </section>
    <details class="karte karte-aufklapp">
      <summary><span>${icon('einstellungen')} Stammdaten-Felder anpassen</span></summary>
      <p class="hinweis">Zusätzliche Felder dieser Anlage. Änderungen gelten nur für diese Anlage – für alle künftigen Anlagen in der Vorlage ändern.</p>
      <div id="sd-editor"></div>
    </details>`;
}

export async function render(el, params, query) {
  geaendert = false;
  tab = 'stammdaten';
  if (params.id === 'neu') {
    const vorlage = await holeVorlage(query.vorlage || 'leer');
    if (!vorlage) throw new Error('Vorlage nicht gefunden');
    anlage = neueAnlage(vorlage);
    istNeu = true;
  } else {
    anlage = await DB.anlagen.hole(params.id);
    if (!anlage) throw new Error('Anlage nicht gefunden');
    istNeu = false;
  }

  setzeKopf({
    titel: istNeu ? 'Neue Anlage' : anlagenTitel(anlage.stammdaten),
    eyebrow: `Anlage · ${anlage.vorlageName || 'ohne Vorlage'}`,
    zurueckZu: '/anlagen',
    status: istNeu ? '<span class="status-punkt status-ungespeichert">Neu</span>' : '',
    aktionen: [
      ...(istNeu ? [] : [{ id: 'mehr', label: 'Weitere Aktionen', icon: 'mehr', nurIcon: true }]),
      { id: 'speichern', label: 'Speichern', icon: 'check', art: 'primary' },
    ],
    onAktion: async (id, btn) => {
      if (id === 'speichern') return speichern();
      menue(btn, [
        { label: 'Neues Protokoll', icon: 'plus', aktion: async () => {
          if (geaendert && !await speichern()) return;
          navigiere(`/protokoll/neu?anlage=${encodeURIComponent(anlage.id)}`);
        } },
        { label: 'Als Vorlage speichern', icon: 'vorlage', aktion: async () => {
          const name = await eingabe('Als Vorlage speichern', { label: 'Name der Vorlage', wert: anlagenTitel(anlage.stammdaten) });
          if (!name) return;
          await DB.vorlagen.speichere(vorlageKopie(anlage, name));
          toast(`Vorlage „${name}“ gespeichert`, 'success');
        } },
        { label: 'Exportieren', icon: 'export', aktion: async () => {
          if (geaendert && !await speichern()) return;
          toast(`Exportiert: ${await exportAnlage(anlage.id, { teilen: true })}`, 'success');
        } },
        '-',
        { label: 'Löschen', icon: 'loeschen', gefahr: true, aktion: async () => {
          if (!await bestaetigen(`„${anlagenTitel(anlage.stammdaten)}“ löschen?\nVorhandene Protokolle bleiben erhalten.`, { titel: 'Anlage löschen', ja: 'Löschen' })) return;
          await DB.anlagen.loesche(anlage.id);
          geaendert = false;
          toast('Anlage gelöscht');
          navigiere('/anlagen', { ersetzen: true });
        } },
      ]);
    },
  });

  el.innerHTML = `
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="stammdaten" aria-selected="true">Stammdaten</button>
      <button role="tab" data-tab="plan" aria-selected="false">Prüfplan <span class="tab-zahl">${anlage.pruefplan.length}</span></button>
    </div>
    <div data-panel="stammdaten" id="panel-sd"></div>
    <div data-panel="plan" hidden>
      <p class="hinweis panel-hinweis">Aktivierte Abschnitte und Prüfpunkte erscheinen im Protokoll. Neue Protokolle übernehmen den Prüfplan; offene Entwürfe werden beim Öffnen aktualisiert.</p>
      <div id="panel-plan"></div>
    </div>
    <div class="fuss-aktionen">
      <button class="btn btn-primary btn-gross" id="unten-speichern">${icon('check')}Anlage speichern</button>
    </div>`;

  const sdPanel = el.querySelector('#panel-sd');
  const zeichneStammdaten = () => {
    sdPanel.innerHTML = stammdatenHtml();
    stammdatenGruppenEditor(sdPanel.querySelector('#sd-editor'), anlage.zusatzFelder, () => {
      markiere();
    });
    sdPanel.querySelector('.karte-aufklapp').addEventListener('toggle', e => {
      // Nach dem Bearbeiten der Felddefinitionen das Formular aktualisieren
      if (!e.target.open) zeichneStammdaten();
    });
  };
  zeichneStammdaten();
  bindeFormular(sdPanel, anlage, (pfad) => {
    markiere();
    if (pfad === 'stammdaten.kommission' || pfad === 'stammdaten.bezeichnung') {
      document.querySelector('.kopf-titel h1').textContent = anlagenTitel(anlage.stammdaten);
    }
  });
  pruefplanEditor(el.querySelector('#panel-plan'), anlage.pruefplan, () => {
    markiere();
    el.querySelector('.tab-zahl').textContent = anlage.pruefplan.length;
  });

  el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => wechsleTab(b.dataset.tab); });
  el.querySelector('#unten-speichern').onclick = speichern;
  wechsleTab(query.tab || 'stammdaten');

  const tastatur = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); speichern(); }
  };
  document.addEventListener('keydown', tastatur);
  return () => document.removeEventListener('keydown', tastatur);
}

export const ungespeichert = () => geaendert || istNeu;

export async function verlassen() {
  if (!geaendert && !istNeu) return true;
  const wahl = await dialog({
    titel: 'Änderungen speichern?',
    inhalt: '<p class="dlg-text">Die Anlage hat ungespeicherte Änderungen.</p>',
    aktionen: [
      { label: 'Verwerfen', wert: 'verwerfen', art: 'danger-leise' },
      { label: 'Abbrechen', wert: null },
      { label: 'Speichern', wert: 'speichern', art: 'primary' },
    ],
  });
  if (wahl === 'verwerfen') { geaendert = false; istNeu = false; return true; }
  if (wahl === 'speichern') {
    const neu = istNeu;
    istNeu = false;
    const ok = await speichern();
    if (!ok) istNeu = neu;
    return ok;
  }
  return false;
}

