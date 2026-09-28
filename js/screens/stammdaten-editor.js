// Editor für zusätzliche Stammdaten-Felder (Gruppen mit Feldern) einer Vorlage/Anlage
// und das passende Eingabeformular.
import { esc, eindeutigeId, holePfad, setzePfad, verschiebe } from '../core/util.js';
import { icon } from '../core/icons.js';
import { listenEditor, zahlAusText, zahlInInput } from '../sektionen/_helfer.js';
import { FELD_SPALTEN } from '../sektionen/felder.js';

export function stammdatenGruppenEditor(container, gruppen, onChange) {
  const alleIds = () => gruppen.flatMap(g => g.felder.map(f => f.id));

  const zeichne = () => {
    container.innerHTML = `
      ${gruppen.map((g, gi) => `
        <div class="karte sd-gruppe" data-g="${gi}">
          <div class="sd-kopf">
            <input class="inp inp-titel" type="text" data-e-pfad="${gi}.titel" value="${esc(g.titel)}" placeholder="Gruppenname">
            <label class="check" title="Nicht im Bericht drucken"><input type="checkbox" data-e-pfad="${gi}.intern" data-e-typ="bool" ${g.intern ? 'checked' : ''}><span>Intern</span></label>
            <button type="button" class="btn-icon" data-g-aktion="hoch" ${gi === 0 ? 'disabled' : ''}>${icon('hoch')}</button>
            <button type="button" class="btn-icon" data-g-aktion="runter" ${gi === gruppen.length - 1 ? 'disabled' : ''}>${icon('runter')}</button>
            <button type="button" class="btn-icon gefahr" data-g-aktion="loeschen">${icon('loeschen')}</button>
          </div>
          ${listenEditor(g.felder, `${gi}.felder`, FELD_SPALTEN, { aktivSchalter: false, neu: [{ label: 'Feld' }] })}
        </div>`).join('')}
      <button type="button" class="btn btn-ghost" data-g-aktion="neu">${icon('plus')}Feldgruppe</button>`;
  };

  const lese = (inp) => {
    const t = inp.dataset.eTyp;
    if (t === 'bool') return inp.checked;
    if (t === 'liste') return inp.value.split(',').map(x => x.trim()).filter(Boolean);
    if (t === 'zahl') return zahlAusText(inp.value);
    return inp.value;
  };

  const eingabe = (e) => {
    const inp = e.target.closest('[data-e-pfad]');
    if (!inp) return;
    setzePfad(gruppen, inp.dataset.ePfad, lese(inp));
    onChange?.();
  };
  container.addEventListener('input', e => { if (e.target.type !== 'checkbox') eingabe(e); });
  container.addEventListener('change', e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') eingabe(e); });

  container.addEventListener('click', e => {
    const g = e.target.closest('[data-g-aktion]');
    if (g) {
      const gi = Number(g.closest('[data-g]')?.dataset.g);
      if (g.dataset.gAktion === 'neu') gruppen.push({ id: eindeutigeId('gruppe', gruppen.map(x => x.id)), titel: '', felder: [] });
      else if (g.dataset.gAktion === 'loeschen') gruppen.splice(gi, 1);
      else verschiebe(gruppen, gi, g.dataset.gAktion === 'hoch' ? -1 : 1);
      zeichne();
      onChange?.();
      return;
    }
    const a = e.target.closest('[data-e-aktion]');
    if (!a) return;
    const liste = holePfad(gruppen, a.dataset.eListe);
    const i = Number(a.dataset.eI);
    switch (a.dataset.eAktion) {
      case 'hoch': verschiebe(liste, i, -1); break;
      case 'runter': verschiebe(liste, i, 1); break;
      case 'loeschen': liste.splice(i, 1); break;
      case 'neu': liste.push({ id: eindeutigeId('feld', alleIds()), label: '', typ: 'text' }); break;
    }
    zeichne();
    onChange?.();
  });

  zeichne();
}

// Formular zum Ausfüllen; schreibt über data-a="pfad" in das Zielobjekt (Anlage)
export function stammdatenFeld(feld, wert, pfad) {
  const p = esc(pfad);
  let inp;
  switch (feld.typ) {
    case 'zahl':
      inp = `<input class="inp" type="text" inputmode="decimal" data-a="${p}" data-at="zahl" value="${esc(zahlInInput(wert))}">`;
      if (feld.einheit) inp = `<span class="mit-einheit">${inp}<span class="einheit">${esc(feld.einheit)}</span></span>`;
      break;
    case 'auswahl':
    case 'janein': {
      const opt = feld.typ === 'janein' ? ['ja', 'nein'] : feld.optionen || [];
      inp = `<select class="inp" data-a="${p}"><option value="">–</option>
        ${opt.map(o => `<option ${o === wert ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      break;
    }
    case 'datum':
      inp = `<input class="inp" type="date" data-a="${p}" value="${esc(wert)}">`;
      break;
    case 'textlang':
      inp = `<textarea class="inp" rows="3" data-a="${p}">${esc(wert)}</textarea>`;
      break;
    default:
      inp = `<input class="inp" type="text" data-a="${p}" value="${esc(wert)}">`;
  }
  return `<label class="feld ${feld.typ === 'textlang' ? 'feld-voll' : ''}"><span class="feld-label">${esc(feld.label || 'Feld')}</span>${inp}</label>`;
}

export function bindeFormular(container, ziel, onChange) {
  const verarbeite = (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    let wert = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.at === 'zahl') wert = zahlAusText(wert);
    setzePfad(ziel, el.dataset.a, wert);
    onChange?.(el.dataset.a, wert);
  };
  container.addEventListener('input', verarbeite);
  container.addEventListener('change', verarbeite);
}
