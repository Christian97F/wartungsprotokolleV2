// Prüfpunkte einer Vorlage nachträglich in bestehende Anlagen übernehmen.
// Abgleich über die IDs: Vorhandenes bleibt unangetastet, Fehlendes wird an der Stelle
// der Vorlage eingefügt (hinter dem nächsten vorhandenen Vorgänger).
import { klon } from './util.js';

// Listen je Abschnittstyp, deren Einträge einzeln übernommen werden können
const LISTEN = {
  checkliste: ['elemente'], felder: ['elemente'], aufgaben: ['elemente'],
  tabelle: ['zeilen'], messreihe: ['felder'], batterien: ['gruppen', 'lader'],
};

const bezeichnung = (e) => e.label || e.titel || e.name || e.id;
const norm = (t) => String(t || '').trim().toLowerCase();

const rubrikKey = (sek) => sek.id;
const punktKey = (sek, liste, el) => `${sek.id}/${liste}/${el.id}`;

/**
 * Was der Anlage gegenüber der Vorlage fehlt.
 * verdacht: gleichnamiger Eintrag mit anderer ID vorhanden (vermutlich von Hand angelegt).
 */
export function fehlendes(vorlage, anlage) {
  const ergebnis = [];
  for (const sek of vorlage.sektionen) {
    const ziel = anlage.pruefplan.find(s => s.id === sek.id);
    if (!ziel) {
      ergebnis.push({
        key: rubrikKey(sek), art: 'rubrik', rubrik: sek.titel, label: sek.titel, aktiv: sek.aktiv !== false,
        verdacht: anlage.pruefplan.some(s => norm(s.titel) === norm(sek.titel)),
      });
      continue;
    }
    if (ziel.typ !== sek.typ) continue;
    for (const liste of LISTEN[sek.typ] || []) {
      const vorhanden = ziel[liste] || [];
      const ids = new Set(vorhanden.map(e => e.id));
      for (const el of sek[liste] || []) {
        if (ids.has(el.id)) continue;
        ergebnis.push({
          key: punktKey(sek, liste, el), art: el.art === 'ueberschrift' ? 'ueberschrift' : 'punkt',
          rubrik: sek.titel, label: bezeichnung(el), aktiv: el.aktiv !== false,
          verdacht: vorhanden.some(e => norm(bezeichnung(e)) === norm(bezeichnung(el))),
        });
      }
    }
  }
  return ergebnis;
}

// Einfügen hinter den nächsten Vorgänger, der im Ziel existiert; sonst vor den nächsten Nachfolger
function einfuegen(ziel, quelle, el) {
  const i = quelle.indexOf(el);
  for (let j = i - 1; j >= 0; j--) {
    const k = ziel.findIndex(e => e.id === quelle[j].id);
    if (k >= 0) return ziel.splice(k + 1, 0, klon(el));
  }
  for (let j = i + 1; j < quelle.length; j++) {
    const k = ziel.findIndex(e => e.id === quelle[j].id);
    if (k >= 0) return ziel.splice(k, 0, klon(el));
  }
  ziel.push(klon(el));
}

/** Übernimmt die ausgewählten Einträge (Set von keys aus fehlendes()) in die Anlage. Liefert die Anzahl. */
export function uebernehmen(vorlage, anlage, keys) {
  let n = 0;
  for (const sek of vorlage.sektionen) {
    const ziel = anlage.pruefplan.find(s => s.id === sek.id);
    if (!ziel) {
      if (keys.has(rubrikKey(sek))) { einfuegen(anlage.pruefplan, vorlage.sektionen, sek); n++; }
      continue;
    }
    if (ziel.typ !== sek.typ) continue;
    for (const liste of LISTEN[sek.typ] || []) {
      ziel[liste] ??= [];
      for (const el of sek[liste] || []) {
        if (!keys.has(punktKey(sek, liste, el)) || ziel[liste].some(e => e.id === el.id)) continue;
        einfuegen(ziel[liste], sek[liste], el);
        n++;
      }
    }
  }
  return n;
}
