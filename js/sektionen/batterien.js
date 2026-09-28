import { esc, eindeutigeId, istLeer } from '../core/util.js';
import { eingabe, statusSchalter, checkbox, listenEditor, wertText, statusZelle } from './_helfer.js';

const MESSUNGEN = [
  { id: 'leerlauf', label: 'Leerlaufspannung', einheit: 'V' },
  { id: 'belastung', label: 'Spannung unter Last', einheit: 'V' },
  { id: 'pruefstrom', label: 'Prüfstrom', einheit: 'A' },
  { id: 'saeuredichte', label: 'Säuredichte', einheit: 'kg/l', nurNass: true },
];

const messungenFuer = (g) => MESSUNGEN.filter(m => !m.nurNass || !g.wartungsfrei);
const gruppeBeschreibung = (g) =>
  [g.hersteller, g.typ, g.spannung && `${g.spannung} V`, g.kapazitaet && `${g.kapazitaet} Ah`, g.wartungsfrei && 'wartungsfrei']
    .filter(Boolean).join(' · ');

export default {
  typ: 'batterien',
  name: 'Batterien',
  beschreibung: 'Batteriegruppen mit Einzelmessung je Batterie und Ladegeräten',
  icon: 'blitz',

  neu: (titel) => ({ typ: 'batterien', titel, gruppen: [], lader: [] }),

  neuesElement(liste, _a, sek) {
    const ids = sek[liste].map(e => e.id);
    return liste === 'gruppen'
      ? { id: eindeutigeId('gruppe', ids), name: '', anzahl: 1, spannung: 12, kapazitaet: null, typ: '', hersteller: '', wartungsfrei: true }
      : { id: eindeutigeId('lader', ids), name: '', aktiv: true };
  },

  editor: (sek) => `
    <p class="hinweis">Eine Gruppe erscheint im Protokoll, sobald die Anzahl größer als 0 ist.</p>
    <div class="editor-block"><h4>Batteriegruppen</h4>
      ${listenEditor(sek.gruppen, 'gruppen', [
        { key: 'name', label: 'Gruppe', breite: '1.5', platzhalter: 'z. B. Starterbatterien' },
        { key: 'anzahl', label: 'Anzahl', typ: 'zahl', breite: '.5' },
        { key: 'spannung', label: 'Spannung V', typ: 'zahl', breite: '.6' },
        { key: 'kapazitaet', label: 'Kapazität Ah', typ: 'zahl', breite: '.6' },
        { key: 'hersteller', label: 'Hersteller' },
        { key: 'typ', label: 'Typ' },
        { key: 'wartungsfrei', label: 'Wartungsfrei', typ: 'bool', breite: '.7' },
      ], { aktivSchalter: false, neu: [{ label: 'Batteriegruppe' }] })}
    </div>
    <div class="editor-block"><h4>Ladegeräte</h4>
      ${listenEditor(sek.lader, 'lader', [{ key: 'name', label: 'Ladegerät', platzhalter: 'Hersteller / Typ' }], { neu: [{ label: 'Ladegerät' }] })}
    </div>`,

  aktiverPlan(sek) {
    const gruppen = sek.gruppen.filter(g => Number(g.anzahl) > 0);
    const lader = sek.lader.filter(l => l.aktiv !== false).map(({ aktiv, ...r }) => r);
    return gruppen.length || lader.length ? { ...sek, gruppen, lader } : null;
  },

  initWerte(sek, werte = {}) {
    werte.gruppen ??= {};
    werte.lader ??= {};
    for (const g of sek.gruppen) {
      const liste = werte.gruppen[g.id] ??= [];
      while (liste.length < g.anzahl) liste.push({ klemmen: null });
      liste.length = Number(g.anzahl);
    }
    return werte;
  },

  formular: (sek, werte, pfad) => `
    ${sek.gruppen.map(g => `
      <div class="bat-gruppe">
        <div class="bat-kopf"><strong>${esc(g.name)}</strong><span>${esc(gruppeBeschreibung(g))}</span></div>
        ${werte.gruppen[g.id].map((b, i) => {
          const p = `${pfad}.gruppen.${g.id}.${i}`;
          return `<div class="bat-einzel">
            <span class="bat-nr">${i + 1}</span>
            <div class="feldraster feldraster-eng">
              ${messungenFuer(g).map(m => `<label class="feld"><span class="feld-label">${m.label}</span>
                ${eingabe(`${p}.${m.id}`, b[m.id], { einheit: m.einheit })}</label>`).join('')}
              <div class="feld feld-breit"><span class="feld-label">Anschlussklemmen</span>${statusSchalter(`${p}.klemmen`, b.klemmen)}</div>
              ${g.wartungsfrei ? '' : `<div class="feld feld-check">${checkbox(`${p}.destilliert`, b.destilliert, 'Dest. Wasser nachgefüllt')}</div>`}
            </div>
          </div>`;
        }).join('')}
      </div>`).join('')}
    ${sek.lader.length ? `<div class="bat-gruppe"><div class="bat-kopf"><strong>Ladegeräte</strong></div>
      <div class="feldraster">${sek.lader.map(l => `<label class="feld"><span class="feld-label">${esc(l.name || 'Ladegerät')} – Ladespannung</span>
        ${eingabe(`${pfad}.lader.${l.id}`, werte.lader[l.id], { einheit: 'V' })}</label>`).join('')}</div></div>` : ''}`,

  pruefe(sek, werte) {
    const offen = [];
    let gesamt = 0;
    for (const g of sek.gruppen) {
      werte.gruppen[g.id].forEach((b, i) => {
        for (const m of messungenFuer(g)) {
          gesamt++;
          if (istLeer(b[m.id])) offen.push(`${g.name} ${i + 1}: ${m.label}`);
        }
        gesamt++;
        if (!b.klemmen) offen.push(`${g.name} ${i + 1}: Anschlussklemmen`);
      });
    }
    for (const l of sek.lader) {
      gesamt++;
      if (istLeer(werte.lader[l.id])) offen.push(`${l.name || 'Ladegerät'}: Ladespannung`);
    }
    return { gesamt, offen };
  },

  maengel(sek, werte) {
    const liste = [];
    for (const g of sek.gruppen) {
      werte.gruppen[g.id].forEach((b, i) => {
        if (b.klemmen === 'mangel') {
          liste.push({
            text: `${g.name} ${i + 1}: Anschlussklemmen`, notiz: '', behoben: !!b.behoben,
            pfad: `werte.${sek.id}.gruppen.${g.id}.${i}.behoben`,
          });
        }
      });
    }
    return liste;
  },

  bericht: (sek, werte) => `
    ${sek.gruppen.map(g => {
      const mess = messungenFuer(g);
      return `<div class="b-untertitel">${esc(g.name)} <span>${esc(gruppeBeschreibung(g))}</span></div>
      <table class="b-tabelle b-raster">
        <thead><tr><th>Nr.</th>${mess.map(m => `<th>${m.label}</th>`).join('')}<th>Klemmen</th>${g.wartungsfrei ? '' : '<th>Dest. Wasser</th>'}</tr></thead>
        <tbody>${werte.gruppen[g.id].map((b, i) => `<tr><td>${i + 1}</td>
          ${mess.map(m => `<td class="b-zahl">${wertText(b[m.id], m.einheit)}</td>`).join('')}
          <td>${statusZelle(b.klemmen)}</td>${g.wartungsfrei ? '' : `<td>${b.destilliert ? 'ja' : '–'}</td>`}</tr>`).join('')}
        </tbody></table>`;
    }).join('')}
    ${sek.lader.length ? `<dl class="b-felder">${sek.lader.map(l =>
      `<div><dt>${esc(l.name || 'Ladegerät')} – Ladespannung</dt><dd>${wertText(werte.lader[l.id], 'V')}</dd></div>`).join('')}</dl>` : ''}`,
};
