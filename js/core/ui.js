import { esc } from './util.js';
import { icon } from './icons.js';

export function toast(nachricht, typ = 'info', dauer = 3200) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${typ}`;
  el.setAttribute('role', 'status');
  const ic = { success: 'check', error: 'warnung', warning: 'warnung' }[typ] || 'info';
  el.innerHTML = `${icon(ic)}<span>${esc(nachricht)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('weg');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, dauer);
}

/**
 * Modaler Dialog. `inhalt` ist HTML; `aktionen` = [{ label, wert, art }].
 * `vorSchliessen(wert, dialogEl)` darf false liefern, um offen zu bleiben.
 * Resolved mit dem Wert der Aktion oder null (Abbruch / ESC);
 * mit `auslesen(dialogEl)` stattdessen mit { wert, daten }.
 */
export function dialog({ titel = '', inhalt = '', aktionen = [], breit = false, onOpen, vorSchliessen, auslesen }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = `dlg ${breit ? 'dlg-breit' : ''}`;
    dlg.innerHTML = `
      <form method="dialog" class="dlg-form">
        ${titel ? `<header class="dlg-kopf"><h2>${esc(titel)}</h2>
          <button type="button" class="btn-icon" data-dlg-close aria-label="Schließen">${icon('schliessen')}</button></header>` : ''}
        <div class="dlg-inhalt">${inhalt}</div>
        ${aktionen.length ? `<footer class="dlg-fuss">${aktionen.map((a, i) => `
          <button type="button" class="btn ${a.art ? 'btn-' + a.art : 'btn-ghost'}" data-dlg-aktion="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}
        </footer>` : ''}
      </form>`;
    document.body.appendChild(dlg);

    let erledigt = false;
    const schliessen = (wert) => {
      if (erledigt) return;
      erledigt = true;
      const daten = auslesen && wert !== null ? auslesen(dlg) : undefined;
      dlg.close();
      dlg.remove();
      resolve(auslesen ? { wert, daten } : wert);
    };

    dlg.addEventListener('cancel', e => { e.preventDefault(); schliessen(null); });
    dlg.addEventListener('click', async e => {
      if (e.target === dlg) return schliessen(null);
      if (e.target.closest('[data-dlg-close]')) return schliessen(null);
      const btn = e.target.closest('[data-dlg-aktion]');
      if (!btn) return;
      const wert = aktionen[Number(btn.dataset.dlgAktion)].wert;
      if (vorSchliessen && wert !== null && (await vorSchliessen(wert, dlg)) === false) return;
      schliessen(wert);
    });
    dlg.addEventListener('submit', e => e.preventDefault());

    dlg.showModal();
    onOpen?.(dlg, schliessen);
  });
}

export function bestaetigen(text, { titel = 'Bestätigen', ja = 'Ja', art = 'danger' } = {}) {
  return dialog({
    titel,
    inhalt: `<p class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</p>`,
    aktionen: [
      { label: 'Abbrechen', wert: false },
      { label: ja, wert: true, art },
    ],
  }).then(Boolean);
}

export async function eingabe(titel, { label = '', wert = '', platzhalter = '', ok = 'Übernehmen' } = {}) {
  const { wert: aktion, daten } = await dialog({
    titel,
    inhalt: `<label class="feld"><span class="feld-label">${esc(label)}</span>
      <input type="text" name="eingabe" value="${esc(wert)}" placeholder="${esc(platzhalter)}"></label>`,
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: ok, wert: 'ok', art: 'primary' }],
    auslesen: dlg => dlg.querySelector('input').value.trim(),
    onOpen: (dlg, schliessen) => {
      const inp = dlg.querySelector('input');
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); schliessen('ok'); }
      });
    },
  });
  return aktion === 'ok' ? daten : null;
}

// Kleines Kontextmenü an einem Button
export function menue(anker, eintraege) {
  document.querySelectorAll('.popmenue').forEach(m => m.remove());
  const m = document.createElement('div');
  m.className = 'popmenue';
  m.setAttribute('role', 'menu');
  m.innerHTML = eintraege.map((e, i) => e === '-' ? '<hr>' : `
    <button type="button" role="menuitem" class="${e.gefahr ? 'gefahr' : ''}" data-i="${i}">
      ${e.icon ? icon(e.icon) : ''}<span>${esc(e.label)}</span></button>`).join('');
  document.body.appendChild(m);

  const r = anker.getBoundingClientRect();
  const breite = m.offsetWidth;
  const hoehe = m.offsetHeight;
  let links = Math.min(r.right - breite, window.innerWidth - breite - 8);
  let oben = r.bottom + 4;
  if (oben + hoehe > window.innerHeight - 8) oben = r.top - hoehe - 4;
  m.style.left = Math.max(8, links) + 'px';
  m.style.top = Math.max(8, oben) + 'px';

  const weg = (e) => {
    if (e && m.contains(e.target)) return;
    m.remove();
    document.removeEventListener('pointerdown', weg, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', weg, true));
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    weg();
    eintraege[Number(b.dataset.i)].aktion();
  });
}

export function leerZustand(ic, titel, text, knopf = '') {
  return `
    <div class="leer">
      <div class="leer-icon">${icon(ic)}</div>
      <h2>${esc(titel)}</h2>
      <p>${text}</p>
      ${knopf}
    </div>`;
}
