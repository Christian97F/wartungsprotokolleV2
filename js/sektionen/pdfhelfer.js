// Bausteine für den PDF-Bericht (pdfmake-Dokumentdefinition)
import { istLeer, formatZahl } from '../core/util.js';

export const FARBE = {
  ink: '#1B2430', soft: '#52627A', faint: '#7C8AA0', line: '#CBD3DB', sunken: '#F2F5F7',
  accent: '#B15A19', ok: '#1F7A5C', fehler: '#B42318', warn: '#9A6400', mangel: '#FDF0EE',
};

export function pdfWert(wert, einheit = '') {
  if (istLeer(wert)) return { text: '–', color: FARBE.faint };
  const t = typeof wert === 'number' ? formatZahl(wert) : String(wert);
  return { text: einheit ? `${t} ${einheit}` : t };
}

export function pdfStatus(s) {
  switch (s) {
    case 'ok': return { text: 'i.O.', color: FARBE.ok, bold: true };
    case 'mangel': return { text: 'Mangel', color: FARBE.fehler, bold: true };
    case 'ng': return { text: 'n.g.', color: FARBE.faint };
    default: return { text: '–', color: FARBE.line };
  }
}

export const th = (text, alignment = 'left') => ({ text: String(text).toUpperCase(), style: 'th', alignment });

export const untertitel = (text, zusatz = '') => ({
  text: [{ text: text.toUpperCase(), bold: true }, zusatz ? { text: `   ${zusatz}`, style: 'klein', bold: false } : ''],
  fontSize: 8.5, margin: [0, 8, 0, 3],
});

/** Raster aus Beschriftung/Wert-Paaren (wie <dl>), `spalten` pro Zeile. */
export function feldRaster(paare, spalten = 3) {
  if (!paare.length) return { text: '' };
  const zellen = paare.map(([label, wert]) => ({
    stack: [{ text: String(label).toUpperCase(), style: 'label' }, typeof wert === 'object' ? wert : { text: String(wert) }],
    margin: [0, 0, 0, 5],
  }));
  while (zellen.length % spalten) zellen.push({ text: '' });
  const body = [];
  for (let i = 0; i < zellen.length; i += spalten) body.push(zellen.slice(i, i + spalten));
  return { table: { widths: Array(spalten).fill('*'), body }, layout: 'leer' };
}

export function tabelle(widths, kopf, zeilen, { raster = false } = {}) {
  return {
    table: { widths, headerRows: kopf ? 1 : 0, dontBreakRows: true, body: kopf ? [kopf, ...zeilen] : zeilen },
    layout: raster ? 'raster' : 'linien',
  };
}

// ── Blanko-Protokoll (zum Ausfüllen von Hand oder im PDF-Viewer) ──

const kaestchen = () => ({
  canvas: [{ type: 'rect', x: 0, y: 1.5, w: 7.5, h: 7.5, lineWidth: 0.7, lineColor: FARBE.soft }], width: 10,
});

/** Ankreuzfelder nebeneinander, z. B. ['i.O.', 'Mangel', 'n.g.'] */
export const ankreuzen = (labels) => {
  const option = (l) => [kaestchen(), { text: l, width: 'auto', noWrap: true, margin: [0, 0, 8, 0] }];
  // Viele oder lange Optionen untereinander, sonst werden sie in schmalen Spalten gequetscht
  if (labels.join('').length > 28) {
    return { stack: labels.map(l => ({ columns: option(l), columnGap: 0, margin: [0, 0, 0, 2] })) };
  }
  return { columns: labels.flatMap(option), columnGap: 0 };
};

/** Leere Schreiblinie, optional mit Einheit am Ende */
export const schreiblinie = (einheit = '', hoehe = 14) => ({
  table: { widths: ['*', 'auto'], body: [[{ text: '', margin: [0, hoehe - 10, 0, 0] }, { text: einheit, style: 'klein' }]] },
  layout: {
    hLineWidth: (i) => (i === 1 ? 0.6 : 0), vLineWidth: () => 0, hLineColor: () => FARBE.soft,
    paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 1,
  },
});

/** Leere Tabellenzelle mit Platz zum Schreiben */
export const leer = (hoehe = 16) => ({ text: '', margin: [0, hoehe / 2, 0, hoehe / 2] });

/** Blanko-Wert je Feldtyp (felder-Modul, Stammdatenfelder) */
export function blankoFeld(f) {
  if (f.typ === 'janein') return ankreuzen(['Ja', 'Nein']);
  if (f.typ === 'auswahl' && f.optionen?.length) return ankreuzen(f.optionen);
  if (f.typ === 'textlang') return { stack: [schreiblinie(), schreiblinie(), schreiblinie()] };
  if (f.typ === 'datum') return schreiblinie('', 14);
  return schreiblinie(f.einheit || '');
}
