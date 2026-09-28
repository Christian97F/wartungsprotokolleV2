import { esc, eindeutigeId, istLeer } from '../core/util.js';
import { eingabe, listenEditor, wertText } from './helfer.js';

export const FELDTYPEN = [
  ['zahl', 'Zahl / Messwert'],
  ['text', 'Text'],
  ['textlang', 'Text (mehrzeilig)'],
  ['auswahl', 'Auswahl'],
  ['janein', 'Ja / Nein'],
  ['datum', 'Datum'],
];

export const FELD_SPALTEN = [
  { key: 'label', label: 'Bezeichnung', breite: '2' },
  { key: 'typ', label: 'Typ', typ: 'select', optionen: FELDTYPEN },
  { key: 'einheit', label: 'Einheit', breite: '.6', platzhalter: 'V' },
  { key: 'optionen', label: 'Optionen (bei Auswahl)', typ: 'liste', platzhalter: 'a, b, c' },
];

export function feldFormular(feld, wert, pfad) {
  return `<label class="feld ${feld.typ === 'textlang' ? 'feld-voll' : ''}">
    <span class="feld-label">${esc(feld.label)}</span>
    ${eingabe(pfad, wert, { typ: feld.typ, einheit: feld.einheit, optionen: feld.optionen || [] })}
    ${feld.hinweis ? `<span class="feld-hinweis">${esc(feld.hinweis)}</span>` : ''}
  </label>`;
}

export default {
  typ: 'felder',
  name: 'Eingabefelder',
  beschreibung: 'Freie Felder: Messwerte, Text, Auswahl, Datum',
  icon: 'bearbeiten',

  neu: (titel) => ({ typ: 'felder', titel, elemente: [] }),

  neuesElement: (_l, _a, sek) => ({ id: eindeutigeId('feld', sek.elemente.map(e => e.id)), label: '', typ: 'zahl', aktiv: true }),

  editor: (sek) => listenEditor(sek.elemente, 'elemente', FELD_SPALTEN, { neu: [{ label: 'Feld' }] }),

  aktiverPlan(sek) {
    const elemente = sek.elemente.filter(e => e.aktiv !== false).map(({ aktiv, ...r }) => r);
    return elemente.length ? { ...sek, elemente } : null;
  },

  initWerte: (_sek, werte = {}) => werte,

  formular: (sek, werte, pfad) =>
    `<div class="feldraster">${sek.elemente.map(f => feldFormular(f, werte[f.id], `${pfad}.${f.id}`)).join('')}</div>`,

  pruefe(sek, werte) {
    return {
      gesamt: sek.elemente.length,
      offen: sek.elemente.filter(f => istLeer(werte[f.id])).map(f => f.label),
    };
  },

  maengel: () => [],

  bericht(sek, werte) {
    return `<dl class="b-felder">${sek.elemente.map(f => `
      <div class="${f.typ === 'textlang' ? 'b-voll' : ''}"><dt>${esc(f.label)}</dt>
      <dd>${f.typ === 'janein' && werte[f.id] ? (werte[f.id] === 'ja' ? 'Ja' : 'Nein') : wertText(werte[f.id], f.einheit)}</dd></div>`).join('')}
    </dl>`;
  },
};
