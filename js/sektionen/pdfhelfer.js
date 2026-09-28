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
