// Übergangsweise: Export in das Datenformat der alten App (v1: "aggregat" + protokoll_config),
// z. B. für das Python-Programm. Umkehrung von core/migration.js.
//
// ENTFERNEN: diese Datei löschen und alle Stellen mit dem Kommentar „ALTFORMAT“ entfernen
// (grep -rn ALTFORMAT js), danach in sw.js die Datei aus ASSETS nehmen und VERSION erhöhen.
import { DB } from '../core/db.js';
import { dateiname, heuteIso, istLeer } from '../core/util.js';
import { ausgeben, alsJson } from './austausch.js';

const STAMMDATEN = ['Leistung_kVA', 'Motor_Typ', 'Motor_NR', 'Menge_Kuehlmittel_intern', 'Typ_Kuehlmittel_intern',
  'Menge_Kuehlmittel_extern', 'Typ_Kuehlmittel_extern', 'Wartungspauschale', 'Server_Link'];
const INTERVALLE = ['Oelwechsel_Intervall', 'DGUV_Intervall', 'Kuehlmittel_Intervall_intern', 'Kuehlmittel_Intervall_extern',
  'Luftfilter_Intervall', 'Motorwartung_Intervall', 'Elektr_Wartung_Intervall'];
const TECHNIK = ['Generator_Hersteller', 'Generator_Typ', 'Generator_Serien_NR', 'Generator_Regler_Typ',
  'Motorregler_Hersteller', 'Motorregler_Typ', 'NSA_Hersteller', 'NSA_Typ', 'NSA_Serien_NR'];
const LASTBETRIEB = {
  'Übergabe mit Synchronisierung': 'uebergabesync', 'Übergabe ohne Synchronisierung': 'uebergabe',
  Inselbetrieb: 'inselbetrieb', Parallelbetrieb: 'parallelbetrieb',
};
const STOER_TYP = { A: 'abstellend', AV: 'abstellend_verzoegert', W: 'warnend' };
const BETRIEBSART = { Automatik: 'auto', Manuell: 'manuell', Aus: 'aus' };

// Feste Schlüssel je Gruppe; alles andere wird im alten Format zu einem „_eigen“-Prüfpunkt
const GRUPPEN = {
  Temperaturen_Heizung: ['motorvorwaermung', 'kraftstoffvorwaerm', 'raumheizung', 'raumtemperatur'],
  Schaltanlage: ['hupe', 'notaus', 'potfrei', 'lastprobe', 'stoerungen', 'beleuchtng', 'beleuchtngagg', 'genschalter', 'netzschalter', 'ueberwachung'],
  Messinstrumente: ['pf', 'sp', 'nullsp', 'str', 'umsch', 'umschL123', 'freq', 'leist', 'batlad', 'batsp', 'kwtemp', 'kraftst', 'oeldruck', 'drehz'],
  Betriebsarten: ['handbetrieb', 'testbetrieb', 'automatikbetrieb', 'lastprobebetrieb'],
  Elektronikgeraete: ['ueberstromrelais', 'kurzschlussrelais', 'synchronisiergeraet'],
  Generator: ['drehfeld', 'spannungsregler', 'leistungsfaktorregler', 'anschluesse'],
  Motor_Ausstattung: ['lima', 'anlass', 'abgas', 'luftfilter', 'oelbad', 'abstell', 'vorglueh', 'kuehler', 'luefter',
    'keilriemen', 'schlaeuche', 'lager', 'befestigung', 'kraftstoffleitungen'],
  Ausstattung: ['haupttank', 'tagestank', 'tankleitungen', 'kraftstoffpumpe', 'sauberkeit'],
};
const altSchluessel = (gruppe, id) => (gruppe === 'Elektronikgeraete' && id === 'ueberstromrelais' ? 'uebestromrelais' : id);
const FESTE_SEKTIONEN = new Set([...Object.keys(GRUPPEN), 'Betriebsdaten', 'Spannung_Frequenz', 'Probelauf', 'Arbeiten',
  'Batterien', 'Kuehlkreise', 'Leckagewächter', 'Stoermeldungen', 'Abschluss']);
const KUEHLKREISE = ['extern', 'intern', 'motorkreis', 'ladeluftkreis'];

const aktiv = (x) => !!x && x.aktiv !== false;
const pruefpunkte = (sek) => (sek?.elemente || []).filter(e => e.art !== 'ueberschrift' && aktiv(e));
const istUnterdruck = (el) => (el.messungen || []).some(m => m.id === 'pumpe_ein');
const eigenKey = (id) => (id.startsWith('eigen_') ? id.slice(6) : id);
const stoerKey = (el) => `${el.label}__${STOER_TYP[el.tag] || 'abstellend'}`;

/** anlage: { id, stammdaten, zusatz, vertrag, notizen, erstellt_am, geaendert_am }, plan: Sektionen */
function altAggregat(anlage, plan) {
  const s = anlage.stammdaten || {};
  const z = anlage.zusatz || {};
  const sek = (id) => plan.find(x => x.id === id && aktiv(x));
  const el = (sekId, elId, liste = 'elemente') => (sek(sekId)?.[liste] || []).find(e => e.id === elId);
  const nimm = (keys) => Object.fromEntries(keys.map(k => [k, z[k] ?? null]));

  const stammdaten = {
    Kommission: s.kommission || '', Bezeichnung: s.bezeichnung || '', Hersteller: s.hersteller || '',
    Typ: s.typ || '', Serien_NR: s.seriennr || '', Kunde: s.kunde || '', Standort: s.standort || '',
    ...nimm(STAMMDATEN),
    Wartungsvertrag: !!anlage.vertrag?.aktiv, Wartungsvertrag_NR: anlage.vertrag?.nummer || '', Text: anlage.notizen || '',
  };
  // Zusatzfelder, die das alte Format nicht kennt, landen in den Stammdaten
  const bekannt = new Set([...STAMMDATEN, ...INTERVALLE, ...TECHNIK, 'Aufstellung', 'Lastbetrieb']);
  for (const [k, v] of Object.entries(z)) if (!bekannt.has(k) && !istLeer(v)) stammdaten[k] = v;

  const technische_daten = nimm(TECHNIK);
  const bat = sek('Batterien');
  for (const [gid, suffix, plural] of [['starterbatterie', 'Starterbatterie', 'Starterbatterien'], ['steuerbatterie', 'Steuerbatterie', 'Steuerbatterien']]) {
    const g = bat?.gruppen?.find(x => x.id === gid) || {};
    Object.assign(technische_daten, {
      [`Hersteller_${suffix}`]: g.hersteller || '', [`Spannung_${suffix}`]: g.spannung ?? null,
      [`Anzahl_${plural}`]: Number(g.anzahl) || 0, [`Typ_${suffix}`]: g.typ || '',
      [`Kapazitaet_${suffix}`]: g.kapazitaet ?? null, [`Wartungsfrei_${suffix}`]: !!g.wartungsfrei,
    });
  }
  (bat?.lader || []).slice(0, 2).forEach((l, i) => {
    technische_daten[`Batterielader${i + 1}_Hersteller`] = aktiv(l) ? l.name || '' : '';
    technische_daten[`Batterielader${i + 1}_Typ`] = '';
  });

  const c = {
    Typ: z.Aufstellung === 'Mobil' ? 'mobil' : 'stationaer',
    Lastbetrieb: LASTBETRIEB[z.Lastbetrieb] || z.Lastbetrieb || '',
    Hat_Startzaehler: aktiv(el('Betriebsdaten', 'startzaehler', 'zeilen')),
    Kunden_Bestellnr: '',
    Keine_DGUV: !aktiv(el('Arbeiten', 'dguv')),
    Generatorspannung_Typ: aktiv(el('Spannung_Frequenz', 'spannung_min')) ? 'variabel' : 'fest',
    Generatorfrequenz_Typ: aktiv(el('Spannung_Frequenz', 'frequenz_min')) ? 'variabel' : 'fest',
    Hat_Starterbatterien: Number(bat?.gruppen?.find(g => g.id === 'starterbatterie')?.anzahl) > 0,
    Hat_Steuerbatterien: Number(bat?.gruppen?.find(g => g.id === 'steuerbatterie')?.anzahl) > 0,
  };

  for (const [gruppe, keys] of Object.entries(GRUPPEN)) {
    const punkte = pruefpunkte(sek(gruppe));
    const ids = new Set(punkte.map(e => e.id));
    c[gruppe] = Object.fromEntries(keys.map(k => [altSchluessel(gruppe, k), { aktiv: ids.has(k) }]));
    if (gruppe !== 'Temperaturen_Heizung') {
      c[gruppe]._eigen = punkte.filter(e => !keys.includes(e.id)).map(e => ({ key: eigenKey(e.id), label: e.label }));
    }
  }
  c.Kuehlkreise = Object.fromEntries(KUEHLKREISE.map(k => {
    const e = pruefpunkte(sek('Kuehlkreise')).find(x => x.id === k);
    return [k, { aktiv: !!e, frostschutz: !!e?.messungen?.length }];
  }));
  c['Leckagewächter'] = pruefpunkte(sek('Leckagewächter')).map(e => ({ name: e.label, unterdruck: istUnterdruck(e) }));
  c.Stoermeldungen = (sek('Stoermeldungen')?.elemente || []).filter(e => e.art === 'ueberschrift' || aktiv(e)).map(e =>
    e.art === 'ueberschrift' ? { art: 'gruppe', titel: e.label }
      : { name: e.label, typ: STOER_TYP[e.tag] || 'abstellend', pruefhinweis: e.hinweis || '' });
  c.Sektionen_Reihenfolge = plan.filter(x => aktiv(x) && !['Betriebsdaten', 'Spannung_Frequenz', 'Probelauf', 'Arbeiten', 'Batterien', 'Abschluss'].includes(x.id)).map(x => x.id);
  c.Eigene_Sektionen = plan.filter(x => aktiv(x) && x.typ === 'checkliste' && !FESTE_SEKTIONEN.has(x.id)).map(x => ({
    id: x.id, titel: x.titel,
    elemente: x.elemente.filter(e => e.art === 'ueberschrift' || aktiv(e)).map(e => {
      if (e.art === 'ueberschrift') return { id: e.id, typ: 'gruppe', label: e.label };
      if (e.bewertung !== false) return { id: e.id, typ: 'checkbox', label: e.label };
      const m = e.messungen?.[0] || {};
      return { id: e.id, typ: m.typ === 'text' ? 'text' : 'messung', label: e.label, einheit: m.einheit || '' };
    }),
  }));

  return {
    id: anlage.id, erstellt_am: anlage.erstellt_am, geaendert_am: anlage.geaendert_am,
    stammdaten, wartungsintervalle: nimm(INTERVALLE), technische_daten, protokoll_config: c,
  };
}

function altProtokoll(p) {
  const w = p.werte || {};
  const sek = (id) => p.plan.find(x => x.id === id);
  const st = (v) => v?.s || 'ng';
  const zahl = (v) => (istLeer(v) ? null : v);

  const checkliste = {};
  for (const gruppe of [...Object.keys(GRUPPEN), 'Kuehlkreise', 'Leckagewächter', 'Stoermeldungen']) {
    checkliste[gruppe] = {};
    for (const e of pruefpunkte(sek(gruppe))) {
      const v = w[gruppe]?.[e.id];
      if (gruppe === 'Temperaturen_Heizung' && ['aussentemperatur', 'raumtemperatur'].includes(e.id)) continue;
      let key = altSchluessel(gruppe, e.id);
      if (gruppe === 'Leckagewächter') key = e.label;
      else if (gruppe === 'Stoermeldungen') key = stoerKey(e);
      else if (GRUPPEN[gruppe] && !GRUPPEN[gruppe].includes(e.id)) key = `eigen_${eigenKey(e.id)}`;
      const messwerte = gruppe === 'Temperaturen_Heizung' ? {} : v?.m || {};
      checkliste[gruppe][key] = Object.keys(messwerte).length || gruppe === 'Kuehlkreise' || istUnterdruck(e)
        ? { zustand: st(v), ...messwerte } : st(v);
    }
  }

  const eigene_sektionen = {};
  for (const x of p.plan.filter(s => s.typ === 'checkliste' && !FESTE_SEKTIONEN.has(s.id))) {
    eigene_sektionen[x.id] = Object.fromEntries(pruefpunkte(x).map(e => {
      const v = w[x.id]?.[e.id];
      return [e.id, e.bewertung !== false ? st(v) : v?.m?.wert ?? null];
    }));
  }

  const bw = w.Batterien || {};
  const batListe = (id) => (bw.gruppen?.[id] || []).map(b => ({
    leerlauf: b.leerlauf ?? null, belastung: b.belastung ?? null, pruefstrom: b.pruefstrom ?? null,
    klemmen_ok: b.klemmen === 'ok', saeuredichte: b.saeuredichte ?? null, destilliert: !!b.destilliert,
  }));
  const arbeiten = (feld) => Object.fromEntries(Object.entries(w.Arbeiten || {}).map(([k, v]) => [k, !!v?.[feld]]));

  // Mängel aus der Checkliste mit Notiz mitnehmen – das alte Format kennt keine Notizen an Prüfpunkten
  const ausCheckliste = p.plan.filter(s => s.typ === 'checkliste').flatMap(s => pruefpunkte(s)
    .filter(e => w[s.id]?.[e.id]?.s === 'mangel')
    .map(e => ({
      beschreibung: `${s.titel}: ${e.label}${w[s.id][e.id].notiz ? ` – ${w[s.id][e.id].notiz}` : ''}`,
      prioritaet: 'mittel', behoben: !!w[s.id][e.id].behoben,
    })));

  const temp = w.Temperaturen_Heizung || {};
  return {
    id: p.id, aggregatId: p.anlageId, datum: p.datum, erstellt_am: p.erstellt_am, geaendert_am: p.geaendert_am,
    status: p.status === 'abgeschlossen' ? 'abgeschlossen' : 'entwurf',
    meta: { techniker: p.meta?.techniker || '', auftrag_nr: p.meta?.auftrag || '', kunde: p.meta?.kunde || '', standort: p.meta?.standort || '' },
    betriebsdaten: {
      betriebsstunden_vorher: zahl(w.Betriebsdaten?.betriebsstunden?.vor), betriebsstunden_nachher: zahl(w.Betriebsdaten?.betriebsstunden?.nach),
      startzaehler_vorher: zahl(w.Betriebsdaten?.startzaehler?.vor), startzaehler_nachher: zahl(w.Betriebsdaten?.startzaehler?.nach),
    },
    batterien: {
      starterbatterie: batListe('starterbatterie'), steuerbatterie: batListe('steuerbatterie'),
      lader1_ladespannung: bw.lader?.lader1 ?? null, lader2_ladespannung: bw.lader?.lader2 ?? null,
    },
    spannungsFrequenz: {
      spannung_min: null, spannung_max: null, frequenz_min: null, frequenz_max: null, ...(w.Spannung_Frequenz || {}),
    },
    probelaeufe: (w.Probelauf || []).map(l => ({ ...l })),
    durchgefuehrte_arbeiten: arbeiten('erledigt'),
    naechste_arbeiten: arbeiten('geplant'),
    checkliste,
    temperaturen: {
      aussentemperatur: zahl(temp.aussentemperatur?.m?.wert), raumtemperatur: zahl(temp.raumtemperatur?.m?.wert),
      motorvorwaermung_temp: zahl(temp.motorvorwaermung?.m?.temp),
    },
    eigene_sektionen,
    maengel: [...(p.maengel || []).map(m => ({ beschreibung: m.text || '', prioritaet: m.prio || 'mittel', behoben: !!m.behoben })), ...ausCheckliste],
    ergebnis: p.ergebnis || '',
    bemerkung: p.bemerkung || '',
    naechste_pruefung: p.naechste_pruefung || '',
    verlassen_in_betriebsart: BETRIEBSART[w.Abschluss?.verlassen_in_betriebsart] || '',
  };
}

/** Einzelnes Protokoll wie die alte App: { _typ: 'wartungsprotokoll', protokoll, aggregat_config } */
export async function exportAltProtokoll(id, opts) {
  const p = await DB.protokolle.hole(id);
  if (!p) throw new Error('Protokoll nicht gefunden');
  // Aggregat aus dem Stand des Protokolls, damit Konfiguration und Werte zusammenpassen
  const anlage = { id: p.anlageId, notizen: '', ...p.anlage, erstellt_am: p.erstellt_am, geaendert_am: p.geaendert_am };
  const s = p.anlage?.stammdaten || {};
  const name = `${dateiname('Wartung', s.kommission, s.kunde, s.standort, p.datum)}_altes-Format.json`;
  await ausgeben(alsJson({ _typ: 'wartungsprotokoll', _version: '1.0', protokoll: altProtokoll(p), aggregat_config: altAggregat(anlage, p.plan) }), name, opts);
  return name;
}

/** Alle Anlagen wie die alte App: { _typ: 'aggregat-sammlung', aggregate } */
export async function exportAltAnlagen(opts) {
  const anlagen = await DB.anlagen.alle();
  const name = `AlleAggregate_${heuteIso()}_altes-Format.json`;
  await ausgeben(alsJson({
    _typ: 'aggregat-sammlung', _version: '1.0', _exportiert_am: new Date().toISOString(),
    aggregate: anlagen.map(a => altAggregat(a, a.pruefplan)),
  }), name, opts);
  return name;
}
