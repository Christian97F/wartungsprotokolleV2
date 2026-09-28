// Druckfertiger HTML-Bericht (A4). Wird in der App angezeigt, über den
// Browser-Druckdialog als PDF gespeichert oder als eigenständige HTML-Datei exportiert.
import { esc, formatDatum, formatMonat, istLeer, formatZahl } from '../core/util.js';
import { modul } from '../sektionen/registry.js';
import { berichtSektion, fotosBericht } from '../sektionen/helfer.js';
import { KERN_STAMMDATEN, auswertung, ERGEBNISSE, unterschriftFelder, UNTERSCHRIFT_STANDARD } from '../core/model.js';

const PRIO = { hoch: 'hoch', mittel: 'mittel', niedrig: 'niedrig' };

export function eckdaten(p) {
  const s = p.anlage?.stammdaten || {};
  const zeilen = [
    ['Kunde', p.meta.kunde || s.kunde],
    ['Standort', p.meta.standort || s.standort],
    ...KERN_STAMMDATEN.filter(f => !['kommission', 'bezeichnung', 'kunde', 'standort'].includes(f.id)).map(f => [f.label, s[f.id]]),
  ];
  for (const g of p.anlage?.zusatzFelder || []) {
    if (g.intern) continue;
    for (const f of g.felder) {
      const w = p.anlage.zusatz?.[f.id];
      if (!istLeer(w)) zeilen.push([f.label, typeof w === 'number' ? `${formatZahl(w)}${f.einheit ? ' ' + f.einheit : ''}` : `${w}${f.einheit && f.typ === 'zahl' ? ' ' + f.einheit : ''}`]);
    }
  }
  if (p.anlage?.vertrag?.aktiv) zeilen.push(['Wartungsvertrag', p.anlage.vertrag.nummer || 'ja']);
  return zeilen.filter(([, w]) => !istLeer(w));
}

export function berichtHtml(p, firma = {}, usStandard = UNTERSCHRIFT_STANDARD) {
  const s = p.anlage?.stammdaten || {};
  const a = auswertung(p);
  const erg = ERGEBNISSE[p.ergebnis];
  const offeneMaengel = a.maengel.filter(m => !m.behoben).length;
  let nr = 0;

  const sektionen = p.plan.map(sek =>
    berichtSektion(++nr, sek.titel, modul(sek.typ).bericht(sek, p.werte[sek.id] ?? {}))).join('');

  const maengel = a.maengel.length ? `
    <table class="b-tabelle">
      <thead><tr><th style="width:8mm">Nr.</th><th>Beschreibung</th><th style="width:20mm">Priorität</th><th style="width:20mm">Status</th></tr></thead>
      <tbody>${a.maengel.map((m, i) => `<tr class="${m.behoben ? '' : 'b-mangel'}">
        <td>${i + 1}</td>
        <td>${esc(m.text)}${m.notiz ? `<div class="b-notiz">${esc(m.notiz)}</div>` : ''}${fotosBericht(m.fotos)}</td>
        <td>${esc(PRIO[m.prio] || '–')}</td>
        <td>${m.behoben ? '✓ behoben' : '<strong>offen</strong>'}</td></tr>`).join('')}
      </tbody></table>` : '<p class="b-leer">Keine Mängel festgestellt.</p>';

  const u = p.unterschriften || {};
  const { techniker: zeigeTechniker, kunde: zeigeKunde } = unterschriftFelder(p, usStandard);
  const unterschrift = (bild, name, rolle) => `
    <div class="b-us">
      <div class="b-us-bild">${bild ? `<img src="${bild}" alt="">` : ''}</div>
      <div class="b-us-linie">${esc(rolle)}${name ? `: ${esc(name)}` : ''}</div>
    </div>`;

  const fuss = `${esc(s.kommission || '')} · Wartungsprotokoll vom ${formatDatum(p.datum)}`;

  return `
    <article class="bericht">
      <!-- Kopf/Fuß der Tabelle wiederholen sich beim Druck auf jeder Seite und ersetzen den
           Seitenrand; @page hat Rand 0, damit der Browser dort keine URL/Datum druckt. -->
      <table class="b-seite">
      <thead><tr><td><div class="b-rand-oben"></div></td></tr></thead>
      <tfoot><tr><td><div class="b-rand-unten"><span>${fuss}</span></div></td></tr></tfoot>
      <tbody><tr><td>
      <header class="b-kopf">
        <div class="b-firma">
          ${firma.logo ? `<img class="b-logo" src="${firma.logo}" alt="">` : ''}
          <div>
            ${firma.name ? `<strong>${esc(firma.name)}</strong>` : ''}
            ${firma.adresse ? `<span>${esc(firma.adresse).replace(/\n/g, '<br>')}</span>` : ''}
            ${firma.kontakt ? `<span>${esc(firma.kontakt).replace(/\n/g, '<br>')}</span>` : ''}
          </div>
        </div>
        <div class="b-titelblock">
          <div class="b-eyebrow">Wartungsprotokoll${p.anlage?.vorlageName ? ` · ${esc(p.anlage.vorlageName)}` : ''}</div>
          <h1>${esc(s.bezeichnung || s.kommission || 'Anlage')}</h1>
          <div class="b-kennung"><span>${esc(s.kommission || '')}</span><span>${formatDatum(p.datum)}</span></div>
        </div>
      </header>

      <section class="b-uebersicht">
        <dl class="b-felder b-eck">
          ${eckdaten(p).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
        <div class="b-ergebnis b-erg-${erg?.art || 'offen'}">
          <span class="b-erg-label">Ergebnis</span>
          <strong>${esc(erg?.label || 'nicht bewertet')}</strong>
          <span>${a.maengel.length ? `${a.maengel.length} Mängel · ${offeneMaengel} offen` : 'keine Mängel'}</span>
          ${p.naechste_pruefung ? `<span>Nächste Prüfung: <b>${formatMonat(p.naechste_pruefung)}</b></span>` : ''}
        </div>
      </section>

      <dl class="b-felder b-meta">
        <div><dt>Datum</dt><dd>${formatDatum(p.datum)}</dd></div>
        <div><dt>Techniker</dt><dd>${esc(p.meta.techniker || '–')}</dd></div>
        ${p.meta.auftrag ? `<div><dt>Auftrag</dt><dd>${esc(p.meta.auftrag)}</dd></div>` : ''}
        <div><dt>Status</dt><dd>${p.status === 'abgeschlossen' ? 'abgeschlossen' : 'Entwurf'}</dd></div>
      </dl>

      ${sektionen}
      ${berichtSektion(++nr, 'Mängel', maengel)}
      ${p.bemerkung ? berichtSektion(++nr, 'Bemerkungen', `<p class="b-text">${esc(p.bemerkung).replace(/\n/g, '<br>')}</p>`) : ''}

      ${zeigeTechniker || zeigeKunde ? `<section class="b-sektion b-abschluss">
        <div class="b-unterschriften">
          ${zeigeTechniker ? unterschrift(u.techniker, p.meta.techniker, 'Techniker') : ''}
          ${zeigeKunde ? unterschrift(u.kunde, u.kunde_name, 'Kunde / Betreiber') : ''}
        </div>
      </section>` : ''}
      </td></tr></tbody>
      </table>
      ${p.status !== 'abgeschlossen' ? '<div class="b-wasserzeichen">ENTWURF</div>' : ''}
    </article>`;
}
