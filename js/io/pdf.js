// PDF-Bericht direkt im Browser erzeugen (pdfmake, liegt offline in /vendor).
// Unabhängig vom Druckdialog: keine URL/Datum vom Browser, Seitenzahlen auf jeder Seite.
import { formatDatum, formatMonat } from '../core/util.js';
import { modul } from '../sektionen/registry.js';
import { FARBE, feldRaster, th } from '../sektionen/pdfhelfer.js';
import { auswertung, ERGEBNISSE, unterschriftFelder, UNTERSCHRIFT_STANDARD } from '../core/model.js';
import { eckdaten } from './bericht.js';

const BREITE = 515; // A4 (595 pt) minus 2 × 40 pt Rand

let laden = null;

function skript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`${src} konnte nicht geladen werden`));
    document.head.appendChild(s);
  });
}

function ladePdfMake() {
  laden ??= skript('./vendor/pdfmake/pdfmake.min.js')
    .then(() => skript('./vendor/pdfmake/vfs_fonts.js'))
    .then(() => {
      const nur = (fn) => ({ paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3, vLineWidth: () => 0, ...fn });
      window.pdfMake.tableLayouts = {
        linien: nur({ hLineWidth: (i) => (i === 0 ? 0 : 0.5), hLineColor: () => FARBE.line }),
        raster: nur({ hLineWidth: (i) => (i === 0 ? 0 : i === 1 ? 0.8 : 0.5), hLineColor: (i) => (i === 1 ? FARBE.soft : FARBE.line) }),
        leer: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 8, paddingTop: () => 0, paddingBottom: () => 0 },
      };
      return window.pdfMake;
    })
    .catch(e => { laden = null; throw e; });
  return laden;
}

const linie = (farbe = FARBE.ink, dicke = 1) => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: BREITE, y2: 0, lineWidth: dicke, lineColor: farbe }],
});

function sektionTitel(nr, titel) {
  return {
    stack: [
      { text: [{ text: `${String(nr).padStart(2, '0')}   `, style: 'nr' }, { text: titel.toUpperCase(), style: 'h2' }] },
      { ...linie(FARBE.ink, 0.8), margin: [0, 3, 0, 5] },
    ],
    margin: [0, 14, 0, 0],
    headlineLevel: 1,
  };
}

function fotoRaster(fotos) {
  const zeilen = [];
  for (let i = 0; i < fotos.length; i += 3) {
    zeilen.push({ columns: fotos.slice(i, i + 3).map(f => ({ image: f, fit: [140, 105], width: 146 })), columnGap: 6, margin: [0, 4, 0, 0] });
  }
  return { stack: zeilen };
}

function dokument(p, firma = {}, usStandard = UNTERSCHRIFT_STANDARD) {
  const s = p.anlage?.stammdaten || {};
  const a = auswertung(p);
  const erg = ERGEBNISSE[p.ergebnis];
  const ergFarbe = { ok: FARBE.ok, warn: FARBE.warn, fehler: FARBE.fehler }[erg?.art] || FARBE.faint;
  const offen = a.maengel.filter(m => !m.behoben).length;
  let nr = 0;

  const firmaBlock = {
    width: '*',
    columns: [
      ...(firma.logo ? [{ image: firma.logo, fit: [120, 46], width: 'auto', margin: [0, 0, 10, 0] }] : []),
      { stack: [
        firma.name ? { text: firma.name, bold: true, fontSize: 10 } : '',
        firma.adresse ? { text: firma.adresse, style: 'klein' } : '',
        firma.kontakt ? { text: firma.kontakt, style: 'klein' } : '',
      ], width: '*' },
    ],
  };
  const titelBlock = {
    width: 'auto',
    alignment: 'right',
    stack: [
      { text: `WARTUNGSPROTOKOLL${p.anlage?.vorlageName ? ` · ${p.anlage.vorlageName.toUpperCase()}` : ''}`, fontSize: 7, bold: true, color: FARBE.accent, characterSpacing: 1 },
      { text: s.bezeichnung || s.kommission || 'Anlage', fontSize: 17, bold: true, margin: [0, 2, 0, 1] },
      { text: `${s.kommission || ''}   ${formatDatum(p.datum)}`, bold: true, fontSize: 9 },
    ],
  };

  const ergebnisBox = {
    width: 150,
    table: { widths: ['*'], body: [[{ stack: [
      { text: 'ERGEBNIS', style: 'label' },
      { text: (erg?.label || 'nicht bewertet').toUpperCase(), bold: true, fontSize: 12, color: ergFarbe, margin: [0, 1, 0, 2] },
      { text: a.maengel.length ? `${a.maengel.length} Mängel · ${offen} offen` : 'keine Mängel', style: 'klein' },
      p.naechste_pruefung ? { text: [{ text: 'Nächste Prüfung: ', style: 'klein' }, { text: formatMonat(p.naechste_pruefung), bold: true }] } : '',
    ] }]] },
    layout: {
      hLineWidth: () => 1, vLineWidth: (i) => (i === 0 ? 3 : 1),
      hLineColor: () => ergFarbe, vLineColor: () => ergFarbe,
      paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6,
    },
  };

  const metaZellen = [['Datum', formatDatum(p.datum)], ['Techniker', p.meta.techniker || '–'],
    ['Auftrag', p.meta.auftrag || '–'], ...(p.meta.bestellnr ? [['Bestellnr. Kunde', p.meta.bestellnr]] : []),
    ['Status', p.status === 'abgeschlossen' ? 'abgeschlossen' : 'Entwurf']];
  const meta = {
    table: { widths: metaZellen.map(() => '*'), body: [
      metaZellen.map(([l, w]) => ({ stack: [{ text: l.toUpperCase(), style: 'label' }, { text: w }] })),
    ] },
    layout: { fillColor: () => FARBE.sunken, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
    margin: [0, 10, 0, 0],
  };

  const sektionen = p.plan.flatMap(sek => [
    sektionTitel(++nr, sek.titel),
    modul(sek.typ).pdf(sek, p.werte[sek.id] ?? {}),
  ]);

  const maengelZeilen = a.maengel.flatMap((m, i) => {
    const fill = m.behoben ? null : FARBE.mangel;
    const zeile = [
      { text: String(i + 1) },
      { stack: [{ text: m.text }, m.notiz ? { text: m.notiz, style: 'notiz' } : ''] },
      { text: m.prio || '–' },
      m.behoben ? { text: 'behoben', color: FARBE.ok } : { text: 'offen', bold: true, color: FARBE.fehler },
    ].map(z => ({ ...z, fillColor: fill }));
    const fotos = m.fotos?.length ? [[{ text: '' }, { ...fotoRaster(m.fotos), colSpan: 3 }, {}, {}]] : [];
    return [zeile, ...fotos];
  });
  const maengel = a.maengel.length
    ? { table: { widths: [18, '*', 50, 50], headerRows: 1, dontBreakRows: true,
      body: [[th('Nr.'), th('Beschreibung'), th('Priorität'), th('Status')], ...maengelZeilen] }, layout: 'raster' }
    : { text: 'Keine Mängel festgestellt.', color: FARBE.faint };

  const zeige = unterschriftFelder(p, usStandard);
  const unterschrift = (bild, name, rolle) => ({
    width: '*',
    stack: [
      bild ? { image: bild, fit: [220, 55], height: 55 } : { text: '', margin: [0, 55, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 240, y2: 0, lineWidth: 0.8, lineColor: FARBE.ink }], margin: [0, 2, 0, 2] },
      { text: `${rolle}${name ? `: ${name}` : ''}`, style: 'klein' },
    ],
  });
  const unterschriften = zeige.techniker || zeige.kunde ? [{
    unbreakable: true,
    margin: [0, 28, 0, 0],
    columns: [
      ...(zeige.techniker ? [unterschrift(p.unterschriften?.techniker, p.meta.techniker, 'Techniker')] : []),
      ...(zeige.kunde ? [unterschrift(p.unterschriften?.kunde, p.unterschriften?.kunde_name, 'Kunde / Betreiber')] : []),
    ],
    columnGap: 30,
  }] : [];

  const fuss = `${s.kommission || ''} · Wartungsprotokoll vom ${formatDatum(p.datum)}`;

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 46],
    info: { title: `Wartungsprotokoll ${s.kommission || ''} ${formatDatum(p.datum)}`, author: firma.name || '', subject: s.bezeichnung || '' },
    watermark: p.status !== 'abgeschlossen' ? { text: 'ENTWURF', color: FARBE.accent, opacity: 0.08, bold: true } : undefined,
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.15, color: FARBE.ink },
    styles: {
      h2: { fontSize: 10.5, bold: true, characterSpacing: 0.3 },
      nr: { fontSize: 8, color: FARBE.faint },
      th: { fontSize: 6.5, bold: true, color: FARBE.soft, characterSpacing: 0.4 },
      label: { fontSize: 6.5, color: FARBE.faint, characterSpacing: 0.4 },
      klein: { fontSize: 7.5, color: FARBE.soft },
      notiz: { fontSize: 7.5, color: FARBE.fehler },
      tag: { fontSize: 6.5, color: FARBE.soft, bold: true },
      zw: { fontSize: 7, bold: true, color: FARBE.accent, characterSpacing: 0.8, margin: [0, 5, 0, 0] },
    },
    footer: (seite, seiten) => ({
      columns: [
        { text: fuss },
        { text: `Seite ${seite} / ${seiten}`, alignment: 'right', width: 'auto' },
      ],
      margin: [40, 16, 40, 0],
      fontSize: 7,
      color: FARBE.faint,
    }),
    // Abschnittstitel nie allein am Seitenende
    pageBreakBefore: (knoten, folgendeAufSeite) => knoten.headlineLevel === 1 && folgendeAufSeite.length === 0,
    content: [
      { columns: [firmaBlock, titelBlock], columnGap: 20 },
      { ...linie(FARBE.ink, 1.5), margin: [0, 8, 0, 10] },
      { columns: [{ width: '*', ...feldRaster(eckdaten(p)) }, ergebnisBox], columnGap: 16 },
      meta,
      ...sektionen,
      sektionTitel(++nr, 'Mängel'),
      maengel,
      ...(p.bemerkung ? [sektionTitel(++nr, 'Bemerkungen'), { text: p.bemerkung }] : []),
      ...unterschriften,
    ],
  };
}

export async function berichtPdf(p, firma, usStandard) {
  const pdfMake = await ladePdfMake();
  const doc = pdfMake.createPdf(dokument(p, firma, usStandard));
  return new Promise((resolve, reject) => {
    try { doc.getBlob(resolve); } catch (e) { reject(e); }
  });
}

