// Dialog: Prüfpunkte einer Vorlage in bestehende Anlagen übernehmen
import { DB } from '../core/db.js';
import { esc, jetztIso } from '../core/util.js';
import { toast, dialog, bestaetigen } from '../core/ui.js';
import { anlagenTitel } from '../core/model.js';
import { fehlendes, uebernehmen } from '../core/verteilen.js';

const ART = { rubrik: 'ganze Rubrik', ueberschrift: 'Zwischenüberschrift', punkt: '' };

export async function inAnlagenUebernehmen(vorlage) {
  const anlagen = (await DB.anlagen.alle())
    .map(a => ({ a, fehlt: fehlendes(vorlage, a) }))
    .filter(x => x.fehlt.length)
    .sort((x, y) => anlagenTitel(x.a.stammdaten).localeCompare(anlagenTitel(y.a.stammdaten), 'de'));
  if (!anlagen.length) {
    toast('Alle Anlagen enthalten bereits sämtliche Prüfpunkte dieser Vorlage', 'info', 4000);
    return;
  }

  // Prüfpunkte über alle Anlagen zusammenfassen, in der Reihenfolge der Vorlage
  const punkte = new Map();
  for (const { a, fehlt } of anlagen) {
    for (const f of fehlt) {
      const p = punkte.get(f.key) ?? { ...f, fehlt: [], verdacht: [] };
      p.fehlt.push(a.id);
      if (f.verdacht) p.verdacht.push(a.id);
      punkte.set(f.key, p);
    }
  }
  const reihenfolge = fehlendes(vorlage, { pruefplan: [] }).map(f => f.key);
  const punktListe = [...punkte.values()].sort((x, y) => reihenfolge.indexOf(x.key) - reihenfolge.indexOf(y.key));

  // Vorauswahl: aktive Punkte, Anlagen dieser Vorlage
  const gewaehltePunkte = new Set(punktListe.filter(p => p.aktiv).map(p => p.key));
  const gewaehlteAnlagen = new Set(anlagen.filter(x => x.a.vorlageId === vorlage.id).map(x => x.a.id));
  let auchVerdacht = false;

  const plan = () => {
    const proAnlage = [];
    for (const { a, fehlt } of anlagen) {
      if (!gewaehlteAnlagen.has(a.id)) continue;
      const keys = new Set(fehlt.filter(f => gewaehltePunkte.has(f.key) && (auchVerdacht || !f.verdacht)).map(f => f.key));
      if (keys.size) proAnlage.push({ a, keys });
    }
    return proAnlage;
  };

  const punktZeile = (p) => `
    <label class="iw-zeile" data-zeile-punkt="${esc(p.key)}">
      <input type="checkbox" data-punkt="${esc(p.key)}">
      <span class="iw-text">${esc(p.label)}${ART[p.art] ? ` <span class="tag tag-leise">${ART[p.art]}</span>` : ''}${p.aktiv ? '' : ' <span class="tag tag-leise">inaktiv</span>'}
        <small>${esc(p.rubrik)} · fehlt in ${p.fehlt.length} Anlage${p.fehlt.length === 1 ? '' : 'n'}${p.verdacht.length ? ` · in ${p.verdacht.length} gleichnamig vorhanden` : ''}</small></span>
    </label>`;
  const anlageZeile = ({ a, fehlt }) => `
    <label class="iw-zeile">
      <input type="checkbox" data-anlage="${esc(a.id)}">
      <span class="iw-text">${esc(anlagenTitel(a.stammdaten))}
        <small>${esc(a.vorlageName || 'ohne Vorlage')} · ${fehlt.length} fehlende Einträge</small></span>
    </label>`;
  const hatVerdacht = punktListe.some(p => p.verdacht.length);

  const { wert } = await dialog({
    titel: 'Prüfpunkte in Anlagen übernehmen',
    breit: true,
    inhalt: `
      <p class="dlg-text">Fehlende Einträge der Vorlage „${esc(vorlage.name)}“ werden an derselben Stelle wie in der Vorlage eingefügt. Vorhandene Prüfpunkte und Anpassungen der Anlagen bleiben unverändert, abgeschlossene Protokolle ebenso.</p>
      <div class="iw-liste vt-liste">
        <div class="iw-gruppe" data-gruppe="anlagen">
          <div class="iw-kopf"><strong>Anlagen</strong>
            <button type="button" class="link" data-alle="anlagen">alle</button><button type="button" class="link" data-keine="anlagen">keine</button></div>
          ${anlagen.map(anlageZeile).join('')}
        </div>
      </div>
      <div class="iw-liste vt-liste">
        <div class="iw-gruppe" data-gruppe="punkte">
          <div class="iw-kopf"><strong>Prüfpunkte</strong>
            <button type="button" class="link" data-alle="punkte">alle</button><button type="button" class="link" data-keine="punkte">keine</button></div>
          ${punktListe.map(punktZeile).join('')}
          <p class="hinweis vt-leer" hidden>Erst oben Anlagen auswählen.</p>
        </div>
      </div>
      ${hatVerdacht ? `<label class="check"><input type="checkbox" name="verdacht">
        <span>Auch einfügen, wo ein gleichnamiger Eintrag schon existiert (sonst übersprungen, um Doppelte zu vermeiden)</span></label>` : ''}`,
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: 'Übernehmen', wert: 'ok', art: 'primary' }],
    onOpen: (dlg) => {
      const knopf = dlg.querySelector('[data-dlg-aktion="1"]');
      const zeige = () => {
        dlg.querySelectorAll('[data-punkt]').forEach(cb => { cb.checked = gewaehltePunkte.has(cb.dataset.punkt); });
        dlg.querySelectorAll('[data-anlage]').forEach(cb => { cb.checked = gewaehlteAnlagen.has(cb.dataset.anlage); });
        // Nur Punkte zeigen, die in mindestens einer ausgewählten Anlage fehlen
        let sichtbar = 0;
        for (const pk of punktListe) {
          const zeigen = pk.fehlt.some(id => gewaehlteAnlagen.has(id));
          dlg.querySelector(`[data-zeile-punkt="${CSS.escape(pk.key)}"]`).hidden = !zeigen;
          sichtbar += zeigen;
        }
        dlg.querySelector('.vt-leer').hidden = sichtbar > 0;
        const p = plan();
        const n = p.reduce((s, x) => s + x.keys.size, 0);
        knopf.disabled = !n;
        knopf.textContent = n ? `Übernehmen (${n} in ${p.length} Anlage${p.length === 1 ? '' : 'n'})` : 'Übernehmen';
      };
      dlg.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.punkt) (t.checked ? gewaehltePunkte.add(t.dataset.punkt) : gewaehltePunkte.delete(t.dataset.punkt));
        if (t.dataset.anlage) (t.checked ? gewaehlteAnlagen.add(t.dataset.anlage) : gewaehlteAnlagen.delete(t.dataset.anlage));
        if (t.name === 'verdacht') auchVerdacht = t.checked;
        zeige();
      });
      dlg.addEventListener('click', e => {
        const b = e.target.closest('[data-alle], [data-keine]');
        if (!b) return;
        const gruppe = b.dataset.alle || b.dataset.keine;
        const set = gruppe === 'punkte' ? gewaehltePunkte : gewaehlteAnlagen;
        const alle = gruppe === 'punkte' ? punktListe.map(p => p.key) : anlagen.map(x => x.a.id);
        alle.forEach(k => (b.dataset.alle ? set.add(k) : set.delete(k)));
        zeige();
      });
      zeige();
    },
    auslesen: () => null,
  });
  if (wert !== 'ok') return;

  const p = plan();
  const n = p.reduce((s, x) => s + x.keys.size, 0);
  const namen = p.slice(0, 8).map(x => `• ${anlagenTitel(x.a.stammdaten)}`).join('\n');
  if (!await bestaetigen(`${n} Einträge in ${p.length} Anlage${p.length === 1 ? '' : 'n'} einfügen?\n\n${namen}${p.length > 8 ? `\n… und ${p.length - 8} weitere` : ''}`,
    { titel: 'Übernehmen bestätigen', ja: 'Einfügen', art: 'primary' })) return;

  let summe = 0;
  for (const { a, keys } of p) {
    summe += uebernehmen(vorlage, a, keys);
    a.geaendert_am = jetztIso();
    await DB.anlagen.speichere(a);
  }
  toast(`${summe} Einträge in ${p.length} Anlage${p.length === 1 ? '' : 'n'} übernommen`, 'success', 4000);
}
