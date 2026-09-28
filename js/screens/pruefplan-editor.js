// Gemeinsamer Editor für Prüfpläne (Anlage) und Vorlagen.
import { esc, holePfad, setzePfad, verschiebe, klon, eindeutigeId } from '../core/util.js';
import { icon } from '../core/icons.js';
import { bestaetigen, menue } from '../core/ui.js';
import { modul, alleTypen } from '../sektionen/registry.js';
import { zahlAusText, messungenAusText } from '../sektionen/_helfer.js';

function zaehle(sek) {
  if (sek.typ === 'batterien') {
    const n = sek.gruppen.filter(g => Number(g.anzahl) > 0).length;
    return `${n} von ${sek.gruppen.length} Gruppen`;
  }
  const liste = (sek.elemente || sek.zeilen || sek.felder || []).filter(e => e.art !== 'ueberschrift');
  return `${liste.filter(e => e.aktiv !== false).length} von ${liste.length} aktiv`;
}

function sektionHtml(sek, i, anzahl, offen) {
  const m = modul(sek.typ);
  return `
    <details class="pp-sektion ${sek.aktiv === false ? 'inaktiv' : ''}" data-i="${i}" ${offen ? 'open' : ''}>
      <summary>
        <span class="pp-nr">${String(i + 1).padStart(2, '0')}</span>
        <span class="pp-titel">${esc(sek.titel || 'Ohne Titel')}</span>
        <span class="tag tag-leise">${esc(m.name)}</span>
        <span class="pp-zahl">${esc(zaehle(sek))}</span>
        <span class="pp-knoepfe">
          <label class="schalter" title="Abschnitt im Protokoll verwenden">
            <input type="checkbox" data-s-aktion="aktiv" ${sek.aktiv !== false ? 'checked' : ''}><span></span></label>
          <button type="button" class="btn-icon" data-s-aktion="hoch" title="Nach oben" ${i === 0 ? 'disabled' : ''}>${icon('hoch')}</button>
          <button type="button" class="btn-icon" data-s-aktion="runter" title="Nach unten" ${i === anzahl - 1 ? 'disabled' : ''}>${icon('runter')}</button>
          <button type="button" class="btn-icon" data-s-aktion="menue" title="Weitere">${icon('mehr')}</button>
        </span>
      </summary>
      <div class="pp-body">
        <div class="feldraster">
          <label class="feld"><span class="feld-label">Titel</span>
            <input class="inp" type="text" data-e-pfad="titel" value="${esc(sek.titel)}"></label>
          <label class="feld"><span class="feld-label">Hinweis im Protokoll</span>
            <input class="inp" type="text" data-e-pfad="hinweis" value="${esc(sek.hinweis || '')}" placeholder="optional"></label>
        </div>
        <div class="pp-inhalt">${m.editor(sek)}</div>
      </div>
    </details>`;
}

/**
 * plan: Array von Sektionen (wird direkt verändert). onChange() bei jeder Änderung.
 */
export function pruefplanEditor(container, plan, onChange) {
  const offen = new Set();

  const zeichne = () => {
    container.innerHTML = `
      <div class="pp">
        ${plan.map((s, i) => sektionHtml(s, i, plan.length, offen.has(s.id))).join('')
          || '<p class="hinweis">Noch keine Abschnitte. Lege unten den ersten an.</p>'}
      </div>
      <div class="pp-neu">
        <span class="pp-neu-label">Abschnitt hinzufügen</span>
        <div class="pp-neu-typen">${alleTypen().map(t => `
          <button type="button" class="pp-typ" data-neu-typ="${t.typ}">${icon(t.icon)}<strong>${esc(t.name)}</strong><span>${esc(t.beschreibung)}</span></button>`).join('')}
        </div>
      </div>`;
  };

  const sektionNeuZeichnen = (i) => {
    const alt = container.querySelector(`.pp-sektion[data-i="${i}"]`);
    const tmp = document.createElement('div');
    tmp.innerHTML = sektionHtml(plan[i], i, plan.length, true);
    alt.replaceWith(tmp.firstElementChild);
  };

  const geaendert = () => onChange?.();

  container.addEventListener('toggle', e => {
    const d = e.target.closest?.('.pp-sektion');
    if (!d) return;
    const id = plan[Number(d.dataset.i)]?.id;
    if (d.open) offen.add(id); else offen.delete(id);
  }, true);

  const eingabeVerarbeiten = (e) => {
    const inp = e.target.closest('[data-e-pfad]');
    const d = e.target.closest('.pp-sektion');
    if (!inp || !d) return;
    const sek = plan[Number(d.dataset.i)];
    const pfad = inp.dataset.ePfad;
    const typ = inp.dataset.eTyp;
    let wert = inp.value;
    if (typ === 'bool') wert = inp.checked;
    else if (typ === 'zahl') wert = zahlAusText(wert);
    else if (typ === 'liste') wert = wert.split(',').map(x => x.trim()).filter(Boolean);
    else if (typ === 'messungen') wert = messungenAusText(wert, holePfad(sek, pfad));
    setzePfad(sek, pfad, wert);

    if (pfad === 'titel') d.querySelector('.pp-titel').textContent = wert || 'Ohne Titel';
    if (typ === 'bool' || pfad.endsWith('anzahl')) {
      d.querySelector('.pp-zahl').textContent = zaehle(sek);
      if (pfad.endsWith('.aktiv')) inp.closest('.le-zeile')?.classList.toggle('inaktiv', !wert);
    }
    geaendert();
  };
  container.addEventListener('input', e => { if (e.target.type !== 'checkbox') eingabeVerarbeiten(e); });
  container.addEventListener('change', e => {
    if (e.target.dataset.sAktion === 'aktiv') {
      const d = e.target.closest('.pp-sektion');
      plan[Number(d.dataset.i)].aktiv = e.target.checked;
      d.classList.toggle('inaktiv', !e.target.checked);
      geaendert();
      return;
    }
    if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') eingabeVerarbeiten(e);
  });

  container.addEventListener('click', async e => {
    const neuTyp = e.target.closest('[data-neu-typ]');
    if (neuTyp) {
      const m = modul(neuTyp.dataset.neuTyp);
      const sek = { id: eindeutigeId(m.typ, plan.map(s => s.id)), aktiv: true, ...m.neu(m.name) };
      plan.push(sek);
      offen.add(sek.id);
      zeichne();
      container.querySelector(`.pp-sektion[data-i="${plan.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      container.querySelector(`.pp-sektion[data-i="${plan.length - 1}"] [data-e-pfad="titel"]`)?.select();
      geaendert();
      return;
    }

    const sAktion = e.target.closest('[data-s-aktion]');
    if (sAktion && sAktion.dataset.sAktion !== 'aktiv') {
      e.preventDefault();
      const i = Number(sAktion.closest('.pp-sektion').dataset.i);
      const aktion = sAktion.dataset.sAktion;
      if (aktion === 'hoch' || aktion === 'runter') {
        verschiebe(plan, i, aktion === 'hoch' ? -1 : 1);
        zeichne();
        geaendert();
      } else if (aktion === 'menue') {
        menue(sAktion, [
          { label: 'Duplizieren', icon: 'kopie', aktion: () => {
            const kopie = { ...klon(plan[i]), id: eindeutigeId(plan[i].id, plan.map(s => s.id)), titel: `${plan[i].titel} (Kopie)` };
            plan.splice(i + 1, 0, kopie);
            zeichne();
            geaendert();
          } },
          { label: 'Entfernen', icon: 'loeschen', gefahr: true, aktion: async () => {
            if (!await bestaetigen(`Abschnitt „${plan[i].titel}“ entfernen?`, { ja: 'Entfernen' })) return;
            plan.splice(i, 1);
            zeichne();
            geaendert();
          } },
        ]);
      }
      return;
    }

    const eAktion = e.target.closest('[data-e-aktion]');
    if (eAktion) {
      const i = Number(eAktion.closest('.pp-sektion').dataset.i);
      const sek = plan[i];
      const liste = holePfad(sek, eAktion.dataset.eListe);
      const idx = Number(eAktion.dataset.eI);
      switch (eAktion.dataset.eAktion) {
        case 'hoch': verschiebe(liste, idx, -1); break;
        case 'runter': verschiebe(liste, idx, 1); break;
        case 'loeschen': liste.splice(idx, 1); break;
        case 'neu': liste.push(modul(sek.typ).neuesElement(eAktion.dataset.eListe, eAktion.dataset.eArt, sek)); break;
      }
      sektionNeuZeichnen(i);
      if (eAktion.dataset.eAktion === 'neu') {
        const felder = container.querySelectorAll(`.pp-sektion[data-i="${i}"] [data-e-liste-root="${eAktion.dataset.eListe}"] .le-zeile`);
        felder[felder.length - 1]?.querySelector('input[type="text"]')?.focus();
      }
      geaendert();
    }
  });

  // Enter in der letzten Zeile legt direkt eine neue an
  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('.le-zeile input[type="text"]')) return;
    e.preventDefault();
    const root = e.target.closest('[data-e-liste-root]');
    const zeilen = [...root.querySelectorAll('.le-zeile')];
    if (e.target.closest('.le-zeile') === zeilen[zeilen.length - 1]) {
      root.querySelector('[data-e-aktion="neu"]')?.click();
    }
  });

  zeichne();
  return { neuZeichnen: zeichne };
}
