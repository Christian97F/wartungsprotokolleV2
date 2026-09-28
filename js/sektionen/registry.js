// Sektions-Typen als Strategie-Objekte. Jeder Typ implementiert:
//   neu(titel), neuesElement(liste, art, sek), editor(sek)          – Prüfplan-Editor
//   aktiverPlan(sek) → sek | null                                   – Snapshot fürs Protokoll
//   initWerte(sek, werte), formular(sek, werte, pfad), aktion?(…)   – Protokoll-Formular
//   pruefe(sek, werte) → { gesamt, offen[] }, maengel(sek, werte)  – Auswertung
//   bericht(sek, werte)                                             – PDF-Bericht
import checkliste from './checkliste.js';
import felder from './felder.js';
import tabelle from './tabelle.js';
import messreihe from './messreihe.js';
import batterien from './batterien.js';
import aufgaben from './aufgaben.js';

const TYPEN = { checkliste, felder, tabelle, messreihe, batterien, aufgaben };

export function modul(typ) {
  const m = TYPEN[typ];
  if (!m) throw new Error(`Unbekannter Sektionstyp: ${typ}`);
  return m;
}

export const alleTypen = () => Object.values(TYPEN);

export function aktiverPlan(pruefplan) {
  return pruefplan
    .filter(s => s.aktiv !== false)
    .map(s => modul(s.typ).aktiverPlan(structuredClone(s)))
    .filter(Boolean);
}
