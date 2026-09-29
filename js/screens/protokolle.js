import { DB } from '../core/db.js';
import { esc, formatDatum, formatMonat, klon, erzeugeId, jetztIso, heuteIso } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, leerZustand } from '../core/ui.js';
import { setzeKopf } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import { anlagenTitel, auswertung, ERGEBNISSE, planAktualisieren } from '../core/model.js';
import { exportProtokolle } from '../io/austausch.js';
import { exportAltProtokoll } from '../io/altformat.js'; // ALTFORMAT

let filter = { status: 'alle', suche: '' };

export async function render(el, _params, query) {
  if (query.status) filter.status = query.status;
  const anlageFilter = query.anlage || null;

  const [protokolle, anlagen] = await Promise.all([DB.protokolle.alle(), DB.anlagen.alle()]);
  const anlageMap = new Map(anlagen.map(a => [a.id, a]));
  const auswahl = new Set();

  setzeKopf({
    titel: anlageFilter ? `Protokolle · ${anlagenTitel(anlageMap.get(anlageFilter)?.stammdaten)}` : 'Protokolle',
    eyebrow: 'Wartungsberichte',
    zurueckZu: anlageFilter ? '/anlagen' : null,
    aktionen: [{ id: 'export', label: 'Exportieren', icon: 'export' }],
    onAktion: async () => {
      const ids = auswahl.size ? [...auswahl] : sichtbar().map(p => p.id);
      if (!ids.length) return toast('Keine Protokolle zum Exportieren', 'warning');
      toast(`Exportiert: ${await exportProtokolle(ids, { teilen: true })}`, 'success');
    },
  });

  if (!protokolle.length) {
    el.innerHTML = leerZustand('protokoll', 'Noch keine Protokolle',
      'Wähle unter <a href="#/anlagen">Anlagen</a> eine Anlage und starte ein Protokoll.');
    return;
  }

  el.innerHTML = `
    <div class="werkzeugleiste">
      <div class="chips" role="tablist">
        ${[['alle', 'Alle'], ['entwurf', 'Entwürfe'], ['abgeschlossen', 'Abgeschlossen'], ['maengel', 'Mit offenen Mängeln']]
          .map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter.status === k}">${l}</button>`).join('')}
      </div>
      <label class="suchfeld">${icon('suche')}<input type="search" id="suche" placeholder="Suchen …" value="${esc(filter.suche)}"></label>
    </div>
    <div id="auswahlleiste" class="auswahlleiste" hidden></div>
    <div id="liste" class="protokoll-liste"></div>`;

  const offeneMaengel = (p) => auswertung(p).maengel.filter(m => !m.behoben).length;

  function sichtbar() {
    const q = filter.suche.toLowerCase();
    return protokolle
      .filter(p => !anlageFilter || p.anlageId === anlageFilter)
      .filter(p => filter.status === 'alle'
        || (filter.status === 'maengel' ? offeneMaengel(p) > 0 : p.status === filter.status))
      .filter(p => !q || [...Object.values(p.anlage?.stammdaten || {}), p.meta.techniker, p.meta.auftrag, p.meta.kunde, p.datum]
        .some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.geaendert_am || '').localeCompare(a.geaendert_am || ''));
  }

  const zeichneAuswahl = () => {
    const leiste = el.querySelector('#auswahlleiste');
    leiste.hidden = !auswahl.size;
    leiste.innerHTML = `<span>${auswahl.size} ausgewählt</span>
      <button class="btn btn-ghost btn-sm" data-sammel="export">${icon('export')}Exportieren</button>
      <button class="btn btn-ghost btn-sm" data-sammel="leeren">Auswahl aufheben</button>`;
  };

  const zeichne = () => {
    const liste = sichtbar();
    let monat = '';
    el.querySelector('#liste').innerHTML = liste.map(p => {
      const s = p.anlage?.stammdaten || anlageMap.get(p.anlageId)?.stammdaten || {};
      const a = auswertung(p);
      const erg = ERGEBNISSE[p.ergebnis];
      const offen = a.maengel.filter(m => !m.behoben).length;
      const m = (p.datum || '').slice(0, 7);
      const trenner = m !== monat ? `<h3 class="monat">${new Date(m + '-01T00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h3>` : '';
      monat = m;
      return `${trenner}
        <article class="karte prot-karte ${auswahl.has(p.id) ? 'gewaehlt' : ''}">
          <label class="pk-wahl" title="Auswählen"><input type="checkbox" data-wahl="${esc(p.id)}" ${auswahl.has(p.id) ? 'checked' : ''}></label>
          <a class="pk-haupt" href="#/protokoll/${esc(p.id)}">
            <div class="pk-zeile1">
              <span class="kommission">${esc(s.kommission || '—')}</span>
              <span class="pk-titel">${esc(s.bezeichnung || '')}</span>
            </div>
            <div class="pk-meta">
              <span>${icon('kalender')}${formatDatum(p.datum)}</span>
              ${p.meta.techniker ? `<span>${icon('person')}${esc(p.meta.techniker)}</span>` : ''}
              ${p.meta.kunde ? `<span>${esc(p.meta.kunde)}</span>` : ''}
            </div>
            <div class="pk-badges">
              ${p.status === 'abgeschlossen'
                ? `<span class="badge badge-${erg?.art || 'leise'}">${esc(erg?.label || 'Abgeschlossen')}</span>`
                : `<span class="badge badge-entwurf">Entwurf · ${a.prozent} %</span>`}
              ${offen ? `<span class="badge badge-fehler">${offen} offene Mängel</span>` : ''}
              ${p.naechste_pruefung && p.status === 'abgeschlossen' ? `<span class="badge badge-leise">Nächste ${formatMonat(p.naechste_pruefung)}</span>` : ''}
            </div>
          </a>
          <div class="pk-aktionen">
            <a class="btn-icon" href="#/bericht/${esc(p.id)}" title="Bericht / PDF">${icon('pdf')}</a>
            <button class="btn-icon" data-menue="${esc(p.id)}" title="Weitere">${icon('mehr')}</button>
          </div>
        </article>`;
    }).join('') || '<p class="hinweis">Keine Protokolle für diesen Filter.</p>';
  };

  el.addEventListener('click', async e => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter.status = f.dataset.filter;
      el.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b === f));
      zeichne();
      return;
    }
    const sammel = e.target.closest('[data-sammel]');
    if (sammel) {
      if (sammel.dataset.sammel === 'export') toast(`Exportiert: ${await exportProtokolle([...auswahl], { teilen: true })}`, 'success');
      auswahl.clear();
      zeichneAuswahl();
      zeichne();
      return;
    }
    const m = e.target.closest('[data-menue]');
    if (!m) return;
    const p = protokolle.find(x => x.id === m.dataset.menue);
    menue(m, [
      { label: 'Öffnen', icon: 'protokoll', aktion: () => navigiere(`/protokoll/${p.id}`) },
      { label: 'Bericht / PDF', icon: 'pdf', aktion: () => navigiere(`/bericht/${p.id}`) },
      { label: 'Als neuen Entwurf duplizieren', icon: 'kopie', aktion: async () => {
        const anlage = anlageMap.get(p.anlageId);
        if (!anlage) return toast('Die Anlage existiert nicht mehr', 'error');
        const kopie = {
          ...klon(p), id: erzeugeId('p_'), status: 'entwurf', datum: heuteIso(),
          erstellt_am: jetztIso(), geaendert_am: jetztIso(), ergebnis: '',
          unterschriften: { ...p.unterschriften, techniker: null, kunde: null, kunde_name: '' },
        };
        delete kopie.abgeschlossen_am;
        planAktualisieren(kopie, anlage);
        await DB.protokolle.speichere(kopie);
        navigiere(`/protokoll/${kopie.id}`);
      } },
      { label: 'Exportieren', icon: 'export', aktion: async () => toast(`Exportiert: ${await exportProtokolle([p.id], { teilen: true })}`, 'success') },
      { label: 'Exportieren (altes Format)', icon: 'export', aktion: async () => toast(`Exportiert: ${await exportAltProtokoll(p.id, { teilen: true })}`, 'success') }, // ALTFORMAT
      '-',
      { label: 'Löschen', icon: 'loeschen', gefahr: true, aktion: async () => {
        if (!await bestaetigen(`Protokoll vom ${formatDatum(p.datum)} löschen?`, { titel: 'Protokoll löschen', ja: 'Löschen' })) return;
        await DB.protokolle.loesche(p.id);
        protokolle.splice(protokolle.indexOf(p), 1);
        auswahl.delete(p.id);
        toast('Protokoll gelöscht');
        zeichneAuswahl();
        zeichne();
      } },
    ]);
  });

  el.addEventListener('change', e => {
    const w = e.target.closest('[data-wahl]');
    if (!w) return;
    if (w.checked) auswahl.add(w.dataset.wahl); else auswahl.delete(w.dataset.wahl);
    w.closest('.prot-karte').classList.toggle('gewaehlt', w.checked);
    zeichneAuswahl();
  });

  el.querySelector('#suche').addEventListener('input', e => { filter.suche = e.target.value; zeichne(); });
  zeichne();
}
