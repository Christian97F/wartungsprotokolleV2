import { esc, eindeutigeId, istLeer } from '../core/util.js';
import { icon } from '../core/icons.js';
import { listenEditor, wertText } from './helfer.js';
import { FARBE, pdfWert, th, tabelle, leer } from './pdfhelfer.js';
import { FELD_SPALTEN, feldFormular } from './felder.js';

const leererEintrag = () => ({});

export default {
  typ: 'messreihe',
  name: 'Messreihe',
  beschreibung: 'Wiederholbare Messungen, z. B. Probeläufe mit verschiedenen Laststufen',
  icon: 'blitz',

  neu: (titel) => ({ typ: 'messreihe', titel, eintragLabel: 'Messung', vorgabeAnzahl: 1, felder: [] }),

  neuesElement: (_l, _a, sek) => ({ id: eindeutigeId('feld', sek.felder.map(f => f.id)), label: '', typ: 'zahl', einheit: '', aktiv: true }),

  editor: (sek) => `
    <div class="feldraster editor-block">
      <label class="feld"><span class="feld-label">Bezeichnung je Eintrag</span>
        <input class="inp" type="text" data-e-pfad="eintragLabel" value="${esc(sek.eintragLabel)}" placeholder="z. B. Lauf"></label>
      <label class="feld"><span class="feld-label">Einträge vorab anlegen</span>
        <input class="inp" type="text" inputmode="numeric" data-e-pfad="vorgabeAnzahl" data-e-typ="zahl" value="${sek.vorgabeAnzahl ?? 0}"></label>
    </div>
    <div class="editor-block"><h4>Felder je Eintrag</h4>
      ${listenEditor(sek.felder, 'felder', FELD_SPALTEN, { neu: [{ label: 'Feld' }] })}
    </div>`,

  aktiverPlan(sek) {
    const felder = sek.felder.filter(f => f.aktiv !== false).map(({ aktiv, ...r }) => r);
    return felder.length ? { ...sek, felder } : null;
  },

  initWerte(sek, werte) {
    if (!Array.isArray(werte)) {
      werte = Array.from({ length: Math.max(0, sek.vorgabeAnzahl ?? 0) }, leererEintrag);
    }
    return werte;
  },

  formular: (sek, werte, pfad) => `
    <div class="reihe">
      ${werte.map((eintrag, i) => `
        <div class="reihe-eintrag">
          <div class="reihe-kopf">
            <span class="reihe-nr">${esc(sek.eintragLabel || 'Eintrag')} ${i + 1}</span>
            <button type="button" class="btn-icon gefahr" title="Entfernen" data-w-aktion="entfernen" data-i="${i}">${icon('loeschen')}</button>
          </div>
          <div class="feldraster">${sek.felder.map(f => feldFormular(f, eintrag[f.id], `${pfad}.${i}.${f.id}`)).join('')}</div>
        </div>`).join('')}
      ${werte.length ? '' : `<p class="hinweis">Noch kein Eintrag.</p>`}
      <button type="button" class="btn btn-ghost" data-w-aktion="neu">${icon('plus')}${esc(sek.eintragLabel || 'Eintrag')} hinzufügen</button>
    </div>`,

  aktion(name, daten, _sek, werte) {
    if (name === 'neu') { werte.push(leererEintrag()); return true; }
    if (name === 'entfernen') { werte.splice(Number(daten.i), 1); return true; }
    return false;
  },

  pruefe(sek, werte) {
    const offen = [];
    werte.forEach((e, i) => sek.felder.forEach(f => {
      if (istLeer(e[f.id])) offen.push(`${sek.eintragLabel} ${i + 1}: ${f.label}`);
    }));
    return { gesamt: Math.max(1, werte.length * sek.felder.length), offen: werte.length ? offen : [`Kein ${sek.eintragLabel} erfasst`] };
  },

  maengel: () => [],

  bericht(sek, werte) {
    if (!werte.length) return '<p class="b-leer">Keine Einträge.</p>';
    // Transponiert: Felder als Zeilen, Einträge als Spalten – passt besser auf A4
    return `<table class="b-tabelle b-raster">
      <thead><tr><th></th>${werte.map((_, i) => `<th>${esc(sek.eintragLabel)} ${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${sek.felder.map(f => `<tr><td>${esc(f.label)}</td>
        ${werte.map(e => `<td class="${f.typ === 'zahl' ? 'b-zahl' : ''}">${wertText(e[f.id], f.einheit)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
  },

  pdf(sek, werte) {
    if (!werte.length) return { text: 'Keine Einträge.', color: FARBE.faint };
    return tabelle(
      ['*', ...werte.map(() => 80)],
      [{ text: '' }, ...werte.map((_, i) => th(`${sek.eintragLabel} ${i + 1}`, 'right'))],
      sek.felder.map(f => [
        { text: f.label, color: FARBE.soft },
        ...werte.map(e => ({ ...pdfWert(e[f.id], f.einheit), alignment: 'right' })),
      ]),
      { raster: true },
    );
  },

  // Felder als Zeilen, Einträge als Spalten – so passen auch viele Messwerte auf die Seite
  blanko(sek) {
    const anzahl = Math.max(Number(sek.vorgabeAnzahl) || 0, 3);
    return tabelle(
      [120, ...Array(anzahl).fill('*')],
      [{ text: '' }, ...Array.from({ length: anzahl }, (_, i) => th(`${sek.eintragLabel || 'Eintrag'} ${i + 1}`, 'right'))],
      sek.felder.map(f => [
        { text: `${f.label}${f.einheit ? ` [${f.einheit}]` : ''}`, color: FARBE.soft },
        ...Array.from({ length: anzahl }, () => leer(12)),
      ]),
      { raster: true },
    );
  },
};
