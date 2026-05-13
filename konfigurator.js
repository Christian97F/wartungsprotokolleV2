// ============================================================
// konfigurator.js – Aggregat-Konfigurator
//
// Hier wird das Formular zum Anlegen und Bearbeiten einer
// Aggregat-Konfiguration verwaltet.
//
// Die Konfiguration ist in 4 Tabs aufgeteilt:
//   1. Stammdaten       – Allgemeine Infos zum Aggregat
//   2. Technische Daten – Generator, Motor, Batterien, NSA
//   3. Wartungsintervalle – Intervalle in Monaten
//   4. Protokoll-Setup  – Was steht im Wartungsprotokoll?
// ============================================================

import { DB, neuesAggregat, erzeugId } from './db.js';
import { exportAggregat } from './io.js';
import { toast, confirm2, navigiereZu } from './app.js';

// Das aktuell bearbeitete Aggregat-Objekt
let aktuellesAggregat = null;

// ── Konfigurator öffnen ────────────────────────────────────────
// aggregatId = ID des zu bearbeitenden Aggregats, oder null für Neu
export async function zeigeKonfigurator(aggregatId = null) {
  if (aggregatId) {
    aktuellesAggregat = await DB.getAggregat(aggregatId);
    if (!aktuellesAggregat) {
      toast('Aggregat nicht gefunden', 'error');
      return;
    }
    // Sicherstellen dass alle Felder vorhanden sind (bei alten Daten)
    aktuellesAggregat = fuelleFehlendeFelderAuf(aktuellesAggregat);
  } else {
    aktuellesAggregat = neuesAggregat();
  }

  // Header-Titel setzen
  const title = aktuellesAggregat.stammdaten.Kommission
    ? `${aktuellesAggregat.stammdaten.Kommission}`
    : 'Neues Aggregat';
  const titleEl = document.getElementById('screen-title-text');
  if (titleEl) titleEl.textContent = title;

  // Formular befüllen
  renderStammdaten();
  renderTechnischeDaten();
  renderWartungsintervalle();
  renderProtokollSetup();

  // Ersten Tab aktivieren
  wechsleTab('tab-stammdaten');
}

// ── Sicherstellen, dass alle Felder vorhanden sind ────────────
// Nötig wenn eine alte JSON-Datei importiert wurde, der Felder fehlen
function fuelleFehlendeFelderAuf(aggregat) {
  const vorlage = neuesAggregat();

  // Tiefes Mergen: Vorlage-Werte nur verwenden wenn Feld fehlt
  function deepMerge(ziel, quelle) {
    for (const key of Object.keys(quelle)) {
      if (!(key in ziel)) {
        ziel[key] = quelle[key];
      } else if (typeof quelle[key] === 'object' && quelle[key] !== null && !Array.isArray(quelle[key])) {
        if (typeof ziel[key] !== 'object' || ziel[key] === null) ziel[key] = {};
        deepMerge(ziel[key], quelle[key]);
      }
    }
    return ziel;
  }

  return deepMerge(aggregat, vorlage);
}

// ── Tab wechseln ───────────────────────────────────────────────
function wechsleTab(tabId) {
  document.querySelectorAll('#screen-konfigurator .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('#screen-konfigurator .tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

// ── Hilfsfunktion: Formularfeld erzeugen ──────────────────────
// Gibt HTML-String zurück für ein einzelnes Eingabefeld
function feld(label, name, typ, wert, optionen = {}) {
  const id    = `kfg-${name.replace(/\./g, '-')}`;
  const hint  = optionen.hint  ? `<div class="field-hint">${optionen.hint}</div>` : '';
  const req   = optionen.required ? 'required' : '';
  const phld  = optionen.placeholder ? `placeholder="${optionen.placeholder}"` : '';
  const attrs = optionen.attrs || '';

  let input = '';

  if (typ === 'text' || typ === 'number' || typ === 'date') {
    const val = wert !== null && wert !== undefined ? `value="${wert}"` : '';
    const einheit = optionen.einheit
      ? `<div class="input-with-unit">
           <input type="${typ}" id="${id}" name="${name}" ${val} ${req} ${phld} ${attrs}>
           <span class="unit-label">${optionen.einheit}</span>
         </div>`
      : `<input type="${typ}" id="${id}" name="${name}" ${val} ${req} ${phld} ${attrs}>`;
    input = einheit;

  } else if (typ === 'textarea') {
    const val = wert || '';
    input = `<textarea id="${id}" name="${name}" ${req} ${phld} ${attrs}>${val}</textarea>`;

  } else if (typ === 'select') {
    const optHtml = (optionen.auswahlwerte || [])
      .map(o => `<option value="${o.wert}" ${wert === o.wert ? 'selected' : ''}>${o.label}</option>`)
      .join('');
    input = `<select id="${id}" name="${name}" ${req} ${attrs}>${optHtml}</select>`;

  } else if (typ === 'checkbox') {
    const checked = wert ? 'checked' : '';
    return `
      <div class="form-field">
        <div class="form-check">
          <input type="checkbox" id="${id}" name="${name}" ${checked} ${attrs}>
          <label for="${id}" class="check-label">${label}</label>
        </div>
        ${hint}
      </div>`;
  }

  return `
    <div class="form-field">
      <label for="${id}">${label}</label>
      ${input}
      ${hint}
    </div>`;
}

// ── TAB 1: Stammdaten ──────────────────────────────────────────
function renderStammdaten() {
  const s = aktuellesAggregat.stammdaten;
  const html = `
    <div class="section-card">
      <h3>Allgemein</h3>
      <div class="form-grid">
        ${feld('Kommission *', 'stammdaten.Kommission', 'text', s.Kommission,
          { required: true, placeholder: 'z.B. 26-00034', hint: 'Eindeutige Kennnummer des Aggregats' })}
        ${feld('Bezeichnung', 'stammdaten.Bezeichnung', 'text', s.Bezeichnung,
          { placeholder: 'z.B. PWK Velbert' })}
        ${feld('Hersteller', 'stammdaten.Hersteller', 'text', s.Hersteller,
          { placeholder: 'z.B. Kluth, Pramac, Indutec' })}
        ${feld('Typ / Modell', 'stammdaten.Typ', 'text', s.Typ)}
        ${feld('Seriennummer', 'stammdaten.Serien_NR', 'text', s.Serien_NR)}
        ${feld('Leistung', 'stammdaten.Leistung_kVA', 'number', s.Leistung_kVA,
          { einheit: 'kVA', attrs: 'min="0" step="0.1"' })}
      </div>
    </div>

    <div class="section-card">
      <h3>Kunde &amp; Standort</h3>
      <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
        Wird im Protokoll-Formular als Vorschlagswert eingetragen.
      </p>
      <div class="form-grid">
        ${feld('Kunde / Firma', 'stammdaten.Kunde', 'text', s.Kunde,
          { placeholder: 'z.B. Muster GmbH' })}
        ${feld('Standort / Anlage', 'stammdaten.Standort', 'text', s.Standort,
          { placeholder: 'z.B. Werk Nord, Gebäude 3' })}
      </div>
    </div>

    <div class="section-card">
      <h3>Motor</h3>
      <div class="form-grid">
        ${feld('Motor-Typ', 'stammdaten.Motor_Typ', 'text', s.Motor_Typ,
          { placeholder: 'z.B. 4BT3.9-G2' })}
        ${feld('Motor-Nummer', 'stammdaten.Motor_NR', 'text', s.Motor_NR)}
      </div>
    </div>

    <div class="section-card">
      <h3>Kühlung</h3>
      <div class="form-grid">
        ${feld('Kühlmittel intern – Menge', 'stammdaten.Menge_Kuehlmittel_intern', 'number', s.Menge_Kuehlmittel_intern,
          { einheit: 'Liter', attrs: 'min="0" step="0.1"' })}
        ${feld('Kühlmittel intern – Typ', 'stammdaten.Typ_Kuehlmittel_intern', 'text', s.Typ_Kuehlmittel_intern,
          { placeholder: 'z.B. BASF Glysantin G48' })}
        ${feld('Kühlmittel extern – Menge', 'stammdaten.Menge_Kuehlmittel_extern', 'number', s.Menge_Kuehlmittel_extern,
          { einheit: 'Liter', attrs: 'min="0" step="0.1"' })}
        ${feld('Kühlmittel extern – Typ', 'stammdaten.Typ_Kuehlmittel_extern', 'text', s.Typ_Kuehlmittel_extern)}
      </div>
    </div>

    <div class="section-card">
      <h3>Wartungsvertrag</h3>
      <div class="form-grid">
        ${feld('Wartungsvertrag vorhanden', 'stammdaten.Wartungsvertrag', 'checkbox', s.Wartungsvertrag)}
        ${feld('Vertragsnummer', 'stammdaten.Wartungsvertrag_NR', 'text', s.Wartungsvertrag_NR)}
        ${feld('Wartungspauschale', 'stammdaten.Wartungspauschale', 'number', s.Wartungspauschale,
          { einheit: '€/Jahr', attrs: 'min="0" step="0.01"' })}
      </div>
    </div>

    <div class="section-card">
      <h3>Sonstiges</h3>
      <div class="form-grid">
        ${feld('Server-Link / Netzwerkpfad', 'stammdaten.Server_Link', 'text', s.Server_Link,
          { placeholder: '\\\\server\\ordner\\aggregat', hint: 'Pfad zum Ordner mit Dokumenten' })}
        <div class="full-width">
          ${feld('Notizen', 'stammdaten.Text', 'textarea', s.Text,
            { placeholder: 'Sonstige Hinweise zum Aggregat…' })}
        </div>
      </div>
    </div>`;

  document.getElementById('tab-stammdaten').innerHTML = html;
}

// ── TAB 2: Technische Daten ────────────────────────────────────
function renderTechnischeDaten() {
  const t = aktuellesAggregat.technische_daten;
  const html = `
    <div class="section-card">
      <h3>Generator</h3>
      <div class="form-grid">
        ${feld('Hersteller', 'technische_daten.Generator_Hersteller', 'text', t.Generator_Hersteller)}
        ${feld('Typ / Modell', 'technische_daten.Generator_Typ', 'text', t.Generator_Typ)}
        ${feld('Seriennummer', 'technische_daten.Generator_Serien_NR', 'text', t.Generator_Serien_NR)}
        ${feld('Regler-Typ', 'technische_daten.Generator_Regler_Typ', 'text', t.Generator_Regler_Typ,
          { placeholder: 'z.B. SX460, R230, DVR2' })}
      </div>
    </div>

    <div class="section-card">
      <h3>Motorregler (Drehzahlregler)</h3>
      <div class="form-grid">
        ${feld('Hersteller', 'technische_daten.Motorregler_Hersteller', 'text', t.Motorregler_Hersteller)}
        ${feld('Typ / Modell', 'technische_daten.Motorregler_Typ', 'text', t.Motorregler_Typ)}
      </div>
    </div>

    <div class="section-card">
      <h3>Notstromautomatik</h3>
      <div class="form-grid">
        ${feld('Hersteller', 'technische_daten.NSA_Hersteller', 'text', t.NSA_Hersteller)}
        ${feld('Typ / Modell', 'technische_daten.NSA_Typ', 'text', t.NSA_Typ)}
        ${feld('Seriennummer', 'technische_daten.NSA_Serien_NR', 'text', t.NSA_Serien_NR)}
      </div>
    </div>

    <div class="section-card">
      <h3>Starterbatterien</h3>
      <div class="form-grid">
        ${feld('Hersteller', 'technische_daten.Hersteller_Starterbatterie', 'text', t.Hersteller_Starterbatterie)}
        ${feld('Typ', 'technische_daten.Typ_Starterbatterie', 'text', t.Typ_Starterbatterie,
          { placeholder: 'z.B. 110Ah AGM, LFD90' })}
        ${feld('Spannung', 'technische_daten.Spannung_Starterbatterie', 'number', t.Spannung_Starterbatterie,
          { einheit: 'V', attrs: 'min="0"' })}
        ${feld('Anzahl', 'technische_daten.Anzahl_Starterbatterien', 'number', t.Anzahl_Starterbatterien,
          { attrs: 'min="1" step="1"' })}
        ${feld('Kapazität', 'technische_daten.Kapazitaet_Starterbatterie', 'number', t.Kapazitaet_Starterbatterie,
          { einheit: 'Ah', attrs: 'min="0"' })}
        ${feld('Wartungsfrei', 'technische_daten.Wartungsfrei_Starterbatterie', 'checkbox', t.Wartungsfrei_Starterbatterie)}
      </div>
    </div>

    <div class="section-card">
      <h3>Steuerbatterien</h3>
      <div class="form-grid">
        ${feld('Hersteller', 'technische_daten.Hersteller_Steuerbatterie', 'text', t.Hersteller_Steuerbatterie)}
        ${feld('Typ', 'technische_daten.Typ_Steuerbatterie', 'text', t.Typ_Steuerbatterie)}
        ${feld('Spannung', 'technische_daten.Spannung_Steuerbatterie', 'number', t.Spannung_Steuerbatterie,
          { einheit: 'V', attrs: 'min="0"' })}
        ${feld('Anzahl', 'technische_daten.Anzahl_Steuerbatterien', 'number', t.Anzahl_Steuerbatterien,
          { attrs: 'min="1" step="1"' })}
        ${feld('Kapazität', 'technische_daten.Kapazitaet_Steuerbatterie', 'number', t.Kapazitaet_Steuerbatterie,
          { einheit: 'Ah', attrs: 'min="0"' })}
        ${feld('Wartungsfrei', 'technische_daten.Wartungsfrei_Steuerbatterie', 'checkbox', t.Wartungsfrei_Steuerbatterie)}
      </div>
    </div>

    <div class="section-card">
      <h3>Batterieladegeräte</h3>
      <div class="form-grid">
        ${feld('Ladegerät 1 – Hersteller', 'technische_daten.Batterielader1_Hersteller', 'text', t.Batterielader1_Hersteller)}
        ${feld('Ladegerät 1 – Typ', 'technische_daten.Batterielader1_Typ', 'text', t.Batterielader1_Typ)}
        ${feld('Ladegerät 2 – Hersteller', 'technische_daten.Batterielader2_Hersteller', 'text', t.Batterielader2_Hersteller)}
        ${feld('Ladegerät 2 – Typ', 'technische_daten.Batterielader2_Typ', 'text', t.Batterielader2_Typ)}
      </div>
    </div>`;

  document.getElementById('tab-technisch').innerHTML = html;
}

// ── TAB 3: Wartungsintervalle ──────────────────────────────────
function renderWartungsintervalle() {
  const i = aktuellesAggregat.wartungsintervalle;
  const html = `
    <div class="section-card">
      <h3>Wartungsintervalle</h3>
      <p class="text-muted" style="margin-bottom:var(--space-md);font-size:0.85rem;">
        Alle Werte in Monaten. Leer lassen = nicht relevant.
      </p>
      <div class="form-grid">
        ${feld('Ölwechsel', 'wartungsintervalle.Oelwechsel_Intervall', 'number', i.Oelwechsel_Intervall,
          { einheit: 'Monate', attrs: 'min="1" step="1"' })}
        ${feld('DGUV-V3 Prüfung', 'wartungsintervalle.DGUV_Intervall', 'number', i.DGUV_Intervall,
          { einheit: 'Monate', attrs: 'min="1" step="1"' })}
        ${feld('Motorwartung mit Wechsel der Kraftstofffilter', 'wartungsintervalle.Motorwartung_Intervall', 'number', i.Motorwartung_Intervall,
          { einheit: 'Monate', attrs: 'min="1" step="1"' })}
        ${feld('Elektrische Wartung', 'wartungsintervalle.Elektr_Wartung_Intervall', 'number', i.Elektr_Wartung_Intervall,
          { einheit: 'Monate', attrs: 'min="1" step="1"' })}
        ${feld('Luftfilterwechsel', 'wartungsintervalle.Luftfilter_Intervall', 'number', i.Luftfilter_Intervall,
          { einheit: 'Monate', attrs: 'min="1" step="1"' })}
        ${feld('Kühlmittel intern', 'wartungsintervalle.Kuehlmittel_Intervall_intern', 'number', i.Kuehlmittel_Intervall_intern,
          { einheit: 'Monate', attrs: 'min="1" step="1"', hint: 'Leer = kein interner Kühlkreis' })}
        ${feld('Kühlmittel extern', 'wartungsintervalle.Kuehlmittel_Intervall_extern', 'number', i.Kuehlmittel_Intervall_extern,
          { einheit: 'Monate', attrs: 'min="1" step="1"', hint: 'Leer = kein externer Kühlkreis' })}
      </div>
    </div>`;

  document.getElementById('tab-intervalle').innerHTML = html;
}

// ── Eigene Prüfpunkte – Listenrendering ───────────────────────
function renderEigenListe(liste, gruppe) {
  if (!liste || !liste.length) return '';
  return liste.map((e, i) => `
    <div class="mangel-item" style="margin-top:4px">
      <div class="mangel-info">
        <span style="font-size:0.85rem">✦ ${e.label}</span>
      </div>
      <button class="btn btn-danger btn-sm eigen-del" data-gruppe="${gruppe}" data-idx="${i}">✕</button>
    </div>`).join('');
}

function eigenEingabe(gruppe) {
  return `
    <div class="tag-input-row" style="margin-top:var(--space-sm)">
      <input type="text" class="eigen-input" data-gruppe="${gruppe}"
             placeholder="Eigener Prüfpunkt…" style="flex:1">
      <button class="btn btn-ghost btn-sm eigen-add" data-gruppe="${gruppe}">+ Prüfpunkt</button>
    </div>`;
}

// ── Hilfsfunktionen für Protokoll-Setup (Modul-Scope) ─────────
function ps_aktiv_check(p, gruppe, schluessel, label) {
  const geprueft = p[gruppe]?.[schluessel]?.aktiv ? 'checked' : '';
  return `
    <div class="form-check">
      <input type="checkbox" id="pc-${gruppe}-${schluessel}"
             data-gruppe="${gruppe}" data-key="${schluessel}"
             class="proto-check" ${geprueft}>
      <label for="pc-${gruppe}-${schluessel}" class="check-label">${label}</label>
    </div>`;
}

function ps_kk_zeile(p, schluessel, label) {
  const aktiv = p.Kuehlkreise?.[schluessel]?.aktiv       ? 'checked' : '';
  const frost = p.Kuehlkreise?.[schluessel]?.frostschutz ? 'checked' : '';
  return `
    <div class="kuehlkreis-item">
      <span class="kk-label">${label}</span>
      <div class="kk-checks">
        <div class="form-check">
          <input type="checkbox" id="kk-aktiv-${schluessel}"
                 data-gruppe="Kuehlkreise" data-key="${schluessel}" data-feld="aktiv"
                 class="kk-check" ${aktiv}>
          <label for="kk-aktiv-${schluessel}" class="check-label">Vorhanden</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="kk-frost-${schluessel}"
                 data-gruppe="Kuehlkreise" data-key="${schluessel}" data-feld="frostschutz"
                 class="kk-check" ${frost}>
          <label for="kk-frost-${schluessel}" class="check-label">Frostschutz</label>
        </div>
      </div>
    </div>`;
}

const PS_SEKTION_TITEL = {
  'Leckagewächter':       'Leckageüberwachung',
  'Stoermeldungen':       'Störmeldungen',
  'Temperaturen_Heizung': 'Temperaturen / Heizung',
  'Ausstattung':          'Ausstattung',
  'Schaltanlage':         'Schaltanlage',
  'Messinstrumente':      'Messinstrumente',
  'Betriebsarten':        'Betriebsarten',
  'Elektronikgeraete':    'Elektronikgeräte',
  'Generator':            'Generator',
  'Motor_Ausstattung':    'Motor-Ausstattung',
  'Kuehlkreise':          'Kühlkreise',
};

// Rendert den Inhalt (ohne section-card wrapper) einer eingebauten Sektion
function ps_renderSektionInhalt(p, key) {
  const ac = (g, k, l) => ps_aktiv_check(p, g, k, l);
  switch (key) {
    case 'Leckagewächter':
      return `
        <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
          Welche Leckagemelder sind vorhanden? „Unterdruck" = Unterdruckleckagewächter (Vakuumsystem).
        </p>
        <div id="leckage-liste">${renderLeckageListe(p.Leckagewächter)}</div>
        <div class="tag-input-row" style="margin-top:var(--space-sm)">
          <input type="text" id="leckage-input" placeholder="z.B. Aggregat, Haupttank, Tagestank…">
          <button class="btn btn-secondary btn-sm" id="btn-add-leckage">+ Hinzufügen</button>
        </div>`;

    case 'Stoermeldungen':
      return `
        <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
          Typ: <strong>A</strong> = Abstellend · <strong>AV</strong> = Abstellend mit Verzögerung · <strong>W</strong> = Warnend
        </p>
        <div id="stoer-liste">${renderStoerListe(p.Stoermeldungen)}</div>
        <details style="margin-top:var(--space-sm)">
          <summary style="cursor:pointer;font-size:0.82rem;color:var(--text-secondary);margin-bottom:var(--space-xs)">
            ⚡ Häufige Störmeldungen als Vorlage hinzufügen
          </summary>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-top:var(--space-xs)">
            ${['Öldruckmangel','Motor-Übertemperatur','Kühlwassermangel','Fehlstart',
               'Batterieunterspannung','Überlast','Kurzschluss','Leckage',
               'Not-Aus betätigt','Störung Motorregler','Sicherungsfall','Kraftstoffmangel'].map(n => `
              <button class="btn btn-ghost btn-sm stoer-vorschlag" data-name="${n}" data-typ="abstellend"
                      style="font-size:0.78rem;padding:4px 10px">${n}</button>`).join('')}
          </div>
        </details>
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-top:var(--space-sm)">
          <input type="text" id="stoer-input" placeholder="Name der Störmeldung…" style="flex:1;min-width:140px">
          <select id="stoer-typ-input" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);padding:8px 10px">
            <option value="abstellend">Abstellend (A)</option>
            <option value="abstellend_verzoegert">Abstellend m. Verzögerung (AV)</option>
            <option value="warnend">Warnend (W)</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="btn-add-stoer">+ Meldung</button>
          <button class="btn btn-ghost btn-sm" id="btn-add-stoer-gruppe">+ Gruppe</button>
        </div>`;

    case 'Temperaturen_Heizung':
      return `
        <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
          Außentemperatur wird immer im Protokoll erfasst. Aktivierte Punkte erscheinen zusätzlich.
          Motorvorwärmung und Raumtemperatur enthalten ein Temperaturmessfeld.
        </p>
        ${ac('Temperaturen_Heizung','motorvorwaermung','Motorvorwärmung (+ Temperaturmessung)')}
        ${ac('Temperaturen_Heizung','kraftstoffvorwaerm','Kraftstoffvorwärmung')}
        ${ac('Temperaturen_Heizung','raumheizung','Raumheizung')}
        ${ac('Temperaturen_Heizung','raumtemperatur','Raumtemperatur (Messung)')}
        <p class="text-muted" style="font-size:0.78rem;margin-top:var(--space-xs)">
          ℹ Außentemperatur ist im Protokoll immer sichtbar – keine Konfiguration nötig.
        </p>`;

    case 'Schaltanlage':
      return `
        ${ac('Schaltanlage','hupe','Signalhorn (Hupe)')}
        ${ac('Schaltanlage','notaus','NOT-AUS Schalter')}
        ${ac('Schaltanlage','potfrei','Potentialfreie Meldungen')}
        ${ac('Schaltanlage','lastprobe','Lastprobeschalter')}
        ${ac('Schaltanlage','stoerungen','Anzeige für Störmeldungen')}
        ${ac('Schaltanlage','beleuchtng','Beleuchtung in der Schaltanlage')}
		${ac('Schaltanlage','beleuchtngagg','Beleuchtung Aggregat')}
        ${ac('Schaltanlage','genschalter','Generatorschalter')}
        ${ac('Schaltanlage','netzschalter','Netzschalter')}
        ${ac('Schaltanlage','ueberwachung','Überwachungseinrichtung')}
        <div class="eigen-bereich" id="eigen-Schaltanlage">
          ${renderEigenListe(p.Schaltanlage?._eigen||[],'Schaltanlage')}
        </div>
        ${eigenEingabe('Schaltanlage')}`;

    case 'Messinstrumente':
      return `
        ${ac('Messinstrumente','pf','Leistungsfaktor (cos φ)')}
        ${ac('Messinstrumente','sp','Spannung')}
        ${ac('Messinstrumente','nullsp','Nullspannung')}
        ${ac('Messinstrumente','str','Strom (A)')}
		${ac('Messinstrumente','umsch','Messtellenumschalter Netz/Gen')}
		${ac('Messinstrumente','umschL123','Umschalter L1, L2, L3')}
        ${ac('Messinstrumente','freq','Frequenz (Hz)')}
        ${ac('Messinstrumente','leist','Leistung (kW)')}
        ${ac('Messinstrumente','batlad','Batterieladestrom')}
		${ac('Messinstrumente','batsp','Batterieladespannung')}
        ${ac('Messinstrumente','kwtemp','Kühlwassertemperatur')}
        ${ac('Messinstrumente','kraftst','Kraftstoffvorrat')}
        ${ac('Messinstrumente','oeldruck','Öldruck')}
		${ac('Messinstrumente','drehz','Drehzahl (U/min)')}
        <div class="eigen-bereich" id="eigen-Messinstrumente">
          ${renderEigenListe(p.Messinstrumente?._eigen||[],'Messinstrumente')}
        </div>
        ${eigenEingabe('Messinstrumente')}`;

    case 'Betriebsarten':
      return `
        ${ac('Betriebsarten','handbetrieb','Handbetrieb')}
        ${ac('Betriebsarten','testbetrieb','Testbetrieb')}
        ${ac('Betriebsarten','automatikbetrieb','Automatikbetrieb')}
        ${ac('Betriebsarten','lastprobebetrieb','Lastprobebetrieb')}`;

    case 'Elektronikgeraete':
      return `
        ${ac('Elektronikgeraete','uebestromrelais','Überstromrelais')}
        ${ac('Elektronikgeraete','kurzschlussrelais','Kurzschlussrelais')}
        ${ac('Elektronikgeraete','synchronisiergeraet','Synchronisiergerät')}
        <div class="eigen-bereich" id="eigen-Elektronikgeraete">
          ${renderEigenListe(p.Elektronikgeraete?._eigen||[],'Elektronikgeraete')}
        </div>
        ${eigenEingabe('Elektronikgeraete')}`;

    case 'Generator':
      return `
        ${ac('Generator','drehfeld','Drehfeld')}
        ${ac('Generator','spannungsregler','Spannungsregler')}
        ${ac('Generator','leistungsfaktorregler','Leistungsfaktorregler')}
        ${ac('Generator','anschluesse','Anschlüsse')}
        <div class="eigen-bereich" id="eigen-Generator">
          ${renderEigenListe(p.Generator?._eigen||[],'Generator')}
        </div>
        ${eigenEingabe('Generator')}`;

    case 'Motor_Ausstattung':
      return `
        ${ac('Motor_Ausstattung','lima','Lichtmaschine')}
        ${ac('Motor_Ausstattung','anlass','Anlasser')}
		${ac('Motor_Ausstattung','abgas','Abgasanlage')}
		${ac('Motor_Ausstattung','luftfilter','Luftfilter')}
        ${ac('Motor_Ausstattung','oelbad','Ölbadluftfilter')}
        ${ac('Motor_Ausstattung','abstell','Abstell- / Freigabemagnet')}
		${ac('Motor_Ausstattung','vorglueh','Vorglühanlage')}
        ${ac('Motor_Ausstattung','kuehler','Kühler')}
        ${ac('Motor_Ausstattung','luefter','Lüfter')}
        ${ac('Motor_Ausstattung','keilriemen','Keilriemen')}
        ${ac('Motor_Ausstattung','schlaeuche','Kühlerschläuche')}
		${ac('Motor_Ausstattung','lager','Motor- und Generatorlager')}
        ${ac('Motor_Ausstattung','befestigung','Befestigungen')}
        ${ac('Motor_Ausstattung','kraftstoffleitungen','Kraftstoffleitungen / -schläuche')}
        <div class="eigen-bereich" id="eigen-Motor_Ausstattung">
          ${renderEigenListe(p.Motor_Ausstattung?._eigen||[],'Motor_Ausstattung')}
        </div>
        ${eigenEingabe('Motor_Ausstattung')}`;

    case 'Kuehlkreise':
      return `
        <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
          „Vorhanden" = wird im Protokoll geprüft. „Frostschutz" = Schutztemperatur wird gemessen.
        </p>
        ${ps_kk_zeile(p,'motorkreis','Motorkühlkreis')}
        ${ps_kk_zeile(p,'intern','Interner Kühlkreis')}
        ${ps_kk_zeile(p,'extern','Externer Kühlkreis')}
        ${ps_kk_zeile(p,'ladeluftkreis','Ladeluftkühlkreis')}`;

    case 'Ausstattung':
      return `
        ${ac('Ausstattung','haupttank','(Haupt-)Tank')}
        ${ac('Ausstattung','tagestank','Tagestank')}
        ${ac('Ausstattung','tankleitungen','Tankleitungen')}
        ${ac('Ausstattung','kraftstoffpumpe','Kraftstoffpumpe')}
        ${ac('Ausstattung','sauberkeit','Sauberkeit Raum/Aggregat')}
        <div class="eigen-bereich" id="eigen-Ausstattung">
          ${renderEigenListe(p.Ausstattung?._eigen||[],'Ausstattung')}
        </div>
        ${eigenEingabe('Ausstattung')}`;

    default: {
      // Eigene (benutzerdefinierte) Sektion
      const cs = (p.Eigene_Sektionen || []).find(s => s.id === key);
      return cs ? ps_renderEigeneSektionInhalt(cs) : '';
    }
  }
}

// Rendert den editierbaren Inhalt einer eigenen Sektion
function ps_renderEigeneSektionInhalt(cs) {
  return `
    <div id="eigsek-el-${cs.id}">
      ${ps_renderCustomElemente(cs.elemente || [], cs.id)}
    </div>
    <div style="display:flex;gap:var(--space-xs);flex-wrap:wrap;margin-top:var(--space-sm);align-items:center">
      <input class="eigsek-el-label" data-sekid="${cs.id}" placeholder="Element-Bezeichnung…"
             style="flex:1;min-width:120px;background:var(--bg-input);border:1px solid var(--border);
                    border-radius:var(--radius-sm);color:var(--text-primary);padding:6px 10px">
      <select class="eigsek-el-typ" data-sekid="${cs.id}"
              style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);
                     color:var(--text-primary);padding:6px 8px">
        <option value="checkbox">☑ Checkbox (OK/Mangel/N.G.)</option>
        <option value="messung">📊 Messwert</option>
        <option value="text">📝 Textfeld</option>
      </select>
      <input class="eigsek-el-einheit" data-sekid="${cs.id}" placeholder="Einheit (z.B. V)"
             style="width:80px;background:var(--bg-input);border:1px solid var(--border);
                    border-radius:var(--radius-sm);color:var(--text-primary);padding:6px 8px">
      <button class="btn btn-ghost btn-sm eigsek-el-add" data-sekid="${cs.id}">+ Element</button>
    </div>`;
}

function ps_renderCustomElemente(elemente, sekId) {
  if (!elemente.length) {
    return '<p class="text-muted" style="font-size:0.82rem;padding:4px 0">Noch keine Elemente.</p>';
  }
  const TYP_ICONS = { checkbox: '☑', messung: '📊', text: '📝', gruppe: '📁' };
  return elemente.map((el, i) => {
    if (el.typ === 'gruppe') {
      return `
        <div class="mangel-item" style="margin-bottom:4px;border-left:3px solid var(--accent);padding-left:8px">
          <div class="mangel-info">
            <span style="font-size:0.82rem;color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.04em">
              📁 ${el.label || 'Gruppe'}
            </span>
          </div>
          <button class="btn btn-danger btn-sm eigsek-el-del" data-sekid="${sekId}" data-idx="${i}">✕</button>
        </div>`;
    }
    return `
      <div class="mangel-item" style="margin-bottom:4px">
        <div class="mangel-info">
          <span style="font-size:0.82rem;color:var(--text-muted);min-width:18px">${TYP_ICONS[el.typ] || '•'}</span>
          <span style="margin-left:6px">${el.label}${el.einheit ? ` <span style="color:var(--text-muted)">(${el.einheit})</span>` : ''}</span>
        </div>
        <button class="btn btn-danger btn-sm eigsek-el-del" data-sekid="${sekId}" data-idx="${i}">✕</button>
      </div>`;
  }).join('');
}

// Rendert den gesamten Reorder-Block (alle sortierbaren Sektionen)
function ps_renderReorderBlock(p) {
  const rf = p.Sektionen_Reihenfolge || [];
  return rf.map((key, idx) => {
    const cs = (p.Eigene_Sektionen || []).find(s => s.id === key);
    const isCustom = !!cs;
    const titel = cs ? cs.titel : (PS_SEKTION_TITEL[key] || key);
    const inhalt = ps_renderSektionInhalt(p, key);
    if (!inhalt && !isCustom) return ''; // Unbekannter Schlüssel
    return `
      <div class="section-card" data-sek-key="${key}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--space-sm)">
          ${isCustom
            ? `<input type="text" class="eigsek-titel" data-id="${key}" value="${titel.replace(/"/g,'&quot;')}"
                      style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);
                             color:var(--text-primary);font-size:1rem;font-weight:700;padding:2px 4px">`
            : `<h3 style="flex:1;margin:0;border:none;padding:0">${titel}</h3>`}
          <button class="btn btn-ghost btn-sm sek-up" data-key="${key}" ${idx===0?'disabled':''}>↑</button>
          <button class="btn btn-ghost btn-sm sek-down" data-key="${key}" ${idx===rf.length-1?'disabled':''}>↓</button>
          ${isCustom ? `<button class="btn btn-danger btn-sm eigsek-del" data-id="${key}">✕ Gruppe</button>` : ''}
        </div>
        ${inhalt}
      </div>`;
  }).join('');
}

// Richtet alle Events für den Protokoll-Setup-Tab ein (idempotent dank onclick =)
function attachProtokollEvents() {
  const p = aktuellesAggregat.protokoll_config;


  // ── Reorder: Hoch/Runter ──────────────────────────────────────
  document.querySelectorAll('#reorder-sektionen .sek-up, #reorder-sektionen .sek-down').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const rf  = p.Sektionen_Reihenfolge;
      const idx = rf.indexOf(key);
      const neu = btn.classList.contains('sek-up') ? idx - 1 : idx + 1;
      if (neu < 0 || neu >= rf.length) return;
      [rf[idx], rf[neu]] = [rf[neu], rf[idx]];
      document.getElementById('reorder-sektionen').innerHTML = ps_renderReorderBlock(p);
      attachProtokollEvents();
    };
  });

  // ── Eigene Sektion löschen ────────────────────────────────────
  document.querySelectorAll('.eigsek-del').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      p.Eigene_Sektionen = (p.Eigene_Sektionen || []).filter(s => s.id !== id);
      p.Sektionen_Reihenfolge = p.Sektionen_Reihenfolge.filter(k => k !== id);
      document.getElementById('reorder-sektionen').innerHTML = ps_renderReorderBlock(p);
      attachProtokollEvents();
    };
  });

  // ── Eigene Sektion – Titel live bearbeiten ────────────────────
  document.querySelectorAll('.eigsek-titel').forEach(input => {
    input.oninput = () => {
      const cs = (p.Eigene_Sektionen || []).find(s => s.id === input.dataset.id);
      if (cs) cs.titel = input.value;
    };
  });

  // ── Eigene Sektion – Element hinzufügen ───────────────────────
  document.querySelectorAll('.eigsek-el-add').forEach(btn => {
    btn.onclick = () => {
      const sekId = btn.dataset.sekid;
      const cs    = (p.Eigene_Sektionen || []).find(s => s.id === sekId);
      if (!cs) return;
      const card    = btn.closest('[data-sek-key]');
      const labelEl = card?.querySelector(`.eigsek-el-label[data-sekid="${sekId}"]`);
      const typEl   = card?.querySelector(`.eigsek-el-typ[data-sekid="${sekId}"]`);
      const einEl   = card?.querySelector(`.eigsek-el-einheit[data-sekid="${sekId}"]`);
      const label   = labelEl?.value.trim();
      if (!label) return;
      const typ    = typEl?.value || 'checkbox';
      const einheit = einEl?.value.trim() || undefined;
      const elId   = label.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,30) + '_' + Date.now().toString(36).slice(-4);
      if (!cs.elemente) cs.elemente = [];
      cs.elemente.push({ id: elId, typ, label, ...(einheit ? { einheit } : {}) });
      const listDiv = document.getElementById(`eigsek-el-${sekId}`);
      if (listDiv) listDiv.innerHTML = ps_renderCustomElemente(cs.elemente, sekId);
      attachProtokollEvents();
      if (labelEl) { labelEl.value = ''; labelEl.focus(); }
    };
  });

  // ── Eigene Sektion – Element löschen ─────────────────────────
  document.querySelectorAll('.eigsek-el-del').forEach(btn => {
    btn.onclick = () => {
      const sekId = btn.dataset.sekid;
      const idx   = parseInt(btn.dataset.idx);
      const cs    = (p.Eigene_Sektionen || []).find(s => s.id === sekId);
      if (!cs) return;
      cs.elemente.splice(idx, 1);
      const listDiv = document.getElementById(`eigsek-el-${sekId}`);
      if (listDiv) listDiv.innerHTML = ps_renderCustomElemente(cs.elemente, sekId);
      attachProtokollEvents();
    };
  });

  // ── Leckage: Hinzufügen ───────────────────────────────────────
  const lkInput = document.getElementById('leckage-input');
  const lkBtn   = document.getElementById('btn-add-leckage');
  if (lkBtn) {
    lkBtn.onclick = () => {
      const name = lkInput?.value.trim();
      if (!name) return;
      p.Leckagewächter.push({ name, unterdruck: false });
      document.getElementById('leckage-liste').innerHTML = renderLeckageListe(p.Leckagewächter);
      einrichtenLeckageEvents();
      if (lkInput) { lkInput.value = ''; lkInput.focus(); }
    };
  }
  if (lkInput) lkInput.onkeydown = e => { if (e.key==='Enter') { e.preventDefault(); lkBtn?.click(); } };
  einrichtenLeckageEvents();

  // ── Störmeldungen: Hinzufügen ─────────────────────────────────
  const smInput = document.getElementById('stoer-input');
  const smBtn   = document.getElementById('btn-add-stoer');
  if (smBtn) {
    smBtn.onclick = () => {
      const name = smInput?.value.trim();
      if (!name) return;
      const typ = document.getElementById('stoer-typ-input')?.value || 'abstellend';
      p.Stoermeldungen.push({ name, typ, pruefhinweis: '' });
      document.getElementById('stoer-liste').innerHTML = renderStoerListe(p.Stoermeldungen);
      einrichtenStoerEvents();
      if (smInput) { smInput.value = ''; smInput.focus(); }
    };
  }
  if (smInput) smInput.onkeydown = e => { if (e.key==='Enter') { e.preventDefault(); smBtn?.click(); } };

  // ── Störmeldungen: Gruppe ─────────────────────────────────────
  const sgBtn = document.getElementById('btn-add-stoer-gruppe');
  if (sgBtn) {
    sgBtn.onclick = () => {
      p.Stoermeldungen.push({ art: 'gruppe', titel: 'Neue Gruppe' });
      document.getElementById('stoer-liste').innerHTML = renderStoerListe(p.Stoermeldungen);
      einrichtenStoerEvents();
    };
  }

  // ── Störmeldungen: Vorschläge ─────────────────────────────────
  document.querySelectorAll('.stoer-vorschlag').forEach(btn => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      const typ  = btn.dataset.typ || 'abstellend';
      const exists = p.Stoermeldungen.some(s => typeof s==='object' && s.art!=='gruppe' && s.name===name && (s.typ||'abstellend')===typ);
      if (exists) { toast(`„${name} (${typ})" ist bereits vorhanden`, 'warn'); return; }
      p.Stoermeldungen.push({ name, typ, pruefhinweis: '' });
      document.getElementById('stoer-liste').innerHTML = renderStoerListe(p.Stoermeldungen);
      einrichtenStoerEvents();
    };
  });
  einrichtenStoerEvents();

  // ── Kühlkreis-Checkboxen ──────────────────────────────────────
  document.querySelectorAll('.kk-check').forEach(cb => {
    cb.onchange = () => {
      const gruppe = cb.dataset.gruppe;
      const key    = cb.dataset.key;
      const feldName = cb.dataset.feld;
      if (!p[gruppe]) p[gruppe] = {};
      if (!p[gruppe][key]) p[gruppe][key] = {};
      p[gruppe][key][feldName] = cb.checked;
    };
  });

  // ── Proto-check Checkboxen ────────────────────────────────────
  document.querySelectorAll('.proto-check').forEach(cb => {
    cb.onchange = () => {
      const gruppe = cb.dataset.gruppe;
      const key    = cb.dataset.key;
      if (p[gruppe]?.[key] !== undefined) p[gruppe][key].aktiv = cb.checked;
    };
  });

  einrichtenEigenEvents();
}

// ── TAB 4: Protokoll-Setup ─────────────────────────────────────
function renderProtokollSetup() {
  const p = aktuellesAggregat.protokoll_config;

  // backward-compat: lokale Aliases für den großen template-Block
  function aktiv_check(gruppe, schluessel, label) {
    return ps_aktiv_check(p, gruppe, schluessel, label);
  }
  function kuehlkreis_zeile(schluessel, label) {
    return ps_kk_zeile(p, schluessel, label);
  }

  const html = `
    <div class="section-card">
      <h3>Allgemein</h3>
      <div class="form-grid">
        ${feld('Aggregat-Typ', 'protokoll_config.Typ', 'select', p.Typ, {
          auswahlwerte: [
            { wert: 'stationaer', label: 'Stationär' },
            { wert: 'mobil',      label: 'Mobil' }
          ]
        })}
        ${feld('Lastbetrieb', 'protokoll_config.Lastbetrieb', 'select', p.Lastbetrieb, {
          auswahlwerte: [
            { wert: '',                label: '— nicht konfiguriert —' },
            { wert: 'uebergabesync',   label: 'Übergabe mit Synchronisierung' },
            { wert: 'uebergabe',       label: 'Übergabe ohne Synchronisierung' },
            { wert: 'inselbetrieb',    label: 'Inselbetrieb' },
            { wert: 'parallelbetrieb', label: 'Parallelbetrieb' },
          ]
        })}
        ${feld('Kunden-Bestellnummer', 'protokoll_config.Kunden_Bestellnr', 'text', p.Kunden_Bestellnr)}
        ${feld('Startzähler vorhanden', 'protokoll_config.Hat_Startzaehler', 'checkbox', p.Hat_Startzaehler)}
        ${feld('Keine DGUV-V3 Prüfung', 'protokoll_config.Keine_DGUV', 'checkbox', p.Keine_DGUV,
          { hint: 'Aktivieren wenn keine DGUV-Prüfung erforderlich ist' })}
        ${feld('Generator-Trenner vorhanden', 'protokoll_config.Hat_Generator_Trenner', 'checkbox', p.Hat_Generator_Trenner)}
        ${feld('Starterbatterien vorhanden', 'protokoll_config.Hat_Starterbatterien', 'checkbox', p.Hat_Starterbatterien)}
        ${feld('Steuerbatterien vorhanden', 'protokoll_config.Hat_Steuerbatterien', 'checkbox', p.Hat_Steuerbatterien)}
      </div>
    </div>

    <div class="section-card">
      <h3>Generator-Sollwerte</h3>
      <div class="form-grid">
        ${feld('Spannungstyp', 'protokoll_config.Generatorspannung_Typ', 'select', p.Generatorspannung_Typ, {
          auswahlwerte: [{ wert: 'fest', label: 'Fest' }, { wert: 'variabel', label: 'Variabel' }]
        })}
        ${feld('Frequenztyp', 'protokoll_config.Generatorfrequenz_Typ', 'select', p.Generatorfrequenz_Typ, {
          auswahlwerte: [{ wert: 'fest', label: 'Fest' }, { wert: 'variabel', label: 'Variabel' }]
        })}
      </div>
    </div>

    <div id="reorder-sektionen">${ps_renderReorderBlock(p)}</div>

    <div class="section-card" style="border-style:dashed;border-color:var(--accent)">
      <h3 style="color:var(--accent)">Eigene Gruppe hinzufügen</h3>
      <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
        Erstelle eine vollständig freie Gruppe mit eigenen Elementen (Checkboxen, Messwerte, Textfelder).
        Die Gruppe erscheint im Protokoll und kann oben in der Reihenfolge verschoben werden.
      </p>
      <div style="display:flex;gap:var(--space-sm);align-items:center">
        <input type="text" id="eigsek-neuer-titel" placeholder="Name der Gruppe…"
               style="flex:1;background:var(--bg-input);border:1px solid var(--border);
                      border-radius:var(--radius-sm);color:var(--text-primary);padding:8px 10px">
        <button class="btn btn-secondary" id="btn-add-eigsek">+ Neue Gruppe</button>
      </div>
    </div>`;

  document.getElementById('tab-protokoll').innerHTML = html;

  // Neue eigene Gruppe anlegen
  document.getElementById('btn-add-eigsek').onclick = () => {
    const titleInput = document.getElementById('eigsek-neuer-titel');
    const titel = titleInput?.value.trim() || 'Neue Gruppe';
    const id = 'eigsek_' + Date.now().toString(36);
    if (!p.Eigene_Sektionen) p.Eigene_Sektionen = [];
    if (!p.Sektionen_Reihenfolge) p.Sektionen_Reihenfolge = [];
    p.Eigene_Sektionen.push({ id, titel, elemente: [] });
    p.Sektionen_Reihenfolge.push(id);
    document.getElementById('reorder-sektionen').innerHTML = ps_renderReorderBlock(p);
    attachProtokollEvents();
    if (titleInput) titleInput.value = '';
  };
  document.getElementById('eigsek-neuer-titel').onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-eigsek')?.click(); }
  };

  attachProtokollEvents();
}

// ── Eigene Prüfpunkte – Events ────────────────────────────────
function einrichtenEigenEvents() {
  const tab = document.getElementById('tab-protokoll');

  // Hinzufügen
  tab.querySelectorAll('.eigen-add').forEach(btn => {
    btn.onclick = () => {
      const gruppe = btn.dataset.gruppe;
      const input  = tab.querySelector(`.eigen-input[data-gruppe="${gruppe}"]`);
      const label  = input?.value.trim();
      if (!label) return;
      const cfg = aktuellesAggregat.protokoll_config;
      if (!cfg[gruppe]) cfg[gruppe] = {};
      if (!Array.isArray(cfg[gruppe]._eigen)) cfg[gruppe]._eigen = [];
      // Schlüssel = sanitized label
      const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30) + '_' + Date.now().toString(36).slice(-4);
      cfg[gruppe]._eigen.push({ key, label });
      document.getElementById(`eigen-${gruppe}`).innerHTML =
        renderEigenListe(cfg[gruppe]._eigen, gruppe);
      einrichtenEigenEvents();
      input.value = '';
      input.focus();
    };
  });

  // Enter-Taste
  tab.querySelectorAll('.eigen-input').forEach(input => {
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tab.querySelector(`.eigen-add[data-gruppe="${input.dataset.gruppe}"]`)?.click();
      }
    };
  });

  // Löschen
  tab.querySelectorAll('.eigen-del').forEach(btn => {
    btn.onclick = () => {
      const gruppe = btn.dataset.gruppe;
      const idx    = parseInt(btn.dataset.idx);
      const cfg    = aktuellesAggregat.protokoll_config;
      cfg[gruppe]._eigen.splice(idx, 1);
      document.getElementById(`eigen-${gruppe}`).innerHTML =
        renderEigenListe(cfg[gruppe]._eigen, gruppe);
      einrichtenEigenEvents();
    };
  });
}

// ── Leckagewächter-Liste rendern ───────────────────────────────
// Gibt HTML-String für die strukturierte Liste zurück
function renderLeckageListe(liste) {
  if (!liste || !liste.length) {
    return '<p class="text-muted" style="font-size:0.82rem;padding:4px 0">Noch keine Einträge.</p>';
  }
  return liste.map((eintrag, i) => {
    // Kompatibilität: alter String-Eintrag → neues Objekt
    const name       = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const unterdruck = typeof eintrag === 'object'  ? eintrag.unterdruck : false;
    return `
      <div class="mangel-item" style="align-items:center">
        <div class="mangel-info" style="display:flex;align-items:center;gap:var(--space-md)">
          <strong style="min-width:120px">${name}</strong>
          <div class="form-check">
            <input type="checkbox" id="lk-ud-${i}" class="lk-unterdruck" data-idx="${i}"
                   ${unterdruck ? 'checked' : ''}>
            <label for="lk-ud-${i}" class="check-label" style="font-size:0.82rem">
              🔲 Unterdruckleckagewächter
            </label>
          </div>
        </div>
        <button class="btn btn-danger btn-sm lk-del" data-idx="${i}">✕</button>
      </div>`;
  }).join('');
}

// ── Leckagewächter Events (Unterdruck + Löschen) ──────────────
function einrichtenLeckageEvents() {
  const container = document.getElementById('leckage-liste');
  container.querySelectorAll('.lk-del').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      aktuellesAggregat.protokoll_config.Leckagewächter.splice(idx, 1);
      container.innerHTML = renderLeckageListe(aktuellesAggregat.protokoll_config.Leckagewächter);
      einrichtenLeckageEvents();
    };
  });
  container.querySelectorAll('.lk-unterdruck').forEach(cb => {
    cb.onchange = () => {
      const idx = parseInt(cb.dataset.idx);
      const eintrag = aktuellesAggregat.protokoll_config.Leckagewächter[idx];
      if (typeof eintrag === 'string') {
        aktuellesAggregat.protokoll_config.Leckagewächter[idx] = { name: eintrag, unterdruck: cb.checked };
      } else {
        eintrag.unterdruck = cb.checked;
      }
    };
  });
}

// ── Störmeldungen-Liste rendern ────────────────────────────────
const STOER_TYP_LABELS = {
  abstellend:           'Abstellend (A)',
  abstellend_verzoegert:'Abstellend m. Verz. (AV)',
  warnend:              'Warnend (W)',
};
const STOER_TYP_FARBE = {
  abstellend:           'var(--danger)',
  abstellend_verzoegert:'var(--warning)',
  warnend:              'var(--info)',
};

function renderStoerListe(liste) {
  if (!liste || !liste.length) {
    return '<p class="text-muted" style="font-size:0.82rem;padding:4px 0">Noch keine Störmeldungen.</p>';
  }
  return liste.map((s, i) => {
    // Gruppenüberschrift
    if (typeof s === 'object' && s.art === 'gruppe') {
      return `
        <div style="background:var(--bg-card);border:1px dashed var(--border);border-radius:var(--radius-sm);
                    padding:var(--space-xs) var(--space-sm);margin-bottom:var(--space-xs);
                    display:flex;align-items:center;gap:var(--space-sm)">
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
                       letter-spacing:.05em;color:var(--text-muted)">Gruppe</span>
          <input type="text" class="sm-gruppe-titel" data-idx="${i}"
                 value="${s.titel || ''}" placeholder="Gruppenname…"
                 style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);
                        color:var(--text-primary);padding:2px 4px;font-size:0.9rem;font-weight:600">
          <button class="btn btn-danger btn-sm sm-del" data-idx="${i}">✕</button>
        </div>`;
    }

    // Kompatibilität: alter String-Eintrag
    const name         = typeof s === 'string' ? s : s.name;
    const typ          = typeof s === 'object'  ? (s.typ || 'abstellend') : 'abstellend';
    const pruefhinweis = typeof s === 'object'  ? (s.pruefhinweis || '') : '';
    const farbe        = STOER_TYP_FARBE[typ] || 'var(--text-muted)';
    const typLabel     = STOER_TYP_LABELS[typ] || typ;

    return `
      <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-sm);
                  padding:var(--space-sm) var(--space-md);margin-bottom:var(--space-xs)">
        <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:6px">
          <span style="font-weight:600;flex:1">${name}</span>
          <span style="font-size:0.75rem;font-weight:700;color:${farbe};padding:2px 8px;
                       border-radius:99px;border:1px solid ${farbe}">${typLabel}</span>
          <button class="btn btn-danger btn-sm sm-del" data-idx="${i}">✕</button>
        </div>
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap">
          <select class="sm-typ" data-idx="${i}"
                  style="background:var(--bg-input);border:1px solid var(--border);
                         border-radius:var(--radius-sm);color:var(--text-primary);padding:5px 8px;font-size:0.82rem">
            <option value="abstellend"           ${typ==='abstellend'            ? 'selected':''}>Abstellend (A)</option>
            <option value="abstellend_verzoegert" ${typ==='abstellend_verzoegert'? 'selected':''}>Abstellend m. Verzögerung (AV)</option>
            <option value="warnend"              ${typ==='warnend'               ? 'selected':''}>Warnend (W)</option>
          </select>
          <input type="text" class="sm-hint" data-idx="${i}"
                 placeholder="Prüfhinweis, z.B. Klemme X3 7+8 brücken…"
                 value="${pruefhinweis}"
                 style="flex:1;min-width:160px;background:var(--bg-input);border:1px solid var(--border);
                        border-radius:var(--radius-sm);color:var(--text-primary);padding:5px 8px;font-size:0.82rem">
        </div>
      </div>`;
  }).join('');
}

// ── Störmeldungs-Events ────────────────────────────────────────
function einrichtenStoerEvents() {
  const container = document.getElementById('stoer-liste');

  // Löschen
  container.querySelectorAll('.sm-del').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      aktuellesAggregat.protokoll_config.Stoermeldungen.splice(idx, 1);
      container.innerHTML = renderStoerListe(aktuellesAggregat.protokoll_config.Stoermeldungen);
      einrichtenStoerEvents();
    };
  });

  // Typ ändern
  container.querySelectorAll('.sm-typ').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx);
      const s   = aktuellesAggregat.protokoll_config.Stoermeldungen[idx];
      if (typeof s === 'string') {
        aktuellesAggregat.protokoll_config.Stoermeldungen[idx] = { name: s, typ: sel.value, pruefhinweis: '' };
      } else {
        s.typ = sel.value;
      }
      // Badge-Farbe aktualisieren ohne neu zu rendern
      const badge = sel.closest('div[style]').querySelector('span[style*="color"]');
      if (badge) {
        badge.textContent = STOER_TYP_LABELS[sel.value] || sel.value;
        badge.style.color  = STOER_TYP_FARBE[sel.value] || 'var(--text-muted)';
        badge.style.borderColor = STOER_TYP_FARBE[sel.value] || 'var(--border)';
      }
    };
  });

  // Prüfhinweis ändern (live, kein Neurendern)
  container.querySelectorAll('.sm-hint').forEach(input => {
    input.oninput = () => {
      const idx = parseInt(input.dataset.idx);
      const s   = aktuellesAggregat.protokoll_config.Stoermeldungen[idx];
      if (typeof s === 'string') {
        aktuellesAggregat.protokoll_config.Stoermeldungen[idx] = { name: s, typ: 'abstellend', pruefhinweis: input.value };
      } else {
        s.pruefhinweis = input.value;
      }
    };
  });

  // Gruppen-Titel ändern (live, kein Neurendern)
  container.querySelectorAll('.sm-gruppe-titel').forEach(input => {
    input.oninput = () => {
      const idx = parseInt(input.dataset.idx);
      const s   = aktuellesAggregat.protokoll_config.Stoermeldungen[idx];
      if (s && s.art === 'gruppe') s.titel = input.value;
    };
  });
}

// ── Formulardaten auslesen und in aktuellesAggregat speichern ──
function formularWerteEinlesen() {
  const screen = document.getElementById('screen-konfigurator');

  // Alle normalen Inputs und Selects durchgehen
  screen.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
    const pfad = el.name; // z.B. "stammdaten.Kommission"
    const teile = pfad.split('.');

    // Wert je nach Feldtyp ermitteln
    let wert;
    if (el.type === 'checkbox') {
      wert = el.checked;
    } else if (el.type === 'number') {
      wert = el.value === '' ? null : parseFloat(el.value);
    } else {
      wert = el.value;
    }

    // Wert im Objekt setzen (unterstützt einen Pfad mit einem Punkt)
    if (teile.length === 2) {
      aktuellesAggregat[teile[0]][teile[1]] = wert;
    } else if (teile.length === 1) {
      aktuellesAggregat[teile[0]] = wert;
    }
  });

  // Protokoll-Config Checkboxen (aktiv-Flags)
  screen.querySelectorAll('.proto-check').forEach(cb => {
    const gruppe = cb.dataset.gruppe;
    const key    = cb.dataset.key;
    if (aktuellesAggregat.protokoll_config[gruppe]?.[key] !== undefined) {
      aktuellesAggregat.protokoll_config[gruppe][key].aktiv = cb.checked;
    }
  });
}

// ── Konfiguration speichern ────────────────────────────────────
export async function konfigurationSpeichern() {
  formularWerteEinlesen();

  const kommission = aktuellesAggregat.stammdaten.Kommission.trim();
  if (!kommission) {
    toast('Bitte eine Kommissionsnummer eingeben', 'error');
    wechsleTab('tab-stammdaten');
    return false;
  }

  aktuellesAggregat.geaendert_am = new Date().toISOString();
  await DB.speichereAggregat(aktuellesAggregat);
  toast('Konfiguration gespeichert ✓', 'success');
  return true;
}

// ── Konfiguration exportieren ──────────────────────────────────
export async function konfigurationExportieren() {
  formularWerteEinlesen();
  if (!aktuellesAggregat.stammdaten.Kommission) {
    toast('Bitte zuerst eine Kommission eingeben', 'error');
    return;
  }
  try {
    const name = await exportAggregat(aktuellesAggregat.id);
    toast(`Exportiert: ${name}`, 'success');
  } catch (err) {
    toast('Export fehlgeschlagen: ' + err.message, 'error');
  }
}

// ── Konfiguration löschen ──────────────────────────────────────
export async function konfigurationLoeschen() {
  const name = aktuellesAggregat.stammdaten.Kommission || aktuellesAggregat.id;
  if (!await confirm2(`Aggregat "${name}" wirklich löschen?\nAlle zugehörigen Protokolle bleiben erhalten.`)) return;

  await DB.loescheAggregat(aktuellesAggregat.id);
  toast(`Aggregat "${name}" gelöscht`);
  navigiereZu('screen-home');
}

// ── Tab-Wechsel für Konfigurator einrichten ────────────────────
export function einrichtenKonfiguratorTabs() {
  document.querySelectorAll('#screen-konfigurator .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Vor dem Tab-Wechsel aktuelle Werte sichern
      formularWerteEinlesen();
      wechsleTab(btn.dataset.tab);
    });
  });
}
