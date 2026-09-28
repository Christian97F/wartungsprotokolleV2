// Umwandlung des alten NEA-Datenformats (v1: "aggregate" + protokoll_config) in das
// generische Modell (Anlage + Prüfplan). Wird für die lokale Datenbank und für
// importierte Alt-Dateien verwendet.
import { DB } from './db.js';
import { neueAnlage, planAktualisieren, neuesProtokoll } from './model.js';
import { BUILTIN_VORLAGEN } from '../vorlagen/builtin.js';
import { istLeer } from './util.js';

const NEA = BUILTIN_VORLAGEN.find(v => v.id === 'nea');

export const istAltAggregat = (o) => !!o && typeof o === 'object' && 'protokoll_config' in o && !o.pruefplan;
export const istAltProtokoll = (o) => !!o && typeof o === 'object' && !o.plan && ('checkliste' in o || 'betriebsdaten' in o || 'aggregatId' in o);

const EINFACHE_GRUPPEN = ['Temperaturen_Heizung', 'Ausstattung', 'Elektronikgeraete', 'Schaltanlage',
  'Messinstrumente', 'Betriebsarten', 'Generator', 'Motor_Ausstattung'];
const STOER_TAG = { abstellend: 'A', abstellend_verzoegert: 'AV', warnend: 'W' };
const LASTBETRIEB = {
  uebergabesync: 'Übergabe mit Synchronisierung', uebergabe: 'Übergabe ohne Synchronisierung',
  inselbetrieb: 'Inselbetrieb', parallelbetrieb: 'Parallelbetrieb',
};
const UNTERDRUCK = ['pumpe_ein', 'alarm_ein', 'alarm_aus', 'pumpe_aus'];
const unterdruckMessungen = () => UNTERDRUCK.map(id => ({
  id, label: id.replace('_', ' ').replace(/^./, c => c.toUpperCase()), einheit: 'mbar',
}));

// Alte Konfigurationen enthalten teils "ueberstromrelais" (aus einer früheren
// Version) neben dem vertippten, im Konfigurator bedienten "uebestromrelais".
// Maßgeblich ist der bedienbare Schlüssel, der andere wird verworfen.
const ALIAS = { Elektronikgeraete: { ueberstromrelais: ['uebestromrelais', 'ueberstromrelais'] } };
const IGNORIERT = { Elektronikgeraete: ['uebestromrelais'] };

function altWert(gruppe, cfg, id) {
  const quellen = ALIAS[gruppe]?.[id] || [id];
  for (const k of quellen) if (cfg?.[k] !== undefined) return cfg[k];
  return undefined;
}

export function migriereAggregat(alt) {
  const s = alt.stammdaten || {};
  const t = alt.technische_daten || {};
  const iv = alt.wartungsintervalle || {};
  const c = alt.protokoll_config || {};

  const a = neueAnlage(NEA);
  a.id = alt.id;
  a.erstellt_am = alt.erstellt_am || a.erstellt_am;
  a.geaendert_am = alt.geaendert_am || a.geaendert_am;
  a.stammdaten = {
    kommission: s.Kommission || '', bezeichnung: s.Bezeichnung || '', kunde: s.Kunde || '',
    standort: s.Standort || '', hersteller: s.Hersteller || '', typ: s.Typ || '',
    seriennr: s.Serien_NR || '', baujahr: '',
  };
  a.vertrag = { aktiv: !!s.Wartungsvertrag, nummer: s.Wartungsvertrag_NR || '' };
  a.notizen = s.Text || '';

  for (const g of a.zusatzFelder) for (const f of g.felder) {
    const w = s[f.id] ?? t[f.id] ?? iv[f.id] ?? c[f.id];
    if (!istLeer(w)) a.zusatz[f.id] = w;
  }
  if (c.Typ) a.zusatz.Aufstellung = c.Typ === 'mobil' ? 'Mobil' : 'Stationär';
  if (c.Lastbetrieb) a.zusatz.Lastbetrieb = LASTBETRIEB[c.Lastbetrieb] || c.Lastbetrieb;

  const sek = (id) => a.pruefplan.find(x => x.id === id);
  const el = (sekId, elId, liste = 'elemente') => sek(sekId)[liste].find(x => x.id === elId);

  el('Betriebsdaten', 'startzaehler', 'zeilen').aktiv = !!c.Hat_Startzaehler;
  for (const id of ['spannung_min', 'spannung_max']) el('Spannung_Frequenz', id).aktiv = c.Generatorspannung_Typ === 'variabel';
  for (const id of ['frequenz_min', 'frequenz_max']) el('Spannung_Frequenz', id).aktiv = c.Generatorfrequenz_Typ === 'variabel';
  el('Arbeiten', 'dguv').aktiv = !c.Keine_DGUV;

  // Batterien: sichtbar, sobald eine Anzahl konfiguriert ist (alter Haken entfällt)
  const bat = sek('Batterien');
  for (const [gid, suffix, hat] of [['starterbatterie', 'Starterbatterie', c.Hat_Starterbatterien], ['steuerbatterie', 'Steuerbatterie', c.Hat_Steuerbatterien]]) {
    const g = bat.gruppen.find(x => x.id === gid);
    const plural = gid === 'starterbatterie' ? 'Starterbatterien' : 'Steuerbatterien';
    const beschrieben = hat || t[`Typ_${suffix}`] || t[`Hersteller_${suffix}`];
    g.anzahl = beschrieben ? Number(t[`Anzahl_${plural}`] ?? 1) : 0;
    g.spannung = t[`Spannung_${suffix}`] ?? g.spannung;
    g.kapazitaet = t[`Kapazitaet_${suffix}`] ?? null;
    g.typ = t[`Typ_${suffix}`] || '';
    g.hersteller = t[`Hersteller_${suffix}`] || '';
    g.wartungsfrei = !!t[`Wartungsfrei_${suffix}`];
  }
  const laderName = (n) => `${t[`Batterielader${n}_Hersteller`] || ''} ${t[`Batterielader${n}_Typ`] || ''}`.trim();
  bat.lader[0].name = laderName(1) || 'Ladegerät 1';
  bat.lader[0].aktiv = bat.gruppen.some(g => g.anzahl > 0);
  bat.lader[1].name = laderName(2) || 'Ladegerät 2';
  bat.lader[1].aktiv = !!laderName(2);

  for (const gruppe of EINFACHE_GRUPPEN) {
    const cfg = c[gruppe] || {};
    const s2 = sek(gruppe);
    const bekannt = new Set();
    for (const e of s2.elemente) {
      const quellen = ALIAS[gruppe]?.[e.id] || [e.id];
      quellen.forEach(k => bekannt.add(k));
      if (e.id === 'aussentemperatur') continue;
      e.aktiv = !!altWert(gruppe, cfg, e.id)?.aktiv;
    }
    for (const [k, v] of Object.entries(cfg)) {
      if (k === '_eigen' || bekannt.has(k) || IGNORIERT[gruppe]?.includes(k)) continue;
      if (v?.aktiv) s2.elemente.push({ id: k, label: k, aktiv: true, bewertung: true, messungen: [] });
    }
    for (const e of cfg._eigen || []) {
      s2.elemente.push({ id: 'eigen_' + e.key, label: e.label, aktiv: true, bewertung: true, messungen: [] });
    }
  }

  for (const e of sek('Kuehlkreise').elemente) {
    const k = c.Kuehlkreise?.[e.id];
    e.aktiv = !!k?.aktiv;
    if (k && k.frostschutz === false) e.messungen = [];
  }

  sek('Leckagewächter').elemente = (c['Leckagewächter'] || []).map(eintrag => {
    const name = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const ud = typeof eintrag === 'object' && eintrag.unterdruck;
    return { id: name, label: name, aktiv: true, bewertung: true, messungen: ud ? unterdruckMessungen() : [] };
  });

  sek('Stoermeldungen').elemente = (c.Stoermeldungen || []).map((st, i) => {
    if (typeof st === 'object' && st.art === 'gruppe') return { id: `gruppe_${i}`, art: 'ueberschrift', label: st.titel || '' };
    const name = typeof st === 'string' ? st : st.name;
    const typ = (typeof st === 'object' && st.typ) || 'abstellend';
    return {
      id: `${name}__${typ}`, label: name, tag: STOER_TAG[typ] || typ,
      hinweis: (typeof st === 'object' && st.pruefhinweis) || '', aktiv: true, bewertung: true, messungen: [],
    };
  });

  const eigene = (c.Eigene_Sektionen || []).map(cs => ({
    id: cs.id, typ: 'checkliste', titel: cs.titel || 'Eigene Gruppe', aktiv: true,
    elemente: (cs.elemente || []).map(e => {
      if (e.typ === 'gruppe') return { id: e.id, art: 'ueberschrift', label: e.label || '' };
      if (e.typ === 'checkbox') return { id: e.id, label: e.label, aktiv: true, bewertung: true, messungen: [] };
      const m = { id: 'wert', label: '', einheit: e.einheit || '' };
      if (e.typ === 'text') m.typ = 'text';
      return { id: e.id, label: e.label, aktiv: true, bewertung: false, messungen: [m] };
    }),
  }));

  const vorne = ['Betriebsdaten', 'Spannung_Frequenz', 'Probelauf', 'Arbeiten', 'Batterien'].map(sek);
  const mitte = [...a.pruefplan.filter(x => !vorne.includes(x) && x.id !== 'Abschluss'), ...eigene];
  const reihenfolge = c.Sektionen_Reihenfolge || [];
  mitte.sort((x, y) => {
    const ix = reihenfolge.indexOf(x.id);
    const iy = reihenfolge.indexOf(y.id);
    return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy);
  });
  a.pruefplan = [...vorne, ...mitte, sek('Abschluss')];
  return a;
}

export function migriereProtokoll(alt, anlage) {
  const abgeschlossen = alt.status === 'abgeschlossen';
  const st = (v) => (v === 'ok' || v === 'mangel' ? v : v === 'ng' && abgeschlossen ? 'ng' : null);

  const p = neuesProtokoll(anlage);
  p.id = alt.id;
  p.anlageId = alt.aggregatId || anlage.id;
  p.status = abgeschlossen ? 'abgeschlossen' : 'entwurf';
  p.datum = alt.datum || p.datum;
  p.erstellt_am = alt.erstellt_am || p.erstellt_am;
  p.geaendert_am = alt.geaendert_am || alt.erstellt_am || p.geaendert_am;
  if (abgeschlossen) p.abgeschlossen_am = p.geaendert_am;
  p.meta = {
    techniker: alt.meta?.techniker || '', auftrag: alt.meta?.auftrag_nr || '',
    kunde: alt.meta?.kunde || '', standort: alt.meta?.standort || '',
  };

  const w = {};
  const b = alt.betriebsdaten || {};
  w.Betriebsdaten = {
    betriebsstunden: { vor: b.betriebsstunden_vorher ?? null, nach: b.betriebsstunden_nachher ?? null },
    startzaehler: { vor: b.startzaehler_vorher ?? null, nach: b.startzaehler_nachher ?? null },
  };
  w.Spannung_Frequenz = { ...(alt.spannungsFrequenz || {}) };
  w.Probelauf = (alt.probelaeufe || []).map(l => ({ ...l }));
  w.Arbeiten = {};
  for (const k of Object.keys({ ...alt.durchgefuehrte_arbeiten, ...alt.naechste_arbeiten })) {
    w.Arbeiten[k] = { erledigt: !!alt.durchgefuehrte_arbeiten?.[k], geplant: !!alt.naechste_arbeiten?.[k] };
  }

  const altBat = alt.batterien || {};
  const batListe = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(x => ({
    leerlauf: x.leerlauf ?? null, belastung: x.belastung ?? null, pruefstrom: x.pruefstrom ?? null,
    saeuredichte: x.saeuredichte ?? null, klemmen: x.klemmen_ok ? 'ok' : null, destilliert: !!x.destilliert,
  }));
  w.Batterien = {
    gruppen: { starterbatterie: batListe(altBat.starterbatterie), steuerbatterie: batListe(altBat.steuerbatterie) },
    lader: { lader1: altBat.lader1_ladespannung ?? null, lader2: altBat.lader2_ladespannung ?? null },
  };

  const ck = alt.checkliste || {};
  const pruef = (v) => {
    if (v && typeof v === 'object') {
      const { zustand, ...rest } = v;
      return { s: st(zustand), m: rest };
    }
    return { s: st(v), m: {} };
  };
  for (const gruppe of [...EINFACHE_GRUPPEN, 'Leckagewächter', 'Stoermeldungen', 'Kuehlkreise']) {
    w[gruppe] = {};
    for (const [k, v] of Object.entries(ck[gruppe] || {})) {
      const id = gruppe === 'Elektronikgeraete' && k === 'uebestromrelais' ? 'ueberstromrelais' : k;
      w[gruppe][id] = pruef(v);
    }
  }
  const temp = alt.temperaturen || {};
  w.Temperaturen_Heizung.aussentemperatur = { s: null, m: { wert: temp.aussentemperatur ?? null } };
  w.Temperaturen_Heizung.raumtemperatur = { s: null, m: { wert: temp.raumtemperatur ?? null } };
  w.Temperaturen_Heizung.motorvorwaermung ??= { s: null, m: {} };
  w.Temperaturen_Heizung.motorvorwaermung.m.temp = temp.motorvorwaermung_temp ?? null;

  for (const [sekId, felder] of Object.entries(alt.eigene_sektionen || {})) {
    w[sekId] = {};
    for (const [elId, v] of Object.entries(felder || {})) {
      w[sekId][elId] = ['ok', 'mangel', 'ng'].includes(v) ? { s: st(v), m: {} } : { s: null, m: { wert: v } };
    }
  }

  const betriebsart = { auto: 'Automatik', manuell: 'Manuell', aus: 'Aus' }[alt.verlassen_in_betriebsart];
  w.Abschluss = { verlassen_in_betriebsart: betriebsart || '' };

  p.werte = w;
  p.maengel = (alt.maengel || []).map((m, i) => ({
    id: `m${i + 1}`, text: m.beschreibung || '', prio: m.prioritaet || 'mittel', behoben: !!m.behoben,
  }));
  p.ergebnis = alt.ergebnis || '';
  p.bemerkung = alt.bemerkung || '';
  p.naechste_pruefung = alt.naechste_pruefung || '';
  planAktualisieren(p, anlage);
  return p;
}

// Platzhalter-Anlage, falls das Aggregat eines Alt-Protokolls nicht mehr existiert
export function ersatzAnlage(id) {
  return migriereAggregat({ id, stammdaten: { Kommission: '(gelöscht)' }, protokoll_config: {} });
}

export async function migriereDatenbank() {
  const schema = await DB.einstellung('schema', 1);
  if (schema >= 2) return null;

  const alteAggregate = await DB.legacyAggregate();
  const vorhandene = new Map((await DB.anlagen.alle()).map(a => [a.id, a]));
  const neu = alteAggregate.filter(a => !vorhandene.has(a.id)).map(migriereAggregat);
  if (neu.length) await DB.anlagen.speichereViele(neu);
  neu.forEach(a => vorhandene.set(a.id, a));

  const protokolle = (await DB.protokolle.alle()).filter(istAltProtokoll);
  const migriert = protokolle.map(p => migriereProtokoll(p, vorhandene.get(p.aggregatId) || ersatzAnlage(p.aggregatId)));
  if (migriert.length) await DB.protokolle.speichereViele(migriert);

  await DB.setzeEinstellung('schema', 2);
  return { anlagen: neu.length, protokolle: migriert.length };
}
