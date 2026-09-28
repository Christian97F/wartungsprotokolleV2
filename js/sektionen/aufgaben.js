import { esc, eindeutigeId } from '../core/util.js';
import { listenEditor } from './helfer.js';

export default {
  typ: 'aufgaben',
  name: 'Arbeiten',
  beschreibung: 'Durchgeführte und für die nächste Wartung geplante Arbeiten',
  icon: 'check',

  neu: (titel) => ({ typ: 'aufgaben', titel, elemente: [] }),

  neuesElement: (_l, _a, sek) => ({ id: eindeutigeId('arbeit', sek.elemente.map(e => e.id)), label: '', aktiv: true }),

  editor: (sek) => listenEditor(sek.elemente, 'elemente', [{ key: 'label', label: 'Arbeit' }], { neu: [{ label: 'Arbeit' }] }),

  aktiverPlan(sek) {
    const elemente = sek.elemente.filter(e => e.aktiv !== false).map(({ aktiv, ...r }) => r);
    return elemente.length ? { ...sek, elemente } : null;
  },

  initWerte(sek, werte = {}) {
    for (const el of sek.elemente) werte[el.id] ??= { erledigt: false, geplant: false };
    return werte;
  },

  formular: (sek, werte, pfad) => `
    <div class="aufg">
      <div class="aufg-kopf"><span></span><span>Durchgeführt</span><span>Nächstes Mal</span></div>
      ${sek.elemente.map(el => `
        <div class="aufg-zeile">
          <span>${esc(el.label)}</span>
          <label class="aufg-box" title="Durchgeführt"><input type="checkbox" data-w="${pfad}.${el.id}.erledigt" data-wt="bool" ${werte[el.id].erledigt ? 'checked' : ''}></label>
          <label class="aufg-box" title="Bei nächster Wartung"><input type="checkbox" data-w="${pfad}.${el.id}.geplant" data-wt="bool" ${werte[el.id].geplant ? 'checked' : ''}></label>
        </div>`).join('')}
    </div>`,

  // Häkchen sind optional – kein "offen"-Zustand
  pruefe: () => ({ gesamt: 0, offen: [] }),

  maengel: () => [],

  bericht(sek, werte) {
    const liste = (key) => sek.elemente.filter(e => werte[e.id]?.[key]).map(e => `<li>${esc(e.label)}</li>`).join('')
      || '<li class="b-leer">–</li>';
    return `<div class="b-zweispaltig">
      <div><div class="b-untertitel">Durchgeführt</div><ul class="b-liste">${liste('erledigt')}</ul></div>
      <div><div class="b-untertitel">Geplant für nächste Wartung</div><ul class="b-liste">${liste('geplant')}</ul></div>
    </div>`;
  },
};
