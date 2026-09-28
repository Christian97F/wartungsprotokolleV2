// Import/Export. Ein einheitliches Dateiformat für alles (Backup, einzelne Anlage,
// Protokoll, Vorlage); alte v1-Dateien werden beim Import automatisch umgewandelt.
import { DB } from '../core/db.js';
import { dateiname, heuteIso, jetztIso, istLeer } from '../core/util.js';
import { anlagenTitel, ERGEBNISSE, auswertung } from '../core/model.js';
import {
  istAltAggregat, istAltProtokoll, migriereAggregat, migriereProtokoll, ersatzAnlage,
} from '../core/migration.js';

export const FORMAT = 'wartungsprotokolle';
export const VERSION = 2;

function paket(inhalt, teile) {
  return {
    format: FORMAT,
    version: VERSION,
    inhalt,
    exportiert_am: jetztIso(),
    anlagen: [], protokolle: [], vorlagen: [],
    ...teile,
  };
}

// ── Ausgabe ──────────────────────────────────────────────────

export function kannTeilen() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

export function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Teilt die Datei (Mobil: Mail, Drive …) oder lädt sie herunter. */
export async function ausgeben(blob, name, { teilen = false } = {}) {
  if (teilen && kannTeilen()) {
    const datei = new File([blob], name, { type: blob.type });
    try {
      await navigator.share({ files: [datei], title: name });
      return 'geteilt';
    } catch (e) {
      if (e.name === 'AbortError') return 'abgebrochen';
    }
  }
  herunterladen(blob, name);
  return 'geladen';
}

const alsJson = (obj) => new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });

// ── Export ───────────────────────────────────────────────────

// Einstellungen, die mit ins Backup gehen (Briefkopf inkl. Logo, Standard-Techniker, Unterschriftsfelder)
const EINSTELLUNGEN = ['firma', 'techniker', 'unterschriftFelder'];

async function sicherbareEinstellungen() {
  const werte = await Promise.all(EINSTELLUNGEN.map(k => DB.einstellung(k)));
  return Object.fromEntries(EINSTELLUNGEN.map((k, i) => [k, werte[i]]).filter(([, w]) => w != null));
}

export async function exportBackup(opts) {
  const [anlagen, protokolle, vorlagen, geloescht, einstellungen] = await Promise.all([
    DB.anlagen.alle(), DB.protokolle.alle(), DB.vorlagen.alle(), DB.einstellung('geloescht', {}), sicherbareEinstellungen(),
  ]);
  const name = `Wartung_Backup_${heuteIso()}.json`;
  const r = await ausgeben(alsJson(paket('backup', { anlagen, protokolle, vorlagen, geloescht, einstellungen })), name, opts);
  if (r !== 'abgebrochen') await DB.setzeEinstellung('letztesBackup', jetztIso());
  return { name, anlagen: anlagen.length, protokolle: protokolle.length, vorlagen: vorlagen.length, r };
}

export async function exportAnlage(anlageId, { mitProtokollen = false, ...opts } = {}) {
  const anlage = await DB.anlagen.hole(anlageId);
  if (!anlage) throw new Error('Anlage nicht gefunden');
  const protokolle = mitProtokollen ? await DB.protokolle.vonAnlage(anlageId) : [];
  const name = `${dateiname('Anlage', anlage.stammdaten.kommission, anlage.stammdaten.bezeichnung)}.json`;
  await ausgeben(alsJson(paket('anlage', { anlagen: [anlage], protokolle })), name, opts);
  return name;
}

export function protokollDateiname(p, endung) {
  const s = p.anlage?.stammdaten || {};
  const leistung = p.anlage?.zusatz?.Leistung_kVA;
  return `${dateiname('Protokoll', s.kommission, s.kunde, s.standort, !istLeer(leistung) && `${leistung}kVA`, p.datum)}.${endung}`;
}

export async function exportProtokolle(ids, opts) {
  const protokolle = (await Promise.all(ids.map(id => DB.protokolle.hole(id)))).filter(Boolean);
  if (!protokolle.length) throw new Error('Keine Protokolle ausgewählt');
  const anlagenIds = [...new Set(protokolle.map(p => p.anlageId))];
  const anlagen = (await Promise.all(anlagenIds.map(id => DB.anlagen.hole(id)))).filter(Boolean);
  const name = protokolle.length === 1
    ? protokollDateiname(protokolle[0], 'json')
    : `Protokolle_${heuteIso()}_${protokolle.length}.json`;
  await ausgeben(alsJson(paket('protokolle', { anlagen, protokolle })), name, opts);
  return name;
}

export async function exportVorlage(vorlage, opts) {
  const name = `${dateiname('Vorlage', vorlage.name)}.json`;
  await ausgeben(alsJson(paket('vorlage', { vorlagen: [vorlage] })), name, opts);
  return name;
}

export async function exportUebersichtCsv(opts) {
  const protokolle = await DB.protokolle.alle();
  protokolle.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const zelle = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const kopf = ['Datum', 'Kommission', 'Bezeichnung', 'Kunde', 'Standort', 'Vorlage', 'Techniker', 'Auftrag',
    'Status', 'Ergebnis', 'Mängel', 'Nächste Prüfung'];
  const zeilen = protokolle.map(p => {
    const s = p.anlage?.stammdaten || {};
    return [p.datum, s.kommission, s.bezeichnung, p.meta.kunde, p.meta.standort, p.anlage?.vorlageName,
      p.meta.techniker, p.meta.auftrag, p.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Entwurf',
      ERGEBNISSE[p.ergebnis]?.label || '', auswertung(p).maengel.length, p.naechste_pruefung].map(zelle).join(';');
  });
  // BOM, damit Excel UTF-8 erkennt
  const blob = new Blob(['﻿' + [kopf.map(zelle).join(';'), ...zeilen].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const name = `Protokoll-Uebersicht_${heuteIso()}.csv`;
  await ausgeben(blob, name, opts);
  return name;
}

// ── Import ───────────────────────────────────────────────────

export async function leseDatei(datei) {
  const text = await datei.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`„${datei.name}“ ist keine gültige JSON-Datei.`);
  }
}

/** Normalisiert beliebige unterstützte Dateien (v1 + v2) zu { anlagen, protokolle, vorlagen, einstellungen }. */
export async function normalisiere(daten, name = '') {
  if (daten?.format === FORMAT) {
    if (daten.version > VERSION) throw new Error(`„${name}“ stammt aus einer neueren App-Version.`);
    return {
      anlagen: daten.anlagen || [], protokolle: daten.protokolle || [],
      vorlagen: daten.vorlagen || [], einstellungen: daten.einstellungen || null,
      geloescht: daten.geloescht || {},
    };
  }

  // Alt-Formate (v1)
  const altAggregate = [];
  const altProtokolle = [];
  switch (daten?._typ) {
    case 'aggregat-konfiguration': altAggregate.push(daten); break;
    case 'aggregat-sammlung': altAggregate.push(...(daten.aggregate || [])); break;
    case 'wartungsprotokoll':
      if (daten.aggregat_config) altAggregate.push(daten.aggregat_config);
      if (daten.protokoll) altProtokolle.push(daten.protokoll);
      break;
    case 'protokoll-sammlung': altProtokolle.push(...(daten.protokolle || [])); break;
    default:
      throw new Error(`„${name}“ wurde nicht erkannt. Unterstützt werden Dateien dieser App (auch ältere Versionen).`);
  }
  const anlagen = altAggregate.filter(istAltAggregat).map(migriereAggregat);
  const bekannt = new Map(anlagen.map(a => [a.id, a]));
  const protokolle = [];
  for (const p of altProtokolle.filter(istAltProtokoll)) {
    let a = bekannt.get(p.aggregatId) || await DB.anlagen.hole(p.aggregatId);
    if (!a) a = ersatzAnlage(p.aggregatId);
    protokolle.push(migriereProtokoll(p, a));
  }
  return { anlagen, protokolle, vorlagen: [], einstellungen: null, alt: true };
}

const zeitstempel = (o) => o.geaendert_am || o.erstellt_am || '';

/** Vergleicht mit der Datenbank: neu / neuer / älter / gleich. */
export async function analysiere(pakete) {
  const zusammen = { anlagen: new Map(), protokolle: new Map(), vorlagen: new Map(), einstellungen: null, alt: false };
  const geloescht = {};
  for (const p of pakete) {
    for (const [k, t] of Object.entries(p.geloescht || {})) if (!geloescht[k] || t > geloescht[k]) geloescht[k] = t;
    for (const art of ['anlagen', 'protokolle', 'vorlagen']) {
      for (const o of p[art]) {
        const vorher = zusammen[art].get(o.id);
        if (!vorher || zeitstempel(o) > zeitstempel(vorher)) zusammen[art].set(o.id, o);
      }
    }
    zusammen.einstellungen ||= p.einstellungen;
    zusammen.alt ||= !!p.alt;
  }
  const lokalGeloescht = await DB.einstellung('geloescht', {});
  const ergebnis = { alt: zusammen.alt, einstellungen: zusammen.einstellungen, geloescht, loeschen: [] };
  for (const art of ['anlagen', 'protokolle', 'vorlagen']) {
    ergebnis[art] = [];
    for (const o of zusammen[art].values()) {
      // In einer der Dateien nach dieser Änderung gelöscht → nicht wieder anlegen
      if (geloescht[`${art}:${o.id}`] >= zeitstempel(o)) continue;
      const db = await DB[art].hole(o.id);
      let status = 'neu';
      if (db) {
        const a = zeitstempel(o), b = zeitstempel(db);
        status = a > b ? 'neuer' : a < b ? 'aelter' : 'gleich';
      } else if (lokalGeloescht[`${art}:${o.id}`] >= zeitstempel(o)) {
        status = 'geloescht';
      }
      ergebnis[art].push({ obj: o, status });
    }
  }
  // Auf einem anderen Gerät gelöscht, hier seitdem nicht mehr geändert → hier auch löschen
  for (const [schluessel, zeit] of Object.entries(geloescht)) {
    const [art, ...rest] = schluessel.split(':');
    if (!DB[art]?.hole) continue;
    const db = await DB[art].hole(rest.join(':'));
    if (db && zeitstempel(db) <= zeit) ergebnis.loeschen.push({ art, obj: db });
  }
  return ergebnis;
}

export const beschreibe = {
  anlagen: (a) => anlagenTitel(a.stammdaten),
  protokolle: (p) => `${anlagenTitel(p.anlage?.stammdaten)} · ${p.datum}`,
  vorlagen: (v) => v.name,
};

/** strategie: 'neuere' (Standard) | 'alle' | 'nurNeue' */
export async function importiere(analyse, strategie = 'neuere', { einstellungen = false } = {}) {
  const nehmen = (status) =>
    status === 'neu' || (strategie === 'alle' && status !== 'gleich') || (strategie === 'neuere' && status === 'neuer');
  // strategie 'alle' holt auch hier gelöschte Einträge zurück
  const zaehler = {};
  for (const art of ['vorlagen', 'anlagen', 'protokolle']) {
    const liste = analyse[art].filter(x => nehmen(x.status)).map(x => x.obj);
    if (liste.length) await DB[art].speichereViele(liste);
    zaehler[art] = liste.length;
  }
  zaehler.geloescht = 0;
  if (strategie !== 'nurNeue') {
    for (const { art, obj } of analyse.loeschen) await DB[art].entferne(obj.id);
    zaehler.geloescht = analyse.loeschen.length;
  }
  const lokal = await DB.einstellung('geloescht', {});
  for (const [k, t] of Object.entries(analyse.geloescht || {})) if (!lokal[k] || t > lokal[k]) lokal[k] = t;
  await DB.setzeEinstellung('geloescht', lokal);
  if (einstellungen && analyse.einstellungen) {
    for (const k of EINSTELLUNGEN) {
      if (analyse.einstellungen[k] != null) await DB.setzeEinstellung(k, analyse.einstellungen[k]);
    }
  }
  return zaehler;
}
