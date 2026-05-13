// ============================================================
// protokoll.js – Wartungsprotokoll ausfüllen
//
// Rendert das Formular zum Ausfüllen eines Wartungsprotokolls.
// Das Formular wird dynamisch anhand der Aggregat-Konfiguration
// aufgebaut – nur was konfiguriert ist erscheint hier.
// ============================================================

import { DB, erzeugId } from './db.js';
import { exportProtokoll } from './io.js';
import { toast, confirm2, confirmCustom, navigiereZu } from './app.js';

let aktuellesAggregat  = null;
let aktuellesProtokoll = null;

// ── Protokoll-Formular öffnen ──────────────────────────────────
export async function zeigeProtokollFormular(aggregatId, protokollId = null) {
  aktuellesAggregat = await DB.getAggregat(aggregatId);
  if (!aktuellesAggregat) { toast('Aggregat nicht gefunden', 'error'); return; }

  aktuellesProtokoll = protokollId
    ? (await DB.getProtokoll(protokollId)) || neuesProtokoll(aggregatId)
    : neuesProtokoll(aggregatId);

  const std = aktuellesAggregat.stammdaten;
  const titleEl = document.getElementById('screen-title-text');
  if (titleEl) titleEl.textContent = `${std.Kommission || '?'} – ${std.Bezeichnung || 'Wartung'}`;

  renderProtokollFormular();
}

// ── Leeres Protokoll-Objekt ────────────────────────────────────
function neuesProtokoll(aggregatId) {
  return {
    id:          erzeugId(),
    aggregatId,
    datum:       new Date().toISOString().slice(0, 10),
    erstellt_am: new Date().toISOString(),
    status:      'entwurf',

    meta: {
      techniker:  '',
      auftrag_nr: '',
      kunde:      aktuellesAggregat?.stammdaten?.Kunde    || '',
      standort:   aktuellesAggregat?.stammdaten?.Standort || '',
    },

    // Betriebsdaten je vor und nach der Wartung
    betriebsdaten: {
      betriebsstunden_vorher:  null,
      betriebsstunden_nachher: null,
      startzaehler_vorher:     null,
      startzaehler_nachher:    null,
    },

    // Batterieprüfung – Arrays, je eine Messung pro Einzelbatterie
    batterien: {
      starterbatterie: Array.from(
        { length: aktuellesAggregat?.technische_daten?.Anzahl_Starterbatterien || 1 },
        () => ({ leerlauf: null, belastung: null, pruefstrom: null, klemmen_ok: false, saeuredichte: null, destilliert: false })
      ),
      steuerbatterie: Array.from(
        { length: aktuellesAggregat?.technische_daten?.Anzahl_Steuerbatterien || 1 },
        () => ({ leerlauf: null, belastung: null, pruefstrom: null, klemmen_ok: false, saeuredichte: null, destilliert: false })
      ),
      lader1_ladespannung: null,
      lader2_ladespannung: null,
    },

    // Spannungs-/Frequenzverstellung – nur relevant wenn variabel konfiguriert
    spannungsFrequenz: {
      spannung_min: null, spannung_max: null,
      frequenz_min: null, frequenz_max: null,
    },

    // Probelaufprotokoll – mehrere Läufe mit verschiedenen Belastungen
    probelaeufe: [],

    durchgefuehrte_arbeiten: {
      elektr_wartung:     false,
      motor_wartung:      false,
      oelwechsel:         false,
      dguv:               false,
      kuehlmittel_intern: false,
      kuehlmittel_extern: false,
      luftfilter:         false,
      zahnriemenwechsel:  false,
    },

    // Dynamische Checkliste aus der Protokoll-Config
    checkliste: {},

    // Temperaturmessungen (Außentemperatur immer, Rest wenn konfiguriert)
    temperaturen: {
      aussentemperatur:      null,
      motorvorwaermung_temp: null,
      raumtemperatur:        null,
    },

    // Werte der eigenen (freien) Rubriken: { [sektionId]: { [elementId]: value } }
    eigene_sektionen: {},

    maengel:    [],
    ergebnis:   '',

    // Geplante Arbeiten bei der nächsten Wartung
    naechste_arbeiten: {
      elektr_wartung:     false,
      motor_wartung:      false,
      oelwechsel:         false,
      dguv:               false,
      kuehlmittel_intern: false,
      kuehlmittel_extern: false,
      luftfilter:         false,
      zahnriemenwechsel:  false,
    },

    bemerkung:              '',
    naechste_pruefung:      '',
    verlassen_in_betriebsart: '', // 'auto' | 'manuell' | 'aus'
  };
}

// ── Gesamtes Formular rendern ──────────────────────────────────
function renderProtokollFormular() {
  const container = document.getElementById('protokoll-form-body');
  const p   = aktuellesProtokoll;
  const cfg = aktuellesAggregat.protokoll_config;

  initialisiereCheckliste(cfg, p);

  container.innerHTML = `
    ${renderMetaSektion(p)}
    ${renderBetriebsdatenSektion(p, cfg)}
    ${renderSpannungsFrequenzSektion(p, cfg)}
    ${renderProbelaufSektion(p)}
    ${renderDurchgefuehrteArbeitenSektion(p, cfg)}
    ${renderBatterieMessungSektion(p, cfg)}
    ${renderChecklisteSektion(p, cfg)}
    ${renderMaengelSektion(p)}
    ${renderErgebnisSektion(p)}
    ${renderNaechsteWartungSektion(p, cfg)}
    ${renderBetriebsartVerlassenSektion(p)}
  `;

  einrichtenErgebnisButtons(p);
  einrichtenMaengelLogik(p);
  einrichtenProbelaufLogik(p);
  einrichtenBetriebsartButtons(p);
}

// ── Checkliste initialisieren ──────────────────────────────────
function initialisiereCheckliste(cfg, p) {
  if (!p.checkliste) p.checkliste = {};

  function initGruppe(gruppe, schluessel) {
    if (!p.checkliste[gruppe]) p.checkliste[gruppe] = {};
    if (cfg[gruppe]?.[schluessel]?.aktiv && !(schluessel in p.checkliste[gruppe])) {
      p.checkliste[gruppe][schluessel] = 'ng';
    }
  }

  ['Heizung','Schaltanlage','Messinstrumente',
   'Betriebsarten','Elektronikgeraete','Generator','Motor_Ausstattung','Ausstattung'].forEach(g => {
    Object.keys(cfg[g] || {}).filter(k => k !== '_eigen').forEach(k => initGruppe(g, k));
    // Eigene Prüfpunkte
    if (!p.checkliste[g]) p.checkliste[g] = {};
    (cfg[g]?._eigen || []).forEach(e => {
      const eigenKey = 'eigen_' + e.key;
      if (!(eigenKey in p.checkliste[g])) p.checkliste[g][eigenKey] = 'ng';
    });
  });

  if (!p.checkliste.Leckagewächter) p.checkliste.Leckagewächter = {};
  (cfg.Leckagewächter || []).forEach(eintrag => {
    const name        = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const unterdruck  = typeof eintrag === 'object' && eintrag.unterdruck;
    if (!(name in p.checkliste.Leckagewächter)) {
      // Unterdruckwächter braucht ein Objekt mit 4 Druckwerten
      p.checkliste.Leckagewächter[name] = unterdruck
        ? { zustand: 'ng', pumpe_ein: null, alarm_ein: null, alarm_aus: null, pumpe_aus: null }
        : 'ng';
    } else if (unterdruck && typeof p.checkliste.Leckagewächter[name] === 'string') {
      // Alten String-Eintrag auf Objekt migrieren (Rückwärtskompatibilität)
      const alt = p.checkliste.Leckagewächter[name];
      p.checkliste.Leckagewächter[name] = { zustand: alt, pumpe_ein: null, alarm_ein: null, alarm_aus: null, pumpe_aus: null };
    }
  });

  if (!p.checkliste.Stoermeldungen) p.checkliste.Stoermeldungen = {};
  (cfg.Stoermeldungen || []).forEach(s => {
    if (typeof s === 'object' && s.art === 'gruppe') return;
    const name = typeof s === 'string' ? s : s.name;
    const typ  = typeof s === 'object' ? (s.typ || 'abstellend') : 'abstellend';
    const key  = name + '__' + typ;
    if (name && !(key in p.checkliste.Stoermeldungen)) p.checkliste.Stoermeldungen[key] = 'ng';
  });

  if (!p.checkliste.Kuehlkreise) p.checkliste.Kuehlkreise = {};
  Object.keys(cfg.Kuehlkreise || {}).forEach(k => {
    if (cfg.Kuehlkreise[k]?.aktiv && !(k in p.checkliste.Kuehlkreise)) {
      p.checkliste.Kuehlkreise[k] = { zustand: 'ng', frostschutz: null };
    }
  });

  if (!p.checkliste.Batterien) p.checkliste.Batterien = {};

  // Temperaturen / Heizung
  if (!p.checkliste.Temperaturen_Heizung) p.checkliste.Temperaturen_Heizung = {};
  ['motorvorwaermung','kraftstoffvorwaerm','raumheizung'].forEach(k => {
    if (cfg.Temperaturen_Heizung?.[k]?.aktiv && !(k in p.checkliste.Temperaturen_Heizung))
      p.checkliste.Temperaturen_Heizung[k] = 'ng';
  });
  if (!p.temperaturen) p.temperaturen = { aussentemperatur: null, motorvorwaermung_temp: null, raumtemperatur: null };

  // Eigene Rubriken initialisieren
  if (!p.eigene_sektionen) p.eigene_sektionen = {};
  (cfg.Eigene_Sektionen || []).forEach(cs => {
    if (!p.eigene_sektionen[cs.id]) p.eigene_sektionen[cs.id] = {};
    (cs.elemente || []).filter(el => el.typ !== 'gruppe').forEach(el => {
      if (!(el.id in p.eigene_sektionen[cs.id])) {
        p.eigene_sektionen[cs.id][el.id] =
          el.typ === 'checkbox' ? 'ng' :
          el.typ === 'messung'  ? null : '';
      }
    });
  });
}

// ── SEKTION: Meta ──────────────────────────────────────────────
function renderMetaSektion(p) {
  return `
    <div class="section-card">
      <h3>Projekt &amp; Techniker</h3>
      <div class="form-grid">
        <div class="form-field">
          <label for="pr-datum">Datum *</label>
          <input type="date" id="pr-datum" value="${p.datum}" required>
        </div>
        <div class="form-field">
          <label for="pr-techniker">Techniker *</label>
          <input type="text" id="pr-techniker" value="${p.meta.techniker}"
                 required placeholder="Vor- und Nachname">
        </div>
        <div class="form-field">
          <label for="pr-auftrag">Projektnummer</label>
          <input type="text" id="pr-auftrag" value="${p.meta.auftrag_nr}"
                 placeholder="z.B. 2024-0042">
        </div>
        <div class="form-field">
          <label for="pr-kunde">Kunde / Firma</label>
          <input type="text" id="pr-kunde" value="${p.meta.kunde}"
                 placeholder="Kundenname">
        </div>
        <div class="form-field full-width">
          <label for="pr-standort">Standort / Anlage</label>
          <input type="text" id="pr-standort" value="${p.meta.standort}"
                 placeholder="Standortbezeichnung">
        </div>
      </div>
    </div>`;
}

// ── SEKTION: Betriebsdaten (vor / nach Wartung) ────────────────
function renderBetriebsdatenSektion(p, cfg) {
  const b = p.betriebsdaten;
  const hatStart = cfg.Hat_Startzaehler;

  return `
    <div class="section-card">
      <h3>Betriebsdaten</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;font-size:0.78rem;text-transform:uppercase;letter-spacing:.04em;
                       color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)">
              Wert
            </th>
            <th style="text-align:left;font-size:0.78rem;text-transform:uppercase;letter-spacing:.04em;
                       color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)">
              Vor Wartung
            </th>
            <th style="text-align:left;font-size:0.78rem;text-transform:uppercase;letter-spacing:.04em;
                       color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)">
              Nach Wartung
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;font-size:0.88rem;border-bottom:1px solid var(--border-light)">
              Betriebsstunden
            </td>
            <td style="padding:4px 8px;border-bottom:1px solid var(--border-light)">
              <div class="input-with-unit">
                <input type="number" id="pr-bstd-vor" value="${b.betriebsstunden_vorher ?? ''}"
                       min="0" step="0.1" placeholder="–">
                <span class="unit-label">h</span>
              </div>
            </td>
            <td style="padding:4px 8px;border-bottom:1px solid var(--border-light)">
              <div class="input-with-unit">
                <input type="number" id="pr-bstd-nach" value="${b.betriebsstunden_nachher ?? ''}"
                       min="0" step="0.1" placeholder="–">
                <span class="unit-label">h</span>
              </div>
            </td>
          </tr>
          ${hatStart ? `
          <tr>
            <td style="padding:8px;font-size:0.88rem;border-bottom:1px solid var(--border-light)">
              Startzähler
            </td>
            <td style="padding:4px 8px;border-bottom:1px solid var(--border-light)">
              <div class="input-with-unit">
                <input type="number" id="pr-start-vor" value="${b.startzaehler_vorher ?? ''}"
                       min="0" step="1" placeholder="–">
                <span class="unit-label">×</span>
              </div>
            </td>
            <td style="padding:4px 8px;border-bottom:1px solid var(--border-light)">
              <div class="input-with-unit">
                <input type="number" id="pr-start-nach" value="${b.startzaehler_nachher ?? ''}"
                       min="0" step="1" placeholder="–">
                <span class="unit-label">×</span>
              </div>
            </td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

// ── SEKTION: Spannungs- und Frequenzverstellung ────────────────
// Wird nur angezeigt wenn variable Spannung oder Frequenz konfiguriert ist.
// Hier trägt der Techniker die tatsächlich erreichbaren Min/Max-Werte ein.
function renderSpannungsFrequenzSektion(p, cfg) {
  const varSpannung = cfg.Generatorspannung_Typ === 'variabel';
  const varFrequenz  = cfg.Generatorfrequenz_Typ  === 'variabel';
  if (!varSpannung && !varFrequenz) return '';

  const sf = p.spannungsFrequenz || {};
  return `
    <div class="section-card">
      <h3>Spannungs- und Frequenzverstellung</h3>
      <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
        Erreichbare Min- und Max-Werte eintragen.
      </p>
      <div class="form-grid">
        ${varSpannung ? `
        <div class="form-field">
          <label>Spannung min (erreichbar)</label>
          <div class="input-with-unit">
            <input type="number" id="sf-span-min" value="${sf.spannung_min ?? ''}" step="0.1">
            <span class="unit-label">V</span>
          </div>
        </div>
        <div class="form-field">
          <label>Spannung max (erreichbar)</label>
          <div class="input-with-unit">
            <input type="number" id="sf-span-max" value="${sf.spannung_max ?? ''}" step="0.1">
            <span class="unit-label">V</span>
          </div>
        </div>` : ''}
        ${varFrequenz ? `
        <div class="form-field">
          <label>Frequenz min (erreichbar)</label>
          <div class="input-with-unit">
            <input type="number" id="sf-freq-min" value="${sf.frequenz_min ?? ''}" step="0.01">
            <span class="unit-label">Hz</span>
          </div>
        </div>
        <div class="form-field">
          <label>Frequenz max (erreichbar)</label>
          <div class="input-with-unit">
            <input type="number" id="sf-freq-max" value="${sf.frequenz_max ?? ''}" step="0.01">
            <span class="unit-label">Hz</span>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

// ── SEKTION: Probelaufprotokoll ────────────────────────────────
// Mehrere Testläufe mit unterschiedlichen Belastungen
function renderProbelaufSektion(p) {
  return `
    <div class="section-card">
      <h3>Probelaufprotokoll</h3>
      <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
        Mehrere Läufe mit verschiedenen Belastungsstufen möglich.
      </p>
      <div id="probelauf-liste">
        ${p.probelaeufe.map((lauf, i) => renderProbelaufKarte(lauf, i)).join('')}
        ${p.probelaeufe.length === 0
          ? '<p class="text-muted" style="font-size:0.85rem;padding:4px 0">Noch kein Probelauf erfasst.</p>'
          : ''}
      </div>
      <button class="btn btn-secondary" id="btn-add-probelauf" style="margin-top:var(--space-sm)">
        + Probelauf hinzufügen
      </button>
    </div>`;
}

// Eine einzelne Probelauf-Karte (expandiert)
function renderProbelaufKarte(lauf, idx) {
  const v = (feld) => lauf[feld] !== null && lauf[feld] !== undefined ? lauf[feld] : '';
  return `
    <div class="section-card" style="border-color:var(--accent);margin-bottom:var(--space-sm)"
         data-probelauf="${idx}">
      <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-md)">
        <h3 style="flex:1;margin:0;border:none;padding:0">Lauf ${idx + 1}</h3>
        <button class="btn btn-danger btn-sm pl-del" data-idx="${idx}">✕ Lauf löschen</button>
      </div>
      <div class="form-grid">
        <div class="form-field full-width">
          <label>Beschreibung / Notiz</label>
          <input type="text" class="pl-field pl-text" data-idx="${idx}" data-feld="beschreibung"
                 value="${lauf.beschreibung || ''}" placeholder="z.B. Lasttest 50%, Kaltstart…">
        </div>
        <div class="form-field">
          <label>Belastung</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="last_kw"
                   value="${v('last_kw')}" min="0" step="0.1">
            <span class="unit-label">kW</span>
          </div>
        </div>
        <div class="form-field">
          <label>Laufzeit</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="laufzeit_min"
                   value="${v('laufzeit_min')}" min="0" step="1">
            <span class="unit-label">min</span>
          </div>
        </div>
        <div class="form-field">
          <label>Spannung L1</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="spannung_l1"
                   value="${v('spannung_l1')}" step="0.1">
            <span class="unit-label">V</span>
          </div>
        </div>
        <div class="form-field">
          <label>Spannung L2</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="spannung_l2"
                   value="${v('spannung_l2')}" step="0.1">
            <span class="unit-label">V</span>
          </div>
        </div>
        <div class="form-field">
          <label>Spannung L3</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="spannung_l3"
                   value="${v('spannung_l3')}" step="0.1">
            <span class="unit-label">V</span>
          </div>
        </div>
        <div class="form-field">
          <label>Frequenz</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="frequenz"
                   value="${v('frequenz')}" step="0.01">
            <span class="unit-label">Hz</span>
          </div>
        </div>
        <div class="form-field">
          <label>Strom L1</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="strom_l1"
                   value="${v('strom_l1')}" step="0.1">
            <span class="unit-label">A</span>
          </div>
        </div>
        <div class="form-field">
          <label>Strom L2</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="strom_l2"
                   value="${v('strom_l2')}" step="0.1">
            <span class="unit-label">A</span>
          </div>
        </div>
        <div class="form-field">
          <label>Strom L3</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="strom_l3"
                   value="${v('strom_l3')}" step="0.1">
            <span class="unit-label">A</span>
          </div>
        </div>
        <div class="form-field">
          <label>Wirkleistung</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="leistung_kw"
                   value="${v('leistung_kw')}" step="0.1">
            <span class="unit-label">kW</span>
          </div>
        </div>
        <div class="form-field">
          <label>cos φ (Leistungsfaktor)</label>
          <input type="number" class="pl-field" data-idx="${idx}" data-feld="cos_phi"
                 value="${v('cos_phi')}" min="0" max="1" step="0.01"
                 placeholder="0.00 – 1.00">
        </div>
        <div class="form-field">
          <label>Öldruck</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="oeldruck_bar"
                   value="${v('oeldruck_bar')}" step="0.01">
            <span class="unit-label">bar</span>
          </div>
        </div>
        <div class="form-field">
          <label>Motortemperatur</label>
          <div class="input-with-unit">
            <input type="number" class="pl-field" data-idx="${idx}" data-feld="motortemperatur"
                   value="${v('motortemperatur')}" step="0.1">
            <span class="unit-label">°C</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ── SEKTION: Durchgeführte Arbeiten ───────────────────────────
function renderDurchgefuehrteArbeitenSektion(p, cfg) {
  const a   = p.durchgefuehrte_arbeiten;
  const chk = (id, label, wert) => `
    <div class="form-check">
      <input type="checkbox" id="da-${id}" ${wert ? 'checked' : ''}>
      <label for="da-${id}" class="check-label">${label}</label>
    </div>`;
  return `
    <div class="section-card">
      <h3>Durchgeführte Arbeiten</h3>
      <div class="form-grid">
        ${chk('elektr',   '⚡ Elektrische Wartung',        a.elektr_wartung)}
        ${chk('motor',    '🔧 Motorwartung mit Wechsel der Kraftstofffilter', a.motor_wartung)}
        ${chk('oel',      '🛢 Ölwechsel',                  a.oelwechsel)}
        ${!cfg.Keine_DGUV ? chk('dguv', '📋 DGUV-V3 Prüfung', a.dguv) : ''}
        ${chk('luft',     '🌬 Luftfilterwechsel',            a.luftfilter)}
        ${chk('kuehl_i',  '🧊 Kühlmittel intern erneuert', a.kuehlmittel_intern)}
        ${chk('kuehl_e',  '🧊 Kühlmittel extern erneuert', a.kuehlmittel_extern)}
        ${chk('zahnr',    '⚙ Zahnriemen gewechselt',       a.zahnriemenwechsel)}
      </div>
    </div>`;
}

// ── SEKTION: Batterieprüfung ───────────────────────────────────
// Pro Batteriegruppe eine Karte pro Einzelbatterie (Anzahl aus technischen Daten).
// Zeigt Prüfstrom, Säuredichte und Destilliert-Checkbox wenn nicht wartungsfrei.
function renderBatterieMessungSektion(p, cfg) {
  if (!cfg.Hat_Starterbatterien && !cfg.Hat_Steuerbatterien) return '';

  const td  = aktuellesAggregat.technische_daten || {};
  const bat = p.batterien || {};

  // Normalisiert: altes Objekt-Format → Array mit 1 Element (Rückwärtskompatibilität)
  const toArray = (wert, anzahl) => {
    if (Array.isArray(wert)) return wert;
    // Altes Format war ein einzelnes Objekt
    const leer = { leerlauf: null, belastung: null, pruefstrom: null, klemmen_ok: false, saeuredichte: null, destilliert: false };
    if (wert && typeof wert === 'object') return [Object.assign({}, leer, wert)];
    return Array.from({ length: Math.max(1, anzahl || 1) }, () => ({ ...leer }));
  };

  // HTML für eine einzelne Batterie (mit Index)
  const renderEinzel = (typ, idx, b, wartungsfrei) => {
    const pfx = `bat-${typ}-${idx}`;
    return `
      <div style="border:1px solid var(--border-light);border-radius:var(--radius-sm);
                  padding:var(--space-sm) var(--space-md);margin-bottom:var(--space-xs)">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:var(--space-sm)">
          Batterie ${idx + 1}
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label>Leerlaufspannung</label>
            <div class="input-with-unit">
              <input type="number" class="bat-field" data-typ="${typ}" data-idx="${idx}" data-feld="leerlauf"
                     value="${b.leerlauf ?? ''}" step="0.01" placeholder="–">
              <span class="unit-label">V</span>
            </div>
          </div>
          <div class="form-field">
            <label>Spannung unter Belastung</label>
            <div class="input-with-unit">
              <input type="number" class="bat-field" data-typ="${typ}" data-idx="${idx}" data-feld="belastung"
                     value="${b.belastung ?? ''}" step="0.01" placeholder="–">
              <span class="unit-label">V</span>
            </div>
          </div>
          <div class="form-field">
            <label>Prüfstrom (Belastung)</label>
            <div class="input-with-unit">
              <input type="number" class="bat-field" data-typ="${typ}" data-idx="${idx}" data-feld="pruefstrom"
                     value="${b.pruefstrom ?? ''}" step="0.1" placeholder="–">
              <span class="unit-label">A</span>
            </div>
          </div>
          ${!wartungsfrei ? `
          <div class="form-field">
            <label>Säuredichte</label>
            <div class="input-with-unit">
              <input type="number" class="bat-field" data-typ="${typ}" data-idx="${idx}" data-feld="saeuredichte"
                     value="${b.saeuredichte ?? ''}" step="0.001" placeholder="–">
              <span class="unit-label">kg/l</span>
            </div>
          </div>` : ''}
          <div class="form-field">
            <div class="form-check" style="margin-top:8px">
              <input type="checkbox" class="bat-klemmen" data-typ="${typ}" data-idx="${idx}"
                     ${b.klemmen_ok ? 'checked' : ''}>
              <label class="check-label">Anschlussklemmen in Ordnung</label>
            </div>
          </div>
          ${!wartungsfrei ? `
          <div class="form-field">
            <div class="form-check" style="margin-top:8px">
              <input type="checkbox" class="bat-destilliert" data-typ="${typ}" data-idx="${idx}"
                     ${b.destilliert ? 'checked' : ''}>
              <label class="check-label">Destilliertes Wasser nachgefüllt</label>
            </div>
          </div>` : ''}
        </div>
      </div>`;
  };

  // HTML für eine Batteriegruppe (Starter / Steuer)
  const renderGruppe = (typ, gruppenLabel, wartungsfrei, anzahl) => {
    const arr = toArray(bat[typ], anzahl);
    // Array in p.batterien aktualisieren (Länge angleichen)
    p.batterien[typ] = arr;
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius-md);
                  padding:var(--space-md);margin-bottom:var(--space-sm)">
        <div style="font-size:0.82rem;font-weight:600;text-transform:uppercase;
                    letter-spacing:.04em;color:var(--text-secondary);margin-bottom:var(--space-sm)">
          ${gruppenLabel}
        </div>
        ${arr.map((b, i) => renderEinzel(typ, i, b, wartungsfrei)).join('')}
      </div>`;
  };

  // Ladegerät-Sektion
  const lader1 = td.Batterielader1_Hersteller || td.Batterielader1_Typ
    ? `${td.Batterielader1_Hersteller || ''} ${td.Batterielader1_Typ || ''}`.trim()
    : 'Ladegerät 1';
  const lader2 = td.Batterielader2_Hersteller || td.Batterielader2_Typ
    ? `${td.Batterielader2_Hersteller || ''} ${td.Batterielader2_Typ || ''}`.trim()
    : null;

  return `
    <div class="section-card">
      <h3>Batterieprüfung</h3>
      ${cfg.Hat_Starterbatterien
        ? renderGruppe('starterbatterie', 'Starterbatterien',
            td.Wartungsfrei_Starterbatterie, td.Anzahl_Starterbatterien)
        : ''}
      ${cfg.Hat_Steuerbatterien
        ? renderGruppe('steuerbatterie', 'Steuerbatterien',
            td.Wartungsfrei_Steuerbatterie, td.Anzahl_Steuerbatterien)
        : ''}
      <div style="border:1px solid var(--border);border-radius:var(--radius-md);
                  padding:var(--space-md);margin-top:var(--space-sm)">
        <div style="font-size:0.82rem;font-weight:600;text-transform:uppercase;
                    letter-spacing:.04em;color:var(--text-secondary);margin-bottom:var(--space-sm)">
          Ladegerät
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label>${lader1} – Ladespannung</label>
            <div class="input-with-unit">
              <input type="number" id="bat-lader1" value="${(bat.lader1_ladespannung ?? '')}" step="0.01" placeholder="–">
              <span class="unit-label">V</span>
            </div>
          </div>
          ${lader2 ? `
          <div class="form-field">
            <label>${lader2} – Ladespannung</label>
            <div class="input-with-unit">
              <input type="number" id="bat-lader2" value="${(bat.lader2_ladespannung ?? '')}" step="0.01" placeholder="–">
              <span class="unit-label">V</span>
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

// ── SEKTION: Dynamische Checklisten (in konfigurierter Reihenfolge) ──
function renderChecklisteSektion(p, cfg) {
  const reihenfolge = cfg.Sektionen_Reihenfolge || [
    'Leckagewächter','Stoermeldungen','Elektrische_Pruefung',
    'Schaltanlage','Messinstrumente','Betriebsarten',
    'Elektronikgeraete','Generator','Motor_Ausstattung','Kuehlkreise',
  ];
  return reihenfolge.map(key => {
    const cs = (cfg.Eigene_Sektionen || []).find(s => s.id === key);
    if (cs) return renderEigeneSektionProtoForm(cs, p);
    return renderChkSektionEinzel(key, p, cfg);
  }).join('');
}

function renderChkSektionEinzel(key, p, cfg) {
  switch (key) {
    case 'Leckagewächter': {
      const leckage = (cfg.Leckagewächter || []).map(e =>
        typeof e === 'string' ? { name: e, unterdruck: false } : e
      );
      if (!leckage.length) return '';
      return `
        <div class="section-card">
          <h3>Leckageüberwachung</h3>
          <table class="check-table" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:45%"><col style="width:15%"><col style="width:40%"></colgroup>
            <thead><tr><th>Leckagemelder</th><th>Typ</th><th>Ergebnis</th></tr></thead>
            <tbody>
              ${leckage.map(e => {
                const wert    = p.checkliste.Leckagewächter?.[e.name];
                const zustand = typeof wert === 'object' ? (wert?.zustand || 'ng') : (wert || 'ng');
                const ud      = e.unterdruck;
                const drücke  = typeof wert === 'object' ? wert : {};
                return `
                  <tr>
                    <td class="check-label-col">${e.name}</td>
                    <td><span class="badge badge-info" style="font-size:0.72rem">${ud ? 'Unterdruck' : 'Standard'}</span></td>
                    <td>${triState('Leckagewächter', e.name, zustand)}</td>
                  </tr>
                  ${ud ? `
                  <tr>
                    <td colspan="3" style="padding:4px 8px 10px">
                      <div class="form-grid" style="margin-top:4px">
                        <div class="form-field">
                          <label>Pumpe ein</label>
                          <div class="input-with-unit">
                            <input type="number" class="ud-pressure" data-name="${e.name}" data-feld="pumpe_ein"
                                   value="${drücke.pumpe_ein ?? ''}" step="1" placeholder="–">
                            <span class="unit-label">mbar</span>
                          </div>
                        </div>
                        <div class="form-field">
                          <label>Alarm ein</label>
                          <div class="input-with-unit">
                            <input type="number" class="ud-pressure" data-name="${e.name}" data-feld="alarm_ein"
                                   value="${drücke.alarm_ein ?? ''}" step="1" placeholder="–">
                            <span class="unit-label">mbar</span>
                          </div>
                        </div>
                        <div class="form-field">
                          <label>Alarm aus</label>
                          <div class="input-with-unit">
                            <input type="number" class="ud-pressure" data-name="${e.name}" data-feld="alarm_aus"
                                   value="${drücke.alarm_aus ?? ''}" step="1" placeholder="–">
                            <span class="unit-label">mbar</span>
                          </div>
                        </div>
                        <div class="form-field">
                          <label>Pumpe aus</label>
                          <div class="input-with-unit">
                            <input type="number" class="ud-pressure" data-name="${e.name}" data-feld="pumpe_aus"
                                   value="${drücke.pumpe_aus ?? ''}" step="1" placeholder="–">
                            <span class="unit-label">mbar</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>` : ''}`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
    case 'Stoermeldungen': {
      const stoerRaw   = cfg.Stoermeldungen || [];
      const STOER_TYP  = { abstellend:'A', abstellend_verzoegert:'AV', warnend:'W' };
      const hatStoer   = stoerRaw.some(s => typeof s === 'string' || (typeof s === 'object' && s.art !== 'gruppe'));
      if (!hatStoer) return '';
      return `
        <div class="section-card">
          <h3>Störmeldungen prüfen</h3>
          <table class="check-table" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:35%"><col style="width:10%"><col style="width:25%"><col style="width:30%"></colgroup>
            <thead><tr><th>Störmeldung</th><th>Typ</th><th>Prüfhinweis</th><th>Ergebnis</th></tr></thead>
            <tbody>
              ${stoerRaw.map(s => {
                if (typeof s === 'object' && s.art === 'gruppe') {
                  return `<tr><td colspan="4" style="padding:10px 8px 4px;font-size:0.78rem;font-weight:700;
                            text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);
                            border-top:1px solid var(--border)">${s.titel || 'Gruppe'}</td></tr>`;
                }
                const sm = typeof s === 'string' ? { name: s, typ: 'abstellend', pruefhinweis: '' } : s;
                const stoerKey = sm.name + '__' + (sm.typ || 'abstellend');
                return `
                  <tr>
                    <td class="check-label-col">${sm.name}</td>
                    <td><span class="badge badge-muted">${STOER_TYP[sm.typ] || sm.typ}</span></td>
                    <td style="font-size:0.78rem;color:var(--text-secondary)">${sm.pruefhinweis || '–'}</td>
                    <td>${triState('Stoermeldungen', stoerKey, p.checkliste.Stoermeldungen?.[stoerKey] || 'ng')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
    case 'Temperaturen_Heizung': {
      const th = cfg.Temperaturen_Heizung || {};
      const t  = p.temperaturen || {};
      const ck = p.checkliste.Temperaturen_Heizung || {};
      const rows = [];
      // Außentemperatur – immer vorhanden
      rows.push(`
        <tr>
          <td class="check-label-col">Außentemperatur</td>
          <td></td>
          <td><div class="input-with-unit" style="max-width:130px">
            <input type="number" class="temp-field" data-feld="aussentemperatur"
                   value="${t.aussentemperatur ?? ''}" step="0.1" placeholder="–">
            <span class="unit-label">°C</span>
          </div></td>
        </tr>`);
      if (th.motorvorwaermung?.aktiv) rows.push(`
        <tr>
          <td class="check-label-col">Motorvorwärmung</td>
          <td>${triState('Temperaturen_Heizung','motorvorwaermung', ck.motorvorwaermung||'ng')}</td>
          <td><div class="input-with-unit" style="max-width:130px">
            <input type="number" class="temp-field" data-feld="motorvorwaermung_temp"
                   value="${t.motorvorwaermung_temp ?? ''}" step="0.1" placeholder="–">
            <span class="unit-label">°C</span>
          </div></td>
        </tr>`);
      if (th.kraftstoffvorwaerm?.aktiv) rows.push(`
        <tr>
          <td class="check-label-col">Kraftstoffvorwärmung</td>
          <td>${triState('Temperaturen_Heizung','kraftstoffvorwaerm', ck.kraftstoffvorwaerm||'ng')}</td>
          <td></td>
        </tr>`);
      if (th.raumheizung?.aktiv) rows.push(`
        <tr>
          <td class="check-label-col">Raumheizung</td>
          <td>${triState('Temperaturen_Heizung','raumheizung', ck.raumheizung||'ng')}</td>
          <td></td>
        </tr>`);
      if (th.raumtemperatur?.aktiv) rows.push(`
        <tr>
          <td class="check-label-col">Raumtemperatur</td>
          <td></td>
          <td><div class="input-with-unit" style="max-width:130px">
            <input type="number" class="temp-field" data-feld="raumtemperatur"
                   value="${t.raumtemperatur ?? ''}" step="0.1" placeholder="–">
            <span class="unit-label">°C</span>
          </div></td>
        </tr>`);
      return `
        <div class="section-card">
          <h3>Temperaturen / Heizung</h3>
          <table class="check-table" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:38%"><col style="width:37%"><col style="width:25%"></colgroup>
            <thead><tr><th>Bezeichnung</th><th>Ergebnis</th><th>Temperatur</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>`;
    }
    case 'Schaltanlage': {
      const SCHALT = {
        hupe:'Signalhorn (Hupe)', notaus:'NOT-AUS Schalter',
        potfrei:'Potentialfreie Meldungen', lastprobe:'Lastprobeschalter',
        stoerungen:'Anzeige für Störmeldungen', beleuchtng:'Beleuchtung (Schaltanlage)',
        beleuchtngagg:'Beleuchtung (Aggregat)',
        genschalter:'Generatorschalter', netzschalter:'Netzschalter', ueberwachung:'Überwachungseinrichtung',
      };
      const punkte = aktivePunkte(cfg.Schaltanlage, SCHALT);
      return punkte.length ? renderCheckTabelle('Schaltanlage', punkte,
        'Schaltanlage', p.checkliste.Schaltanlage || {}) : '';
    }
    case 'Messinstrumente': {
      const MESS = {
        pf:'cos φ', sp:'Spannung', nullsp:'Nullspannung', str:'Strom',
        umsch:'Messstellenumschalter (Netz/Gen)', umschL123:'Umschalter L1/L2/L3',
        freq:'Frequenz', leist:'Leistung (kW)', batlad:'Batterieladestrom',
        batsp:'Batterieladespannung', kwtemp:'KW-Temperatur',
        kraftst:'Kraftstoffvorrat', oeldruck:'Öldruck', drehz:'Drehzahl',
      };
      const punkte = aktivePunkte(cfg.Messinstrumente, MESS);
      return punkte.length ? renderCheckTabelle('Messinstrumente', punkte,
        'Messinstrumente', p.checkliste.Messinstrumente || {}) : '';
    }
    case 'Betriebsarten': {
      const BETR = { handbetrieb:'Handbetrieb', testbetrieb:'Testbetrieb',
        automatikbetrieb:'Automatikbetrieb', lastprobebetrieb:'Lastprobebetrieb' };
      const punkte = aktivePunkte(cfg.Betriebsarten, BETR);
      return punkte.length ? renderCheckTabelle('Betriebsarten', punkte,
        'Betriebsarten', p.checkliste.Betriebsarten || {}) : '';
    }
    case 'Elektronikgeraete': {
      const ELEK_G = { uebestromrelais:'Überstromrelais', kurzschlussrelais:'Kurzschlussrelais',
        synchronisiergeraet:'Synchronisiergerät' };
      const punkte = aktivePunkte(cfg.Elektronikgeraete, ELEK_G);
      return punkte.length ? renderCheckTabelle('Elektronikgeräte', punkte,
        'Elektronikgeraete', p.checkliste.Elektronikgeraete || {}) : '';
    }
    case 'Generator': {
      const GEN = { drehfeld:'Drehfeld', spannungsregler:'Spannungsregler',
        leistungsfaktorregler:'Leistungsfaktorregler', anschluesse:'Anschlüsse' };
      const punkte = aktivePunkte(cfg.Generator, GEN);
      return punkte.length ? renderCheckTabelle('Generator', punkte,
        'Generator', p.checkliste.Generator || {}) : '';
    }
    case 'Motor_Ausstattung': {
      const MOTOR = {
        lima:'Lichtmaschine', anlass:'Anlasser', abgas:'Abgasanlage',
        luftfilter:'Luftfilter', oelbad:'Ölbadluftfilter',
        abstell:'Abstell- / Freigabemagnet', vorglueh:'Vorglühanlage',
        kuehler:'Kühler', luefter:'Lüfter', keilriemen:'Keilriemen',
        schlaeuche:'Kühlerschläuche', lager:'Motor- und Generatorlager',
        befestigung:'Befestigungen',
        kraftstoffleitungen:'Kraftstoffleitungen / -schläuche',
      };
      const punkte = aktivePunkte(cfg.Motor_Ausstattung, MOTOR);
      return punkte.length ? renderCheckTabelle('Motor-Ausstattung', punkte,
        'Motor_Ausstattung', p.checkliste.Motor_Ausstattung || {}) : '';
    }
    case 'Kuehlkreise': {
      const KK_LABELS = { motorkreis:'Motorkühlkreis', intern:'Interner Kühlkreis',
        extern:'Externer Kühlkreis', ladeluftkreis:'Ladeluftkühlkreis' };
      const kkAktiv = Object.keys(cfg.Kuehlkreise || {})
        .filter(k => cfg.Kuehlkreise[k]?.aktiv)
        .map(k => ({ key: k, label: KK_LABELS[k] || k }));
      if (!kkAktiv.length) return '';
      return `
        <div class="section-card">
          <h3>Kühlkreise</h3>
          <table class="check-table" style="table-layout:fixed;width:100%">
            <colgroup><col style="width:33%"><col style="width:34%"><col style="width:33%"></colgroup>
            <thead><tr><th>Kühlkreis</th><th>Zustand</th><th>Frostschutz bis</th></tr></thead>
            <tbody>
              ${kkAktiv.map(kk => {
                const wert = p.checkliste.Kuehlkreise?.[kk.key] || { zustand: 'ng', frostschutz: null };
                return `
                  <tr>
                    <td class="check-label-col">${kk.label}</td>
                    <td>${triState('Kuehlkreise', kk.key + '_zustand', wert.zustand)}</td>
                    <td>
                      <div class="input-with-unit" style="max-width:120px">
                        <input type="number" class="kk-frost-input" data-kk="${kk.key}"
                               value="${wert.frostschutz ?? ''}"
                               placeholder="z.B. -27" step="1"
                               style="background:var(--bg-input);border:1px solid var(--border);
                                      border-radius:var(--radius-sm) 0 0 var(--radius-sm);
                                      color:var(--text-primary);padding:6px 8px;width:100%">
                        <span class="unit-label">°C</span>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
    case 'Ausstattung': {
      const AUSSTATTUNG = {
        haupttank: '(Haupt-)Tank',
        tagestank: 'Tagestank',
        tankleitungen: 'Tankleitungen',
        kraftstoffpumpe: 'Kraftstoffpumpe',
        sauberkeit: 'Sauberkeit Raum/Aggregat',
      };
      const punkte = aktivePunkte(cfg.Ausstattung, AUSSTATTUNG);
      return punkte.length ? renderCheckTabelle('Ausstattung', punkte,
        'Ausstattung', p.checkliste.Ausstattung || {}) : '';
    }
    default: return '';
  }
}

// ── Eigene Rubrik im Protokoll-Formular rendern ────────────────
function renderEigeneSektionProtoForm(cs, p) {
  if (!cs.elemente?.length) return `
    <div class="section-card">
      <h3>${cs.titel || 'Eigene Gruppe'}</h3>
      <p class="text-muted" style="font-size:0.85rem">Keine Elemente konfiguriert.</p>
    </div>`;
  const werte = (p.eigene_sektionen || {})[cs.id] || {};
  const rows = cs.elemente.map(el => {
    if (el.typ === 'gruppe') {
      return `
        <tr>
          <td colspan="3" style="padding:10px 8px 4px;font-size:0.78rem;font-weight:700;
            text-transform:uppercase;letter-spacing:.05em;color:var(--accent);
            border-top:1px solid var(--border)">${el.label || 'Gruppe'}</td>
        </tr>`;
    }
    if (el.typ === 'checkbox') {
      const wert = werte[el.id] || 'ng';
      const nm   = `esek_${cs.id}_${el.id}`;
      return `
        <tr>
          <td class="check-label-col">${el.label}</td>
          <td colspan="2">
            <div class="tri-state esek-tristate" data-sek="${cs.id}" data-el="${el.id}">
              <input type="radio" name="${nm}" id="${nm}_ok"     value="ok"     ${wert==='ok'    ?'checked':''}>
              <label for="${nm}_ok">✓ OK</label>
              <input type="radio" name="${nm}" id="${nm}_mangel" value="mangel" ${wert==='mangel'?'checked':''}>
              <label for="${nm}_mangel">✗ Mangel</label>
              <input type="radio" name="${nm}" id="${nm}_ng"     value="ng"     ${wert==='ng'    ?'checked':''}>
              <label for="${nm}_ng">— N.G.</label>
            </div>
          </td>
        </tr>`;
    }
    if (el.typ === 'messung') {
      const wert = werte[el.id] ?? '';
      return `
        <tr>
          <td class="check-label-col">${el.label}</td>
          <td>
            <div class="input-with-unit">
              <input type="number" class="esek-messung" data-sek="${cs.id}" data-el="${el.id}"
                     value="${wert}" step="0.01" placeholder="–">
              ${el.einheit ? `<span class="unit-label">${el.einheit}</span>` : ''}
            </div>
          </td>
          <td></td>
        </tr>`;
    }
    if (el.typ === 'text') {
      const wert = (werte[el.id] ?? '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td class="check-label-col">${el.label}</td>
          <td colspan="2">
            <input type="text" class="esek-text" data-sek="${cs.id}" data-el="${el.id}"
                   value="${wert}" placeholder="–"
                   style="width:100%;background:var(--bg-input);border:1px solid var(--border);
                          border-radius:var(--radius-sm);color:var(--text-primary);padding:6px 8px">
          </td>
        </tr>`;
    }
    return '';
  }).join('');
  return `
    <div class="section-card">
      <h3>${cs.titel || 'Eigene Gruppe'}</h3>
      <table class="check-table" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:40%"><col style="width:35%"><col style="width:25%"></colgroup>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── SEKTION: Mängel ────────────────────────────────────────────
function renderMaengelSektion(p) {
  return `
    <div class="section-card">
      <h3>Mängel / Feststellungen</h3>
      <div id="maengel-liste">${renderMaengelListe(p.maengel)}</div>
      <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-sm);flex-wrap:wrap">
        <input type="text" id="mangel-text" placeholder="Mangel beschreiben…"
               style="flex:1;min-width:150px;background:var(--bg-input);border:1px solid var(--border);
                      border-radius:var(--radius-sm);color:var(--text-primary);padding:8px 10px">
        <select id="mangel-prio"
                style="background:var(--bg-input);border:1px solid var(--border);
                       border-radius:var(--radius-sm);color:var(--text-primary);padding:8px 10px">
          <option value="niedrig">Niedrig</option>
          <option value="mittel" selected>Mittel</option>
          <option value="hoch">Hoch</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="btn-add-mangel">+ Mangel</button>
      </div>
    </div>`;
}

function renderMaengelListe(maengel) {
  if (!maengel?.length) return '<p class="text-muted" style="font-size:0.85rem">Keine Mängel erfasst.</p>';
  return maengel.map((m, i) => `
    <div class="mangel-item">
      <div class="mangel-info">
        <span class="mangel-prio mangel-prio-${m.prioritaet}">${m.prioritaet.toUpperCase()}</span>
        <span style="margin-left:8px">${m.beschreibung}</span>
      </div>
      <button class="btn btn-danger btn-sm" data-del-mangel="${i}">✕</button>
    </div>`).join('');
}

// ── SEKTION: Ergebnis ──────────────────────────────────────────
function renderErgebnisSektion(p) {
  return `
    <div class="section-card">
      <h3>Gesamtergebnis</h3>
      <div class="ergebnis-group" id="ergebnis-group">
        <button class="ergebnis-btn ${p.ergebnis==='in_ordnung'    ?'selected-ok':''}"    data-ergebnis="in_ordnung">✓ In Ordnung</button>
        <button class="ergebnis-btn ${p.ergebnis==='fehler_behoben'?'selected-behoben':''}" data-ergebnis="fehler_behoben">🔧 Fehler behoben</button>
        <button class="ergebnis-btn ${p.ergebnis==='fehler_offen'  ?'selected-offen':''}"  data-ergebnis="fehler_offen">✗ Fehler offen</button>
      </div>
    </div>

    <div class="section-card">
      <h3>Bemerkungen</h3>
      <div class="form-field">
        <textarea id="pr-bemerkung" style="min-height:90px"
                  placeholder="Sonstige Hinweise, Empfehlungen, Beobachtungen…">${p.bemerkung || ''}</textarea>
      </div>
    </div>

      <div class="section-card">
        <h3>Nächste Prüfung</h3>
        <div class="form-field" style="max-width:220px">
          <label for="pr-naechste">Monat / Jahr</label>
          <input type="month" id="pr-naechste" value="${p.naechste_pruefung || defaultNaechstePruefung()}">
        </div>
      </div>`;
}

// ── Nächste Prüfung: Default = aktueller Monat + 1 Jahr ────────
function defaultNaechstePruefung() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

// ── SEKTION: Nächste Wartung – geplante Arbeiten ───────────────
function renderNaechsteWartungSektion(p, cfg) {
  const a   = p.naechste_arbeiten || {};
  const chk = (id, label, wert) => `
    <div class="form-check">
      <input type="checkbox" id="na-${id}" ${wert ? 'checked' : ''}>
      <label for="na-${id}" class="check-label">${label}</label>
    </div>`;
  return `
    <div class="section-card" style="border-color:var(--info)">
      <h3 style="color:var(--info)">Nächste Wartung – geplante Arbeiten</h3>
      <p class="text-muted" style="font-size:0.82rem;margin-bottom:var(--space-sm)">
        Was soll beim nächsten Termin erledigt werden?
      </p>
      <div class="form-grid">
        ${chk('na-elektr',  '⚡ Elektrische Wartung',        a.elektr_wartung)}
        ${chk('na-motor',   '🔧 Motorwartung mit Wechsel der Kraftstofffilter', a.motor_wartung)}
        ${chk('na-oel',     '🛢 Ölwechsel',                  a.oelwechsel)}
        ${!cfg.Keine_DGUV ? chk('na-dguv', '📋 DGUV-V3 Prüfung', a.dguv) : ''}
        ${chk('na-luft',    '🌬 Luftfilterwechsel',            a.luftfilter)}
        ${chk('na-kuehl_i', '🧊 Kühlmittel intern erneuern', a.kuehlmittel_intern)}
        ${chk('na-kuehl_e', '🧊 Kühlmittel extern erneuern', a.kuehlmittel_extern)}
        ${chk('na-zahnr',   '⚙ Zahnriemen wechseln',         a.zahnriemenwechsel)}
      </div>
    </div>`;
}

// ── SEKTION: Betriebsart beim Verlassen ───────────────────────
function renderBetriebsartVerlassenSektion(p) {
  const akt = p.verlassen_in_betriebsart || '';
  const btn = (wert, label, klasse) => `
    <button class="ergebnis-btn ${akt === wert ? klasse : ''}"
            data-betriebsart="${wert}">${label}</button>`;
  return `
    <div class="section-card">
      <h3>Aggregat verlassen in Betriebsart</h3>
      <div class="ergebnis-group" id="betriebsart-group">
        ${btn('auto',    '🔄 Automatik',  'selected-ok')}
        ${btn('manuell', '✋ Manuell',    'selected-behoben')}
        ${btn('aus',     '⏹ Aus',         'selected-offen')}
      </div>
    </div>`;
}

// ── Hilfsfunktionen ────────────────────────────────────────────
function aktivePunkte(gruppe, labels) {
  if (!gruppe) return [];
  const standard = Object.keys(gruppe)
    .filter(k => k !== '_eigen' && gruppe[k]?.aktiv)
    .map(k => ({ key: k, label: labels[k] || k }));
  const eigen = (gruppe._eigen || []).map(e => ({ key: 'eigen_' + e.key, label: e.label }));
  return [...standard, ...eigen];
}

function renderCheckTabelle(titel, punkte, gruppe, werte) {
  return `
    <div class="section-card">
      <h3>${titel}</h3>
      <table class="check-table" style="table-layout:fixed;width:100%">
        <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
        <thead><tr><th>Prüfpunkt</th><th>Ergebnis</th></tr></thead>
        <tbody>
          ${punkte.map(p => `
            <tr>
              <td class="check-label-col">${p.label}</td>
              <td>${triState(gruppe, p.key, werte[p.key] || 'ng')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function triState(gruppe, key, wert) {
  const name = `chk_${gruppe}_${key}`;
  return `
    <div class="tri-state" data-gruppe="${gruppe}" data-key="${key}">
      <input type="radio" name="${name}" id="${name}_ok"     value="ok"     ${wert==='ok'     ? 'checked':''}>
      <label for="${name}_ok">✓ OK</label>
      <input type="radio" name="${name}" id="${name}_mangel" value="mangel" ${wert==='mangel' ? 'checked':''}>
      <label for="${name}_mangel">✗ Mangel</label>
      <input type="radio" name="${name}" id="${name}_ng"     value="ng"     ${wert==='ng'     ? 'checked':''}>
      <label for="${name}_ng">— N.G.</label>
    </div>`;
}

// ── Event-Listener ─────────────────────────────────────────────
function einrichtenErgebnisButtons(p) {
  document.getElementById('ergebnis-group').addEventListener('click', e => {
    const btn = e.target.closest('[data-ergebnis]');
    if (!btn) return;
    p.ergebnis = btn.dataset.ergebnis;
    document.querySelectorAll('.ergebnis-btn').forEach(b => b.classList.remove('selected-ok','selected-behoben','selected-offen'));
    const kl = { in_ordnung:'selected-ok', fehler_behoben:'selected-behoben', fehler_offen:'selected-offen' };
    btn.classList.add(kl[p.ergebnis]);
  });
}

function einrichtenBetriebsartButtons(p) {
  document.getElementById('betriebsart-group').addEventListener('click', e => {
    const btn = e.target.closest('[data-betriebsart]');
    if (!btn) return;
    p.verlassen_in_betriebsart = btn.dataset.betriebsart;
    document.querySelectorAll('[data-betriebsart]').forEach(b => b.classList.remove('selected-ok','selected-behoben','selected-offen'));
    const kl = { auto:'selected-ok', manuell:'selected-behoben', aus:'selected-offen' };
    btn.classList.add(kl[p.verlassen_in_betriebsart]);
  });
}

function einrichtenMaengelLogik(p) {
  document.getElementById('btn-add-mangel').addEventListener('click', () => {
    const text = document.getElementById('mangel-text').value.trim();
    const prio = document.getElementById('mangel-prio').value;
    if (!text) { toast('Bitte einen Mangel beschreiben', 'error'); return; }
    p.maengel.push({ beschreibung: text, prioritaet: prio, behoben: false });
    document.getElementById('maengel-liste').innerHTML = renderMaengelListe(p.maengel);
    einrichtenMaengelLoeschen(p);
    document.getElementById('mangel-text').value = '';
    document.getElementById('mangel-text').focus();
  });
  einrichtenMaengelLoeschen(p);
}

function einrichtenMaengelLoeschen(p) {
  document.querySelectorAll('[data-del-mangel]').forEach(btn => {
    btn.addEventListener('click', () => {
      p.maengel.splice(parseInt(btn.dataset.delMangel), 1);
      document.getElementById('maengel-liste').innerHTML = renderMaengelListe(p.maengel);
      einrichtenMaengelLoeschen(p);
    });
  });
}

function einrichtenProbelaufLogik(p) {
  // Neuen Lauf hinzufügen
  document.getElementById('btn-add-probelauf').addEventListener('click', () => {
    p.probelaeufe.push({
      beschreibung: '',
      last_kw: null, laufzeit_min: null,
      spannung_l1: null, spannung_l2: null, spannung_l3: null,
      frequenz: null, strom_l1: null, strom_l2: null, strom_l3: null,
      leistung_kw: null, cos_phi: null, oeldruck_bar: null, motortemperatur: null,
    });
    const liste = document.getElementById('probelauf-liste');
    // "Noch kein Lauf"-Hinweis entfernen
    liste.querySelectorAll('p').forEach(el => el.remove());
    const div = document.createElement('div');
    div.innerHTML = renderProbelaufKarte(p.probelaeufe[p.probelaeufe.length - 1], p.probelaeufe.length - 1);
    liste.appendChild(div.firstElementChild);
    einrichtenProbelaufFelder();
    einrichtenProbelaufLoeschen(p);
  });

  einrichtenProbelaufFelder();
  einrichtenProbelaufLoeschen(p);
}

// Felder in Probelauf-Karten live in das Objekt schreiben
function einrichtenProbelaufFelder() {
  document.querySelectorAll('.pl-field').forEach(input => {
    input.oninput = () => {
      const idx  = parseInt(input.dataset.idx);
      const feld = input.dataset.feld;
      if (aktuellesProtokoll.probelaeufe[idx]) {
        if (input.classList.contains('pl-text')) {
          aktuellesProtokoll.probelaeufe[idx][feld] = input.value;
        } else {
          aktuellesProtokoll.probelaeufe[idx][feld] = input.value === '' ? null : parseFloat(input.value);
        }
      }
    };
  });
}

function einrichtenProbelaufLoeschen(p) {
  document.querySelectorAll('.pl-del').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      p.probelaeufe.splice(idx, 1);
      // Gesamte Probelauf-Sektion neu rendern
      const container = document.getElementById('protokoll-form-body');
      const section   = container.querySelector('[data-probelauf]')?.closest('.section-card') || null;
      // Einfacher: gesamten Probelauf-Block neu zeichnen
      const altBlock = document.getElementById('probelauf-liste').closest('.section-card');
      if (altBlock) altBlock.outerHTML = renderProbelaufSektion(p).trim();
      einrichtenProbelaufLogik(p);
    };
  });
}

// ── Formulardaten auslesen ─────────────────────────────────────
function formularWerteEinlesen() {
  const p = aktuellesProtokoll;

  // Datum
  p.datum = document.getElementById('pr-datum')?.value || p.datum;

  // Meta
  p.meta.techniker  = document.getElementById('pr-techniker')?.value  || '';
  p.meta.auftrag_nr = document.getElementById('pr-auftrag')?.value    || '';
  p.meta.kunde      = document.getElementById('pr-kunde')?.value      || '';
  p.meta.standort   = document.getElementById('pr-standort')?.value   || '';

  // Betriebsdaten
  const num = id => { const el = document.getElementById(id); return el && el.value !== '' ? parseFloat(el.value) : null; };
  p.betriebsdaten.betriebsstunden_vorher  = num('pr-bstd-vor');
  p.betriebsdaten.betriebsstunden_nachher = num('pr-bstd-nach');
  p.betriebsdaten.startzaehler_vorher     = num('pr-start-vor');
  p.betriebsdaten.startzaehler_nachher    = num('pr-start-nach');

  // Batterieprüfung – Arrays (je Einzelbatterie)
  if (!p.batterien) p.batterien = {};
  document.querySelectorAll('.bat-field').forEach(input => {
    const typ  = input.dataset.typ;
    const idx  = parseInt(input.dataset.idx);
    const feld = input.dataset.feld;
    if (!Array.isArray(p.batterien[typ])) p.batterien[typ] = [];
    if (!p.batterien[typ][idx]) p.batterien[typ][idx] = {};
    p.batterien[typ][idx][feld] = input.value === '' ? null : parseFloat(input.value);
  });
  document.querySelectorAll('.bat-klemmen').forEach(cb => {
    const typ = cb.dataset.typ;
    const idx = parseInt(cb.dataset.idx);
    if (!Array.isArray(p.batterien[typ])) p.batterien[typ] = [];
    if (!p.batterien[typ][idx]) p.batterien[typ][idx] = {};
    p.batterien[typ][idx].klemmen_ok = cb.checked;
  });
  document.querySelectorAll('.bat-destilliert').forEach(cb => {
    const typ = cb.dataset.typ;
    const idx = parseInt(cb.dataset.idx);
    if (!Array.isArray(p.batterien[typ])) p.batterien[typ] = [];
    if (!p.batterien[typ][idx]) p.batterien[typ][idx] = {};
    p.batterien[typ][idx].destilliert = cb.checked;
  });
  p.batterien.lader1_ladespannung = num('bat-lader1');
  p.batterien.lader2_ladespannung = num('bat-lader2');

  // Spannungs-/Frequenzverstellung
  if (!p.spannungsFrequenz) p.spannungsFrequenz = {};
  p.spannungsFrequenz.spannung_min = num('sf-span-min');
  p.spannungsFrequenz.spannung_max = num('sf-span-max');
  p.spannungsFrequenz.frequenz_min = num('sf-freq-min');
  p.spannungsFrequenz.frequenz_max = num('sf-freq-max');

  // Probeläufe – Felder werden bereits live über einrichtenProbelaufFelder() geschrieben

  // Durchgeführte Arbeiten
  const chk = (id) => document.getElementById(id)?.checked || false;
  p.durchgefuehrte_arbeiten.elektr_wartung     = chk('da-elektr');
  p.durchgefuehrte_arbeiten.motor_wartung      = chk('da-motor');
  p.durchgefuehrte_arbeiten.oelwechsel         = chk('da-oel');
  p.durchgefuehrte_arbeiten.dguv               = chk('da-dguv');
  p.durchgefuehrte_arbeiten.luftfilter         = chk('da-luft');
  p.durchgefuehrte_arbeiten.kuehlmittel_intern = chk('da-kuehl_i');
  p.durchgefuehrte_arbeiten.kuehlmittel_extern = chk('da-kuehl_e');
  p.durchgefuehrte_arbeiten.zahnriemenwechsel  = chk('da-zahnr');

  // Checkliste (Tri-State Radios)
  document.querySelectorAll('.tri-state').forEach(el => {
    const gruppe  = el.dataset.gruppe;
    const key     = el.dataset.key;
    const radio   = el.querySelector('input[type="radio"]:checked');
    if (!radio) return;
    if (gruppe === 'Kuehlkreise') {
      const kkKey = key.replace('_zustand', '');
      if (!p.checkliste.Kuehlkreise) p.checkliste.Kuehlkreise = {};
      if (!p.checkliste.Kuehlkreise[kkKey]) p.checkliste.Kuehlkreise[kkKey] = {};
      p.checkliste.Kuehlkreise[kkKey].zustand = radio.value;
    } else {
      if (!p.checkliste[gruppe]) p.checkliste[gruppe] = {};
      const vorher = p.checkliste[gruppe][key];
      // Wenn der Wert ein Objekt ist (z.B. Unterdruckwächter), nur .zustand setzen
      if (typeof vorher === 'object' && vorher !== null) {
        vorher.zustand = radio.value;
      } else {
        p.checkliste[gruppe][key] = radio.value;
      }
    }
  });

  // Unterdruckwächter: 4 Druckwerte lesen
  document.querySelectorAll('.ud-pressure').forEach(input => {
    const name = input.dataset.name;
    const feld = input.dataset.feld;
    if (!p.checkliste.Leckagewächter) p.checkliste.Leckagewächter = {};
    if (!p.checkliste.Leckagewächter[name] || typeof p.checkliste.Leckagewächter[name] === 'string') return;
    p.checkliste.Leckagewächter[name][feld] = input.value === '' ? null : parseFloat(input.value);
  });

  // Frostschutz-Temperaturen
  document.querySelectorAll('.kk-frost-input').forEach(input => {
    const kkKey = input.dataset.kk;
    if (!p.checkliste.Kuehlkreise) p.checkliste.Kuehlkreise = {};
    if (!p.checkliste.Kuehlkreise[kkKey]) p.checkliste.Kuehlkreise[kkKey] = {};
    p.checkliste.Kuehlkreise[kkKey].frostschutz = input.value === '' ? null : parseFloat(input.value);
  });

  // Temperaturen
  if (!p.temperaturen) p.temperaturen = {};
  document.querySelectorAll('.temp-field').forEach(input => {
    p.temperaturen[input.dataset.feld] = input.value === '' ? null : parseFloat(input.value);
  });

  // Eigene Rubriken
  if (!p.eigene_sektionen) p.eigene_sektionen = {};
  document.querySelectorAll('.esek-tristate').forEach(el => {
    const sek   = el.dataset.sek;
    const elId  = el.dataset.el;
    const radio = el.querySelector('input[type="radio"]:checked');
    if (!radio) return;
    if (!p.eigene_sektionen[sek]) p.eigene_sektionen[sek] = {};
    p.eigene_sektionen[sek][elId] = radio.value;
  });
  document.querySelectorAll('.esek-messung').forEach(input => {
    const sek  = input.dataset.sek;
    const elId = input.dataset.el;
    if (!p.eigene_sektionen[sek]) p.eigene_sektionen[sek] = {};
    p.eigene_sektionen[sek][elId] = input.value === '' ? null : parseFloat(input.value);
  });
  document.querySelectorAll('.esek-text').forEach(input => {
    const sek  = input.dataset.sek;
    const elId = input.dataset.el;
    if (!p.eigene_sektionen[sek]) p.eigene_sektionen[sek] = {};
    p.eigene_sektionen[sek][elId] = input.value;
  });

  // Nächste Arbeiten
  if (!p.naechste_arbeiten) p.naechste_arbeiten = {};
  p.naechste_arbeiten.elektr_wartung     = chk('na-na-elektr');
  p.naechste_arbeiten.motor_wartung      = chk('na-na-motor');
  p.naechste_arbeiten.oelwechsel         = chk('na-na-oel');
  p.naechste_arbeiten.dguv               = chk('na-na-dguv');
  p.naechste_arbeiten.luftfilter         = chk('na-na-luft');
  p.naechste_arbeiten.kuehlmittel_intern = chk('na-na-kuehl_i');
  p.naechste_arbeiten.kuehlmittel_extern = chk('na-na-kuehl_e');
  p.naechste_arbeiten.zahnriemenwechsel  = chk('na-na-zahnr');

  // Bemerkung & Termine
  p.bemerkung         = document.getElementById('pr-bemerkung')?.value || '';
  p.naechste_pruefung = document.getElementById('pr-naechste')?.value  || '';
  // verlassen_in_betriebsart wird live über einrichtenBetriebsartButtons gesetzt
}

// ── Vollständigkeits-Prüfung ────────────────────────────────────
function vollstaendigkeitsPruefung(p, cfg) {
  const blocking = [];
  const warnings = [];

  // ── Blockierende Pflichtfelder ─────────────────────────────
  if (!p.meta.techniker) blocking.push('Techniker');
  if (!p.meta.auftrag_nr) blocking.push('Projektnummer');

  const b = p.betriebsdaten || {};
  if (b.betriebsstunden_vorher === null || b.betriebsstunden_vorher === '')
    blocking.push('Betriebsstunden VOR der Wartung');
  if (b.betriebsstunden_nachher === null || b.betriebsstunden_nachher === '')
    blocking.push('Betriebsstunden NACH der Wartung');

  // ── Warnungen: Checklisten-Einträge auf 'ng' ───────────────
  function sammleNg(gruppe, labelPrefix) {
    const items = p.checkliste?.[gruppe] || {};
    Object.entries(items).forEach(([key, val]) => {
      if (typeof val === 'string' && val === 'ng') {
        const anzeige = key.includes('__') ? key.split('__')[0] : key;
        warnings.push(`${labelPrefix}: ${anzeige}`);
      } else if (typeof val === 'object' && val !== null && val.zustand === 'ng') {
        warnings.push(`${labelPrefix}: ${key}`);
      }
    });
  }

  sammleNg('Stoermeldungen', 'Störmeldung');
  sammleNg('Temperaturen_Heizung', 'Temp./Heizung');
  sammleNg('Schaltanlage', 'Schaltanlage');
  sammleNg('Messinstrumente', 'Messinstrument');
  sammleNg('Betriebsarten', 'Betriebsart');
  sammleNg('Elektronikgeraete', 'Elektronikgerät');
  sammleNg('Generator', 'Generator');
  sammleNg('Motor_Ausstattung', 'Motor-Ausstattung');
  sammleNg('Ausstattung', 'Ausstattung');

  // Leckagewächter
  const leck = p.checkliste?.Leckagewächter || {};
  Object.entries(leck).forEach(([name, val]) => {
    const zustand = typeof val === 'object' ? val?.zustand : val;
    if (zustand === 'ng') warnings.push(`Leckagewächter: ${name}`);
  });

  // Kühlkreise
  const kk = p.checkliste?.Kuehlkreise || {};
  Object.entries(kk).forEach(([key, val]) => {
    if (val?.zustand === 'ng') warnings.push(`Kühlkreis: ${key}`);
  });

  // ── Eigene Rubriken ────────────────────────────────────────
  Object.entries(p.eigene_sektionen || {}).forEach(([sekId, felder]) => {
    const cs = (cfg.Eigene_Sektionen || []).find(s => s.id === sekId);
    Object.entries(felder || {}).forEach(([elId, wert]) => {
      if (wert === 'ng') {
        const elDef = cs?.elemente?.find(e => e.id === elId);
        warnings.push(`${cs?.titel || sekId}: ${elDef?.label || elId}`);
      }
    });
  });

  // ── Batteriemessungen ──────────────────────────────────────
  if (cfg.Hat_Starterbatterien || cfg.Hat_Steuerbatterien) {
    const bat = p.batterien || {};
    ['starterbatterie', 'steuerbatterie'].forEach(typ => {
      const arr = bat[typ] || [];
      arr.forEach((batt, idx) => {
        if (batt.leerlauf === null || batt.leerlauf === '')
          warnings.push(`${typ === 'starterbatterie' ? 'Starter' : 'Steuer'}-Batterie ${idx+1}: Leerlaufspannung`);
        if (batt.belastung === null || batt.belastung === '')
          warnings.push(`${typ === 'starterbatterie' ? 'Starter' : 'Steuer'}-Batterie ${idx+1}: Belastungsspannung`);
        if (batt.pruefstrom === null || batt.pruefstrom === '')
          warnings.push(`${typ === 'starterbatterie' ? 'Starter' : 'Steuer'}-Batterie ${idx+1}: Prüfstrom`);
      });
    });
    if (bat.lader1_ladespannung === null || bat.lader1_ladespannung === '')
      warnings.push('Ladegerät 1: Ladespannung');
    if (bat.lader2_ladespannung === null || bat.lader2_ladespannung === '')
      warnings.push('Ladegerät 2: Ladespannung');
  }

  // ── Temperaturmessungen ────────────────────────────────────
  const temp = p.temperaturen || {};
  if (temp.aussentemperatur === null || temp.aussentemperatur === '')
    warnings.push('Außentemperatur');
  if (cfg.Temperaturen_Heizung?.motorvorwaermung?.aktiv && (temp.motorvorwaermung_temp === null || temp.motorvorwaermung_temp === ''))
    warnings.push('Motorvorwärmung: Temperatur');
  if (cfg.Temperaturen_Heizung?.raumtemperatur?.aktiv && (temp.raumtemperatur === null || temp.raumtemperatur === ''))
    warnings.push('Raumtemperatur');

  // ── Probeläufe ─────────────────────────────────────────────
  (p.probelaeufe || []).forEach((lauf, idx) => {
    if (!lauf.last_kw && lauf.last_kw !== 0) warnings.push(`Probelauf ${idx+1}: Belastung (kW)`);
    if (!lauf.laufzeit_min && lauf.laufzeit_min !== 0) warnings.push(`Probelauf ${idx+1}: Laufzeit`);
    if (!lauf.spannung_l1 && lauf.spannung_l1 !== 0) warnings.push(`Probelauf ${idx+1}: Spannung L1`);
    if (!lauf.spannung_l2 && lauf.spannung_l2 !== 0) warnings.push(`Probelauf ${idx+1}: Spannung L2`);
    if (!lauf.spannung_l3 && lauf.spannung_l3 !== 0) warnings.push(`Probelauf ${idx+1}: Spannung L3`);
    if (!lauf.frequenz && lauf.frequenz !== 0) warnings.push(`Probelauf ${idx+1}: Frequenz`);
    if (!lauf.strom_l1 && lauf.strom_l1 !== 0) warnings.push(`Probelauf ${idx+1}: Strom L1`);
    if (!lauf.strom_l2 && lauf.strom_l2 !== 0) warnings.push(`Probelauf ${idx+1}: Strom L2`);
    if (!lauf.strom_l3 && lauf.strom_l3 !== 0) warnings.push(`Probelauf ${idx+1}: Strom L3`);
    if (!lauf.leistung_kw && lauf.leistung_kw !== 0) warnings.push(`Probelauf ${idx+1}: Wirkleistung`);
    if (!lauf.cos_phi && lauf.cos_phi !== 0) warnings.push(`Probelauf ${idx+1}: cos φ`);
    if (!lauf.oeldruck_bar && lauf.oeldruck_bar !== 0) warnings.push(`Probelauf ${idx+1}: Öldruck`);
    if (!lauf.motortemperatur && lauf.motortemperatur !== 0) warnings.push(`Probelauf ${idx+1}: Motortemperatur`);
  });

  return { blocking, warnings };
}

// ── Protokoll speichern ────────────────────────────────────────
export async function protokollSpeichern(alsAbgeschlossen = false) {
  formularWerteEinlesen();

  if (!aktuellesProtokoll.datum) { toast('Bitte ein Datum eingeben', 'error'); return false; }
  if (alsAbgeschlossen && !aktuellesProtokoll.ergebnis) {
    toast('Bitte ein Gesamtergebnis auswählen', 'error'); return false;
  }

  // Vollständigkeits-Prüfung beim Abschließen
  if (alsAbgeschlossen) {
    const { blocking, warnings } = vollstaendigkeitsPruefung(aktuellesProtokoll, aktuellesAggregat.protokoll_config);

    if (blocking.length > 0) {
      toast('Fehlende Pflichtfelder: ' + blocking.join(', '), 'error');
      return false;
    }

    if (warnings.length > 0) {
      const msg = 'Folgende Felder sind nicht vollständig ausgefüllt:\n\n' +
        warnings.map(w => '  • ' + w).join('\n') +
        '\n\nTrotzdem abschließen?';
      const antwort = await confirmCustom(msg, [
        { label: '✓ Trotzdem abschließen', className: 'btn btn-primary', wert: 'ja' },
        { label: 'Abbrechen', className: 'btn btn-secondary', wert: 'nein' },
      ]);
      if (antwort !== 'ja') return false;
    }
  }

  aktuellesProtokoll.status       = alsAbgeschlossen ? 'abgeschlossen' : 'entwurf';
  aktuellesProtokoll.geaendert_am = new Date().toISOString();

  await DB.speichereProtokoll(aktuellesProtokoll);
  toast(alsAbgeschlossen ? 'Protokoll abgeschlossen ✓' : 'Entwurf gespeichert', 'success');
  return true;
}

// ── Protokoll exportieren ──────────────────────────────────────
export async function protokollExportieren() {
  formularWerteEinlesen();
  await DB.speichereProtokoll(aktuellesProtokoll);
  try {
    const name = await exportProtokoll(aktuellesProtokoll.id);
    toast(`Exportiert: ${name}`, 'success');
  } catch (err) {
    toast('Export fehlgeschlagen: ' + err.message, 'error');
  }
}

export function getAktuelleAggregat() { return aktuellesAggregat; }
