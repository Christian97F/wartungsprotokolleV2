import { esc, eindeutigeId, istLeer } from '../core/util.js';
import {
  eingabe, statusSchalter, sektionKopfAktion, listenEditor, fotoLeiste,
  wertText, statusZelle,
} from './helfer.js';

const pruefpunkte = (sek) => sek.elemente.filter(e => e.art !== 'ueberschrift');

export default {
  typ: 'checkliste',
  name: 'Checkliste',
  beschreibung: 'Prüfpunkte mit i.O. / Mangel / n.g., optional mit Messwerten',
  icon: 'liste',

  neu: (titel) => ({ typ: 'checkliste', titel, elemente: [] }),

  neuesElement(liste, art, sek) {
    const ids = sek.elemente.map(e => e.id);
    if (art === 'ueberschrift') return { id: eindeutigeId('gruppe', ids), art: 'ueberschrift', label: '' };
    return { id: eindeutigeId('punkt', ids), label: '', aktiv: true, bewertung: true, messungen: [] };
  },

  editor(sek) {
    return listenEditor(sek.elemente, 'elemente', [
      { key: 'label', label: 'Prüfpunkt', breite: '2' },
      { key: 'hinweis', label: 'Hinweis', platzhalter: 'z. B. Klemme X3 7+8 brücken' },
      { key: 'tag', label: 'Kennz.', platzhalter: 'z. B. A', breite: '.5' },
      { key: 'messungen', label: 'Messwerte', typ: 'messungen', platzhalter: 'z. B. Temperatur [°C]' },
      { key: 'bewertung', label: 'Bewertung', typ: 'bool', breite: '.6' },
    ], {
      neu: [{ label: 'Prüfpunkt' }, { label: 'Zwischenüberschrift', art: 'ueberschrift' }],
      leerText: 'Noch keine Prüfpunkte.',
    });
  },

  aktiverPlan(sek) {
    const elemente = [];
    let ueberschrift = null;
    for (const el of sek.elemente) {
      if (el.art === 'ueberschrift') { ueberschrift = el; continue; }
      if (el.aktiv === false) continue;
      if (ueberschrift) { elemente.push(ueberschrift); ueberschrift = null; }
      const { aktiv, ...rest } = el;
      elemente.push(rest);
    }
    return elemente.length ? { ...sek, elemente } : null;
  },

  initWerte(sek, werte = {}) {
    for (const el of pruefpunkte(sek)) {
      werte[el.id] ??= { s: null, m: {} };
      werte[el.id].m ??= {};
    }
    return werte;
  },

  formular(sek, werte, pfad) {
    const hatBewertung = pruefpunkte(sek).some(e => e.bewertung !== false);
    const kopf = hatBewertung ? `<div class="sek-werkzeug">${sektionKopfAktion('alle_ok', 'Offene auf i.O.')}</div>` : '';
    const zeilen = sek.elemente.map(el => {
      if (el.art === 'ueberschrift') return `<h4 class="cl-ueberschrift">${esc(el.label)}</h4>`;
      const w = werte[el.id];
      const p = `${pfad}.${el.id}`;
      const messungen = (el.messungen || []).map(m => `
        <label class="cl-messung">
          <span class="cl-messung-label">${esc(m.label)}</span>
          ${eingabe(`${p}.m.${m.id}`, w.m[m.id], { typ: m.typ === 'text' ? 'text' : 'zahl', einheit: m.einheit })}
        </label>`).join('');
      const bewertung = el.bewertung !== false;
      return `
        <div class="cl-zeile" data-status="${w.s || ''}">
          <div class="cl-text">
            <span class="cl-label">${esc(el.label)}</span>
            ${el.tag ? `<span class="tag">${esc(el.tag)}</span>` : ''}
            ${el.hinweis ? `<div class="cl-hinweis">${esc(el.hinweis)}</div>` : ''}
          </div>
          <div class="cl-eingaben">
            ${messungen}
            ${bewertung ? statusSchalter(`${p}.s`, w.s) : ''}
          </div>
          ${bewertung ? `<div class="cl-notiz">${eingabe(`${p}.notiz`, w.notiz, { typ: 'text', platzhalter: 'Mangel beschreiben …' })}
            ${fotoLeiste(`${p}.fotos`, w.fotos)}</div>` : ''}
        </div>`;
    }).join('');
    return kopf + `<div class="cl">${zeilen}</div>`;
  },

  aktion(name, _daten, sek, werte) {
    if (name !== 'alle_ok') return false;
    for (const el of pruefpunkte(sek)) {
      if (el.bewertung !== false && !werte[el.id].s) werte[el.id].s = 'ok';
    }
    return true;
  },

  pruefe(sek, werte) {
    const offen = [];
    let gesamt = 0;
    for (const el of pruefpunkte(sek)) {
      const w = werte[el.id];
      if (el.bewertung !== false) {
        gesamt++;
        if (!w.s) offen.push(el.label);
      }
      for (const m of el.messungen || []) {
        gesamt++;
        if (istLeer(w.m[m.id])) offen.push(`${el.label}: ${m.label || 'Messwert'}`);
      }
    }
    return { gesamt, offen };
  },

  maengel(sek, werte) {
    return pruefpunkte(sek)
      .filter(el => werte[el.id]?.s === 'mangel')
      .map(el => ({
        text: `${sek.titel}: ${el.label}`,
        notiz: werte[el.id].notiz || '',
        behoben: !!werte[el.id].behoben,
        pfad: `werte.${sek.id}.${el.id}.behoben`,
        fotos: werte[el.id].fotos || [],
        fotoPfad: `werte.${sek.id}.${el.id}.fotos`,
      }));
  },

  bericht(sek, werte) {
    const hatMessung = pruefpunkte(sek).some(e => e.messungen?.length);
    const zeilen = sek.elemente.map(el => {
      if (el.art === 'ueberschrift') {
        return `<tr class="b-zw"><td colspan="${hatMessung ? 3 : 2}">${esc(el.label)}</td></tr>`;
      }
      const w = werte[el.id] || { m: {} };
      const mess = (el.messungen || []).map(m =>
        `${m.label ? `<span class="b-mlabel">${esc(m.label)}</span> ` : ''}${wertText(w.m?.[m.id], m.einheit)}`).join('<br>');
      return `<tr class="${w.s === 'mangel' ? 'b-mangel' : ''}">
        <td>${esc(el.label)}${el.tag ? ` <span class="b-tag">${esc(el.tag)}</span>` : ''}
          ${w.s === 'mangel' && w.notiz ? `<div class="b-notiz">${esc(w.notiz)}</div>` : ''}</td>
        ${hatMessung ? `<td class="b-mess">${mess}</td>` : ''}
        <td class="b-erg">${el.bewertung !== false ? statusZelle(w.s) : ''}</td>
      </tr>`;
    }).join('');
    return `<table class="b-tabelle">
      <colgroup><col>${hatMessung ? '<col style="width:30%">' : ''}<col style="width:22mm"></colgroup>
      <tbody>${zeilen}</tbody></table>`;
  },
};
