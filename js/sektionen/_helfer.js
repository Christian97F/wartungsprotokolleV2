// Gemeinsame Bausteine für Formular (data-w…), Editor (data-e…) und Bericht.
import { esc, istLeer, formatZahl } from '../core/util.js';
import { icon } from '../core/icons.js';

export const STATUS = {
  ok:     { label: 'i.O.',   lang: 'In Ordnung',   symbol: '✓' },
  mangel: { label: 'Mangel', lang: 'Mangel',       symbol: '✗' },
  ng:     { label: 'n.g.',   lang: 'Nicht geprüft', symbol: '–' },
};

export function zahlAusText(text) {
  const t = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : String(text).trim();
}

export const zahlInInput = (w) => istLeer(w) ? '' : String(w).replace('.', ',');

// ── Formular ─────────────────────────────────────────────────

export function eingabe(pfad, wert, { typ = 'zahl', einheit = '', platzhalter = '–', optionen = [], klasse = '' } = {}) {
  const p = esc(pfad);
  if (typ === 'text') {
    return `<input class="inp ${klasse}" type="text" data-w="${p}" data-wt="text" value="${esc(wert)}" placeholder="${esc(platzhalter)}">`;
  }
  if (typ === 'textlang') {
    return `<textarea class="inp ${klasse}" data-w="${p}" data-wt="text" rows="3" placeholder="${esc(platzhalter)}">${esc(wert)}</textarea>`;
  }
  if (typ === 'datum') {
    return `<input class="inp ${klasse}" type="date" data-w="${p}" data-wt="text" value="${esc(wert)}">`;
  }
  if (typ === 'janein') {
    return segment(pfad, wert, [['ja', 'Ja'], ['nein', 'Nein']]);
  }
  if (typ === 'auswahl') {
    if (optionen.length <= 4) return segment(pfad, wert, optionen.map(o => [o, o]));
    return `<select class="inp ${klasse}" data-w="${p}" data-wt="text">
      <option value="">–</option>
      ${optionen.map(o => `<option ${o === wert ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  // Zahl: Textfeld mit Dezimaltastatur, damit Komma funktioniert.
  // Bei Temperaturen braucht es das Minus, das die Dezimaltastatur (iOS) nicht hat.
  const modus = /°/.test(einheit) ? 'text' : 'decimal';
  const feld = `<input class="inp inp-zahl ${klasse}" type="text" inputmode="${modus}" autocomplete="off"
    data-w="${p}" data-wt="zahl" value="${esc(zahlInInput(wert))}" placeholder="${esc(platzhalter)}">`;
  return einheit ? `<span class="mit-einheit">${feld}<span class="einheit">${esc(einheit)}</span></span>` : feld;
}

export function segment(pfad, wert, optionen, klasse = '') {
  return `<div class="segment ${klasse}" role="group">
    ${optionen.map(([w, l, zusatz = '']) => `<button type="button" class="seg seg-${esc(w)} ${zusatz}"
      data-w-set="${esc(pfad)}" data-wert="${esc(w)}" aria-pressed="${w === wert}">${esc(l)}</button>`).join('')}
  </div>`;
}

export function statusSchalter(pfad, wert) {
  return segment(pfad, wert, [['ok', 'i.O.'], ['mangel', 'Mangel'], ['ng', 'n.g.']], 'segment-status');
}

export function checkbox(pfad, wert, label) {
  return `<label class="check"><input type="checkbox" data-w="${esc(pfad)}" data-wt="bool" ${wert ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}

export function sektionKopfAktion(aktion, label, ic = 'check') {
  return `<button type="button" class="btn btn-ghost btn-sm" data-w-aktion="${aktion}">${icon(ic)}${esc(label)}</button>`;
}

// ── Editor ───────────────────────────────────────────────────

/**
 * Generische Tabellen-Liste für den Prüfplan-Editor.
 * spalten: [{ key, label, typ: 'text'|'zahl'|'bool'|'select'|'liste'|'messungen', optionen, platzhalter, breite }]
 */
export function listenEditor(liste, name, spalten, { aktivSchalter = true, neu = [], leerText = 'Noch keine Einträge.' } = {}) {
  const zeilen = liste.map((el, i) => {
    if (el.art === 'ueberschrift') {
      return `<div class="le-zeile le-ueberschrift">
        <input class="inp" type="text" data-e-pfad="${name}.${i}.label" value="${esc(el.label)}" placeholder="Zwischenüberschrift">
        ${zeilenKnoepfe(name, i, liste.length)}
      </div>`;
    }
    return `<div class="le-zeile ${aktivSchalter && el.aktiv === false ? 'inaktiv' : ''}">
      ${aktivSchalter ? `<label class="le-aktiv" title="Im Protokoll verwenden">
        <input type="checkbox" data-e-pfad="${name}.${i}.aktiv" data-e-typ="bool" ${el.aktiv !== false ? 'checked' : ''}></label>` : ''}
      <div class="le-felder">
        ${spalten.map(s => editorFeld(`${name}.${i}.${s.key}`, el[s.key], s)).join('')}
      </div>
      ${zeilenKnoepfe(name, i, liste.length)}
    </div>`;
  }).join('');

  return `<div class="le" data-e-liste-root="${name}">
    ${zeilen || `<p class="hinweis">${esc(leerText)}</p>`}
    <div class="le-neu">
      ${neu.map(n => `<button type="button" class="btn btn-ghost btn-sm" data-e-aktion="neu" data-e-liste="${name}" data-e-art="${esc(n.art || '')}">${icon('plus')}${esc(n.label)}</button>`).join('')}
    </div>
  </div>`;
}

function zeilenKnoepfe(name, i, anzahl) {
  return `<div class="le-knoepfe">
    <button type="button" class="btn-icon" title="Nach oben" data-e-aktion="hoch" data-e-liste="${name}" data-e-i="${i}" ${i === 0 ? 'disabled' : ''}>${icon('hoch')}</button>
    <button type="button" class="btn-icon" title="Nach unten" data-e-aktion="runter" data-e-liste="${name}" data-e-i="${i}" ${i === anzahl - 1 ? 'disabled' : ''}>${icon('runter')}</button>
    <button type="button" class="btn-icon gefahr" title="Entfernen" data-e-aktion="loeschen" data-e-liste="${name}" data-e-i="${i}">${icon('loeschen')}</button>
  </div>`;
}

function editorFeld(pfad, wert, s) {
  const p = esc(pfad);
  const stil = s.breite ? `style="--b:${s.breite}"` : '';
  const titel = s.label ? `<span class="le-label">${esc(s.label)}</span>` : '';
  if (s.typ === 'bool') {
    return `<label class="le-feld le-bool" ${stil}><input type="checkbox" data-e-pfad="${p}" data-e-typ="bool" ${wert ? 'checked' : ''}><span>${esc(s.label)}</span></label>`;
  }
  if (s.typ === 'select') {
    return `<label class="le-feld" ${stil}>${titel}<select class="inp" data-e-pfad="${p}">
      ${s.optionen.map(([w, l]) => `<option value="${esc(w)}" ${w === (wert ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select></label>`;
  }
  let text = wert;
  let typ = s.typ || 'text';
  if (typ === 'liste') text = (wert || []).join(', ');
  if (typ === 'messungen') text = messungenAlsText(wert);
  if (typ === 'zahl') text = zahlInInput(wert);
  return `<label class="le-feld" ${stil}>${titel}<input class="inp" type="text" ${typ === 'zahl' ? 'inputmode="decimal"' : ''}
    data-e-pfad="${p}" data-e-typ="${typ}" value="${esc(text)}" placeholder="${esc(s.platzhalter || '')}"></label>`;
}

// "Frostschutz bis [°C]; Druck [bar]" <-> [{ id, label, einheit }]
export function messungenAlsText(messungen) {
  return (messungen || []).map(m => m.einheit ? `${m.label} [${m.einheit}]` : m.label).join('; ');
}

export function messungenAusText(text, alt = []) {
  return String(text || '').split(';').map(t => t.trim()).filter(Boolean).map((t, i) => {
    const treffer = t.match(/^(.*?)\s*\[(.*)\]$/);
    const label = (treffer ? treffer[1] : t).trim();
    const einheit = treffer ? treffer[2].trim() : '';
    const vorher = alt[i];
    return { id: vorher?.id || `m${i + 1}`, label, einheit, ...(einheit === '' && /text/i.test(label) ? { typ: 'text' } : {}) };
  });
}

// ── Bericht ──────────────────────────────────────────────────

export function wertText(wert, einheit = '') {
  if (istLeer(wert)) return '<span class="b-leer">–</span>';
  const t = typeof wert === 'number' ? formatZahl(wert) : esc(wert);
  return einheit ? `${t}&thinsp;${esc(einheit)}` : t;
}

export function statusZelle(s) {
  if (!s) return '<span class="b-status b-offen">○</span>';
  return `<span class="b-status b-${s}">${STATUS[s].symbol} ${STATUS[s].label}</span>`;
}

export function berichtSektion(nr, titel, inhalt) {
  return `<section class="b-sektion">
    <h2><span class="b-nr">${String(nr).padStart(2, '0')}</span>${esc(titel)}</h2>
    ${inhalt}
  </section>`;
}
