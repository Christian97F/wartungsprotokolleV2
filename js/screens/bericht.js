import { DB } from '../core/db.js';
import { formatDatum } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { anlagenTitel } from '../core/model.js';
import { berichtHtml, eigenstaendigesHtml } from '../io/bericht.js';
import { protokollDateiname, ausgeben, kannTeilen } from '../io/austausch.js';

export async function render(el, params) {
  const p = await DB.protokolle.hole(params.id);
  if (!p) throw new Error('Protokoll nicht gefunden');
  const firma = await DB.einstellung('firma', {});
  const pdfName = protokollDateiname(p, 'pdf').replace(/\.pdf$/, '');

  const drucken = () => {
    // Der Dokumenttitel wird von den meisten Browsern als PDF-Dateiname vorgeschlagen
    const alt = document.title;
    document.title = pdfName;
    document.documentElement.classList.add('druckt-bericht');
    window.print();
    setTimeout(() => {
      document.title = alt;
      document.documentElement.classList.remove('druckt-bericht');
    }, 500);
  };

  const html = async (teilen) => {
    const inhalt = await eigenstaendigesHtml(p, firma, pdfName);
    const r = await ausgeben(new Blob([inhalt], { type: 'text/html' }), protokollDateiname(p, 'html'), { teilen });
    if (r !== 'abgebrochen') toast('Bericht als HTML gespeichert – im Browser öffnen und drucken', 'success', 4500);
  };

  setzeKopf({
    titel: anlagenTitel(p.anlage?.stammdaten),
    eyebrow: `Bericht · ${formatDatum(p.datum)}`,
    zurueckZu: '/protokolle',
    aktionen: [
      { id: 'bearbeiten', label: 'Protokoll', icon: 'protokoll' },
      { id: 'pdf', label: 'PDF / Drucken', icon: 'drucken', art: 'primary' },
    ],
    onAktion: (id) => {
      if (id === 'pdf') drucken();
      else location.hash = `#/protokoll/${p.id}`;
    },
  });

  el.innerHTML = `
    <div class="bericht-werkzeug">
      ${p.status !== 'abgeschlossen' ? `<div class="banner banner-warn">${icon('warnung')}<div><strong>Entwurf</strong><span>Der Bericht wird mit Wasserzeichen „Entwurf“ gedruckt.</span></div></div>` : ''}
      ${!firma?.name ? `<div class="banner">${icon('info')}<div><strong>Tipp</strong><span>Firmenname, Adresse und Logo für den Briefkopf unter <a href="#/daten">Daten → Briefkopf</a> hinterlegen.</span></div></div>` : ''}
      <div class="bw-knoepfe">
        <button class="btn btn-primary" data-b="pdf">${icon('drucken')}Als PDF speichern / drucken</button>
        <button class="btn btn-ghost" data-b="html">${icon('datei')}HTML-Datei</button>
        ${kannTeilen() ? `<button class="btn btn-ghost" data-b="teilen">${icon('teilen')}Teilen</button>` : ''}
      </div>
      <p class="hinweis">Im Druckdialog als Ziel „Als PDF speichern“ bzw. „In PDF drucken“ und Format A4 wählen.</p>
    </div>
    <div class="papier-rahmen">${berichtHtml(p, firma)}</div>`;

  // Vorschau auf schmalen Bildschirmen auf Seitenbreite verkleinern
  const rahmen = el.querySelector('.papier-rahmen');
  const skaliere = () => {
    const z = Math.min(1, rahmen.clientWidth / 794); // 210 mm bei 96 dpi
    rahmen.style.setProperty('--zoom', z.toFixed(3));
  };
  const ro = new ResizeObserver(skaliere);
  ro.observe(rahmen);

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    if (b.dataset.b === 'pdf') drucken();
    else html(b.dataset.b === 'teilen');
  });
  return () => ro.disconnect();
}
