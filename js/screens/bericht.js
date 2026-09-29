import { DB } from '../core/db.js';
import { formatDatum, esc } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, dialog } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { anlagenTitel, UNTERSCHRIFT_STANDARD } from '../core/model.js';
import { berichtHtml } from '../io/bericht.js';
import { berichtPdf } from '../io/pdf.js';
import { protokollDateiname, herunterladen, kannTeilen } from '../io/austausch.js';

// Teilen erfordert einen frischen Tipp. Dauert die Erzeugung zu lange (v. a. Safari),
// wird ein Dialog mit eigenem Teilen-Knopf angeboten.
async function pdfAusgeben(blob, name, teilen) {
  if (!teilen) {
    herunterladen(blob, name);
    toast('PDF gespeichert', 'success');
    return;
  }
  const datei = new File([blob], name, { type: 'application/pdf' });
  try {
    await navigator.share({ files: [datei], title: name });
    return;
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  await dialog({
    titel: 'PDF ist fertig',
    inhalt: `<p class="dlg-text">${esc(name)}</p>`,
    aktionen: [
      { label: 'Herunterladen', wert: 'laden', icon: 'import' },
      { label: 'Teilen', wert: 'teilen', art: 'primary', icon: 'teilen' },
    ],
    onOpen: (dlg, schliessen) => {
      dlg.querySelector('[data-dlg-aktion="1"]').addEventListener('click', e => {
        e.stopPropagation();
        navigator.share({ files: [datei], title: name }).catch(() => {});
        schliessen('teilen');
      });
      dlg.querySelector('[data-dlg-aktion="0"]').addEventListener('click', e => {
        e.stopPropagation();
        herunterladen(blob, name);
        schliessen('laden');
      });
    },
  });
}

// ALTFORMAT
async function altExport(id, teilen) {
  try {
    const { exportAltProtokoll } = await import('../io/altformat.js');
    toast(`Exportiert: ${await exportAltProtokoll(id, { teilen })}`, 'success');
  } catch (e) {
    toast(`Export fehlgeschlagen: ${e.message}`, 'error');
  }
}

export async function render(el, params) {
  const p = await DB.protokolle.hole(params.id);
  if (!p) throw new Error('Protokoll nicht gefunden');
  const [firma, usStandard] = await Promise.all([
    DB.einstellung('firma', {}),
    DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD),
  ]);
  const teilen = kannTeilen();
  let beschaeftigt = false;

  // Im Hintergrund vorbereiten: ist das PDF beim Tippen fertig, öffnet „Teilen“ sofort
  let fertig = null;
  const vorbereitet = berichtPdf(p, firma, usStandard).then(b => (fertig = b));
  vorbereitet.catch(() => {});

  const pdf = async () => {
    if (fertig) return pdfAusgeben(fertig, protokollDateiname(p, 'pdf'), teilen);
    if (beschaeftigt) return;
    beschaeftigt = true;
    const knoepfe = el.querySelectorAll('[data-b="pdf"]');
    knoepfe.forEach(b => b.disabled = true);
    try {
      await pdfAusgeben(await vorbereitet, protokollDateiname(p, 'pdf'), teilen);
    } catch (e) {
      console.error(e);
      toast(`PDF konnte nicht erstellt werden: ${e.message}`, 'error', 6000);
    } finally {
      beschaeftigt = false;
      knoepfe.forEach(b => b.disabled = false);
    }
  };

  const drucken = () => {
    const alt = document.title;
    document.title = protokollDateiname(p, 'pdf').replace(/\.pdf$/, '');
    document.documentElement.classList.add('druckt-bericht');
    window.print();
    setTimeout(() => {
      document.title = alt;
      document.documentElement.classList.remove('druckt-bericht');
    }, 500);
  };

  setzeKopf({
    titel: anlagenTitel(p.anlage?.stammdaten),
    eyebrow: `Bericht · ${formatDatum(p.datum)}`,
    zurueckZu: '/protokolle',
    aktionen: [
      { id: 'bearbeiten', label: 'Protokoll', icon: 'protokoll' },
      { id: 'pdf', label: teilen ? 'PDF teilen' : 'PDF', icon: 'pdf', art: 'primary' },
    ],
    onAktion: (id) => {
      if (id === 'pdf') pdf();
      else location.hash = `#/protokoll/${p.id}`;
    },
  });

  el.innerHTML = `
    <div class="bericht-werkzeug">
      ${p.status !== 'abgeschlossen' ? `<div class="banner banner-warn">${icon('warnung')}<div><strong>Entwurf</strong><span>Der Bericht erhält das Wasserzeichen „Entwurf“.</span></div></div>` : ''}
      ${!firma?.name ? `<div class="banner">${icon('info')}<div><strong>Tipp</strong><span>Firmenname, Adresse und Logo für den Briefkopf unter <a href="#/daten">Daten → Briefkopf</a> hinterlegen.</span></div></div>` : ''}
      <div class="bw-knoepfe">
        <button class="btn btn-primary" data-b="pdf">${icon(teilen ? 'teilen' : 'pdf')}${teilen ? 'PDF erstellen & teilen' : 'PDF herunterladen'}</button>
        <button class="btn btn-ghost" data-b="drucken">${icon('drucken')}Drucken</button>
        <button class="btn btn-ghost" data-b="alt">${icon('export')}JSON (altes Format)</button><!-- ALTFORMAT -->
      </div>
      <p class="hinweis">${teilen
        ? 'Über „Teilen“ lässt sich das PDF in „Dateien“ sichern, per Mail senden oder drucken.'
        : 'Das PDF wird direkt erzeugt – ohne Kopf- und Fußzeilen des Browsers.'}</p>
    </div>
    <div class="papier-rahmen">${berichtHtml(p, firma, usStandard)}</div>`;

  // Vorschau auf schmalen Bildschirmen auf Seitenbreite verkleinern
  const rahmen = el.querySelector('.papier-rahmen');
  const ro = new ResizeObserver(() => {
    rahmen.style.setProperty('--zoom', Math.min(1, rahmen.clientWidth / 794).toFixed(3)); // 210 mm bei 96 dpi
  });
  ro.observe(rahmen);

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    if (b.dataset.b === 'pdf') pdf();
    else if (b.dataset.b === 'alt') altExport(p.id, teilen); // ALTFORMAT
    else drucken();
  });
  return () => ro.disconnect();
}
