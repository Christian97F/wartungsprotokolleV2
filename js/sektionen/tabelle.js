import { esc, eindeutigeId, istLeer } from '../core/util.js';
import { eingabe, listenEditor, wertText } from './_helfer.js';

export default {
  typ: 'tabelle',
  name: 'Messtabelle',
  beschreibung: 'Zeilen × Spalten, z. B. Zählerstände vor/nach oder L1/L2/L3',
  icon: 'liste',

  neu: (titel) => ({
    typ: 'tabelle', titel,
    spalten: [{ id: 'vor', label: 'Vorher' }, { id: 'nach', label: 'Nachher' }],
    zeilen: [],
  }),

  neuesElement(liste, _art, sek) {
    const ids = sek[liste].map(e => e.id);
    return liste === 'spalten'
      ? { id: eindeutigeId('spalte', ids), label: '' }
      : { id: eindeutigeId('zeile', ids), label: '', einheit: '', aktiv: true };
  },

  editor: (sek) => `
    <div class="editor-block"><h4>Spalten</h4>
      ${listenEditor(sek.spalten, 'spalten', [{ key: 'label', label: 'Spalte' }], { aktivSchalter: false, neu: [{ label: 'Spalte' }] })}
    </div>
    <div class="editor-block"><h4>Zeilen</h4>
      ${listenEditor(sek.zeilen, 'zeilen', [
        { key: 'label', label: 'Messgröße', breite: '2' },
        { key: 'einheit', label: 'Einheit', breite: '.6' },
      ], { neu: [{ label: 'Zeile' }] })}
    </div>`,

  aktiverPlan(sek) {
    const zeilen = sek.zeilen.filter(z => z.aktiv !== false).map(({ aktiv, ...r }) => r);
    return zeilen.length && sek.spalten.length ? { ...sek, zeilen } : null;
  },

  initWerte(sek, werte = {}) {
    for (const z of sek.zeilen) werte[z.id] ??= {};
    return werte;
  },

  formular: (sek, werte, pfad) => `
    <div class="tabelle-wrap"><table class="mtab">
      <thead><tr><th></th>${sek.spalten.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${sek.zeilen.map(z => `<tr>
        <th scope="row">${esc(z.label)}</th>
        ${sek.spalten.map(s => `<td>${eingabe(`${pfad}.${z.id}.${s.id}`, werte[z.id][s.id], { einheit: z.einheit })}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>`,

  pruefe(sek, werte) {
    const offen = [];
    for (const z of sek.zeilen) for (const s of sek.spalten) {
      if (istLeer(werte[z.id]?.[s.id])) offen.push(`${z.label} (${s.label})`);
    }
    return { gesamt: sek.zeilen.length * sek.spalten.length, offen };
  },

  maengel: () => [],

  bericht: (sek, werte) => `
    <table class="b-tabelle b-raster">
      <thead><tr><th></th>${sek.spalten.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${sek.zeilen.map(z => `<tr><td>${esc(z.label)}</td>
        ${sek.spalten.map(s => `<td class="b-zahl">${wertText(werte[z.id]?.[s.id], z.einheit)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`,
};
