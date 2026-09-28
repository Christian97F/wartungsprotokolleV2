import { erzeugeId, jetztIso, heuteIso, klon, plusMonate } from './util.js';
import { modul, aktiverPlan } from '../sektionen/registry.js';

export const KERN_STAMMDATEN = [
  { id: 'kommission', label: 'Kommission / Anlagen-Nr.', pflicht: true, platzhalter: 'z. B. 26-00034' },
  { id: 'bezeichnung', label: 'Bezeichnung', platzhalter: 'z. B. NEA Pumpwerk Nord' },
  { id: 'kunde', label: 'Kunde', platzhalter: 'z. B. Stadtwerke Musterstadt' },
  { id: 'standort', label: 'Standort', platzhalter: 'z. B. Werk 2, Gebäude C' },
  { id: 'hersteller', label: 'Hersteller' },
  { id: 'typ', label: 'Typ / Modell' },
  { id: 'seriennr', label: 'Seriennummer' },
  { id: 'baujahr', label: 'Baujahr' },
];

export const ERGEBNISSE = {
  in_ordnung:     { label: 'In Ordnung',     kurz: 'i.O.',           art: 'ok' },
  fehler_behoben: { label: 'Mängel behoben', kurz: 'Mängel behoben', art: 'warn' },
  fehler_offen:   { label: 'Mängel offen',   kurz: 'Mängel offen',   art: 'fehler' },
};

export function neueAnlage(vorlage) {
  return {
    id: erzeugeId('a_'),
    vorlageId: vorlage.id,
    vorlageName: vorlage.name,
    stammdaten: Object.fromEntries(KERN_STAMMDATEN.map(f => [f.id, ''])),
    vertrag: { aktiv: false, nummer: '' },
    notizen: '',
    zusatzFelder: klon(vorlage.stammdaten || []),
    zusatz: {},
    pruefplan: klon(vorlage.sektionen || []),
    erstellt_am: jetztIso(),
    geaendert_am: jetztIso(),
  };
}

export function neueVorlage(name = 'Neue Vorlage') {
  return {
    id: erzeugeId('v_'),
    name,
    kategorie: '',
    beschreibung: '',
    stammdaten: [],
    sektionen: [],
    erstellt_am: jetztIso(),
    geaendert_am: jetztIso(),
  };
}

export function vorlageKopie(quelle, name) {
  return {
    ...neueVorlage(name),
    kategorie: quelle.kategorie || '',
    beschreibung: quelle.beschreibung || '',
    stammdaten: klon(quelle.stammdaten || quelle.zusatzFelder || []),
    sektionen: klon(quelle.sektionen || quelle.pruefplan || []),
  };
}

export function anlageSnapshot(anlage) {
  return {
    stammdaten: klon(anlage.stammdaten),
    zusatzFelder: klon(anlage.zusatzFelder || []),
    zusatz: klon(anlage.zusatz || {}),
    vertrag: klon(anlage.vertrag || {}),
    vorlageName: anlage.vorlageName || '',
  };
}

export const UNTERSCHRIFT_STANDARD = { techniker: true, kunde: true };

// Ohne Angabe im Protokoll gilt die Einstellung unter „Daten“ (auch nachträglich)
export function unterschriftFelder(p, standard = UNTERSCHRIFT_STANDARD) {
  return {
    techniker: p.unterschriften?.zeigeTechniker ?? standard.techniker,
    kunde: p.unterschriften?.zeigeKunde ?? standard.kunde,
  };
}

export function neuesProtokoll(anlage, { techniker = '' } = {}) {
  const p = {
    id: erzeugeId('p_'),
    anlageId: anlage.id,
    status: 'entwurf',
    datum: heuteIso(),
    erstellt_am: jetztIso(),
    geaendert_am: jetztIso(),
    meta: {
      techniker,
      auftrag: '',
      kunde: anlage.stammdaten.kunde || '',
      standort: anlage.stammdaten.standort || '',
    },
    anlage: null,
    plan: [],
    werte: {},
    maengel: [],
    ergebnis: '',
    bemerkung: '',
    naechste_pruefung: plusMonate(heuteIso(), 12),
    unterschriften: { techniker: null, kunde: null, kunde_name: '' },
  };
  planAktualisieren(p, anlage);
  return p;
}

// Übernimmt den aktuellen Prüfplan der Anlage; Werte bleiben über die IDs erhalten.
export function planAktualisieren(protokoll, anlage) {
  protokoll.plan = aktiverPlan(anlage.pruefplan);
  protokoll.anlage = anlageSnapshot(anlage);
  initWerte(protokoll);
}

export function initWerte(protokoll) {
  protokoll.werte ??= {};
  for (const sek of protokoll.plan) {
    protokoll.werte[sek.id] = modul(sek.typ).initWerte(sek, protokoll.werte[sek.id]);
  }
}

export function auswertung(protokoll) {
  let gesamt = 0;
  let offenAnzahl = 0;
  const offen = [];
  const maengel = [];
  for (const sek of protokoll.plan) {
    const m = modul(sek.typ);
    const werte = protokoll.werte[sek.id];
    const r = m.pruefe(sek, werte);
    gesamt += r.gesamt;
    offenAnzahl += r.offen.length;
    if (r.offen.length) offen.push({ sektion: sek.titel, id: sek.id, punkte: r.offen });
    maengel.push(...m.maengel(sek, werte).map(x => ({ ...x, quelle: 'pruefpunkt' })));
  }
  for (const x of protokoll.maengel || []) maengel.push({ ...x, quelle: 'manuell' });

  const pflicht = [];
  if (!protokoll.datum) pflicht.push('Datum');
  if (!protokoll.meta.techniker.trim()) pflicht.push('Techniker');
  if (!protokoll.ergebnis) pflicht.push('Gesamtergebnis');

  return {
    gesamt,
    erledigt: gesamt - offenAnzahl,
    prozent: gesamt ? Math.round(((gesamt - offenAnzahl) / gesamt) * 100) : 100,
    offen,
    maengel,
    pflicht,
  };
}

export function ergebnisVorschlag(a) {
  if (!a.maengel.length) return 'in_ordnung';
  return a.maengel.every(m => m.behoben) ? 'fehler_behoben' : 'fehler_offen';
}

export function anlagenTitel(stammdaten = {}) {
  return [stammdaten.kommission, stammdaten.bezeichnung].filter(Boolean).join(' – ') || 'Unbenannte Anlage';
}
