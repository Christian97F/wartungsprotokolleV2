import { esc } from './util.js';
import { icon } from './icons.js';
import { zurueck } from './router.js';

/**
 * Setzt die Kopfzeile. `aktionen` = [{ id, label, icon, art, nurIcon }]
 * – Klicks werden an `onAktion(id, button)` gemeldet.
 */
export function setzeKopf({ titel = '', eyebrow = '', zurueckZu = null, aktionen = [], onAktion, status = '' }) {
  const kopf = document.getElementById('kopf');
  kopf.innerHTML = `
    ${zurueckZu ? `<button class="btn-icon kopf-zurueck" id="kopf-zurueck" aria-label="Zurück">${icon('zurueck')}</button>` : ''}
    <div class="kopf-titel">
      ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
      <h1>${esc(titel)}</h1>
    </div>
    <div class="kopf-status" id="kopf-status">${status}</div>
    <div class="kopf-aktionen">
      ${aktionen.map(a => `<button class="btn ${a.art ? 'btn-' + a.art : 'btn-ghost'} ${a.nurIcon ? 'btn-nur-icon' : ''}"
        data-kopf="${esc(a.id)}" title="${esc(a.label)}" aria-label="${esc(a.label)}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('')}
    </div>`;
  document.title = titel ? `${titel} · Wartungsprotokolle` : 'Wartungsprotokolle';
  if (zurueckZu) kopf.querySelector('#kopf-zurueck').onclick = () => zurueck(zurueckZu);
  kopf.querySelectorAll('[data-kopf]').forEach(b => { b.onclick = () => onAktion?.(b.dataset.kopf, b); });
}

export function setzeKopfStatus(html) {
  const el = document.getElementById('kopf-status');
  if (el) el.innerHTML = html;
}
