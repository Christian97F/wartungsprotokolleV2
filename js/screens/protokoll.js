import { DB } from '../core/db.js';
import { esc, jetztIso, setzePfad, holePfad, debounce, formatZeit, formatDatum, erzeugeId } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, dialog } from '../core/ui.js';
import { setzeKopf, setzeKopfStatus } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import {
  neuesProtokoll, planAktualisieren, auswertung, ergebnisVorschlag, anlagenTitel, ERGEBNISSE, UNTERSCHRIFT_STANDARD,
} from '../core/model.js';
import { modul } from '../sektionen/registry.js';
import { zahlAusText, segment, eingabe, checkbox } from '../sektionen/helfer.js';
import { exportProtokolle } from '../io/austausch.js';
import { unterschriftFeld } from './unterschrift.js';

let p = null;
let el = null;
let speichertGleich = null;
let ausstehend = false;

const gesperrt = () => p?.status === 'abgeschlossen';

async function jetztSpeichern() {
  if (!ausstehend) return;
  ausstehend = false;
  p.geaendert_am = jetztIso();
  await DB.protokolle.speichere(p);
  setzeKopfStatus(`<span class="status-punkt status-ok">Gespeichert ${formatZeit(p.geaendert_am)}</span>`);
}

function geaendert() {
  ausstehend = true;
  setzeKopfStatus('<span class="status-punkt status-speichert">Speichert …</span>');
  speichertGleich();
  aktualisiereFortschritt();
}

// ── Rendering ────────────────────────────────────────────────

const nr = (i) => String(i).padStart(2, '0');

function metaHtml() {
  const m = p.meta;
  return `
    <section class="karte sek" id="s--meta">
      <header class="sek-kopf"><span class="sek-nr">00</span><h2>Allgemein</h2></header>
      <div class="feldraster">
        <label class="feld"><span class="feld-label">Datum *</span>
          <input class="inp" type="date" data-w="datum" data-wt="text" value="${esc(p.datum)}"></label>
        <label class="feld"><span class="feld-label">Techniker *</span>
          <input class="inp" type="text" data-w="meta.techniker" data-wt="text" value="${esc(m.techniker)}" placeholder="Vor- und Nachname" autocomplete="name"></label>
        <label class="feld"><span class="feld-label">Auftrags-/Projektnummer</span>
          <input class="inp" type="text" data-w="meta.auftrag" data-wt="text" value="${esc(m.auftrag)}"></label>
        <label class="feld"><span class="feld-label">Kunde</span>
          <input class="inp" type="text" data-w="meta.kunde" data-wt="text" value="${esc(m.kunde)}"></label>
        <label class="feld feld-voll"><span class="feld-label">Standort</span>
          <input class="inp" type="text" data-w="meta.standort" data-wt="text" value="${esc(m.standort)}"></label>
      </div>
    </section>`;
}

function sektionHtml(sek, i) {
  const m = modul(sek.typ);
  return `
    <section class="karte sek" id="s-${esc(sek.id)}" data-sek="${esc(sek.id)}">
      <header class="sek-kopf">
        <span class="sek-nr">${nr(i + 1)}</span>
        <h2>${esc(sek.titel)}</h2>
        <span class="sek-stand" data-stand="${esc(sek.id)}"></span>
      </header>
      ${sek.hinweis ? `<p class="hinweis">${esc(sek.hinweis)}</p>` : ''}
      <div class="sek-body">${m.formular(sek, p.werte[sek.id], `werte.${sek.id}`)}</div>
    </section>`;
}

function maengelHtml() {
  const a = auswertung(p);
  const abgeleitet = a.maengel.filter(x => x.quelle === 'pruefpunkt');
  return `
    <header class="sek-kopf"><span class="sek-nr">${nr(p.plan.length + 1)}</span><h2>Mängel</h2>
      <span class="sek-stand">${a.maengel.length ? `<span class="zaehler zaehler-fehler">${a.maengel.length}</span>` : ''}</span></header>
    ${abgeleitet.length ? `<div class="mg-liste">${abgeleitet.map(m => `
      <div class="mg-zeile">
        <div class="mg-text"><span class="tag tag-fehler">Prüfpunkt</span> ${esc(m.text)}
          ${m.notiz ? `<div class="mg-notiz">${esc(m.notiz)}</div>` : ''}</div>
        <label class="check"><input type="checkbox" data-w="${esc(m.pfad)}" data-wt="bool" data-mg ${m.behoben ? 'checked' : ''}><span>behoben</span></label>
      </div>`).join('')}</div>` : ''}
    <div class="mg-liste">${p.maengel.map((m, i) => `
      <div class="mg-zeile mg-manuell">
        <div class="mg-text">${eingabe(`maengel.${i}.text`, m.text, { typ: 'text', platzhalter: 'Mangel beschreiben …' })}</div>
        ${segment(`maengel.${i}.prio`, m.prio, [['niedrig', 'niedrig'], ['mittel', 'mittel'], ['hoch', 'hoch']], 'segment-prio')}
        <label class="check"><input type="checkbox" data-w="maengel.${i}.behoben" data-wt="bool" data-mg ${m.behoben ? 'checked' : ''}><span>behoben</span></label>
        <button type="button" class="btn-icon gefahr" data-m-aktion="loeschen" data-i="${i}" title="Entfernen">${icon('loeschen')}</button>
      </div>`).join('')}</div>
    ${!a.maengel.length ? '<p class="hinweis">Keine Mängel. Prüfpunkte mit „Mangel“ erscheinen hier automatisch.</p>' : ''}
    <button type="button" class="btn btn-ghost" data-m-aktion="neu">${icon('plus')}Weiteren Mangel erfassen</button>`;
}

function abschlussHtml() {
  const u = p.unterschriften;
  return `
    <section class="karte sek" id="s--abschluss">
      <header class="sek-kopf"><span class="sek-nr">${nr(p.plan.length + 2)}</span><h2>Abschluss</h2></header>
      <div class="feld feld-voll">
        <span class="feld-label">Gesamtergebnis *</span>
        ${segment('ergebnis', p.ergebnis, Object.entries(ERGEBNISSE).map(([k, v]) => [k, v.label, `seg-erg-${v.art}`]), 'segment-gross')}
        <div id="erg-vorschlag"></div>
      </div>
      <label class="feld feld-voll"><span class="feld-label">Bemerkungen</span>
        <textarea class="inp" rows="4" data-w="bemerkung" data-wt="text" placeholder="Hinweise, Empfehlungen, Beobachtungen …">${esc(p.bemerkung)}</textarea></label>
      <div class="feldraster">
        <label class="feld"><span class="feld-label">Nächste Prüfung</span>
          <input class="inp" type="month" data-w="naechste_pruefung" data-wt="text" value="${esc(p.naechste_pruefung)}"></label>
      </div>
      <div class="feld feld-voll us-wahl">
        <span class="feld-label">Unterschriftsfelder im Bericht</span>
        <div class="knopfreihe">
          ${checkbox('unterschriften.zeigeTechniker', u.zeigeTechniker, 'Techniker')}
          ${checkbox('unterschriften.zeigeKunde', u.zeigeKunde, 'Kunde / Betreiber')}
        </div>
      </div>
      <div class="unterschriften">
        <div class="feld" data-us="zeigeTechniker" ${u.zeigeTechniker ? '' : 'hidden'}><span class="feld-label">Unterschrift Techniker</span><div id="us-techniker"></div></div>
        <div class="feld" data-us="zeigeKunde" ${u.zeigeKunde ? '' : 'hidden'}><span class="feld-label">Unterschrift Kunde</span><div id="us-kunde"></div>
          <input class="inp" type="text" data-w="unterschriften.kunde_name" data-wt="text" value="${esc(u.kunde_name)}" placeholder="Name in Druckbuchstaben"></div>
      </div>
    </section>`;
}

function navHtml() {
  const eintraege = [
    ['-meta', 'Allgemein'],
    ...p.plan.map(s => [s.id, s.titel]),
    ['-maengel', 'Mängel'],
    ['-abschluss', 'Abschluss'],
  ];
  return `
    <div class="fortschritt"><div class="fs-balken"><span id="fs-balken"></span></div><span id="fs-text"></span></div>
    <nav class="prot-sprung">${eintraege.map(([id, t]) =>
      `<a href="#s-${esc(id)}" data-sprung="${esc(id)}"><span class="sprung-punkt" data-punkt="${esc(id)}"></span>${esc(t)}</a>`).join('')}
    </nav>`;
}

function zeichne() {
  el.innerHTML = `
    <div class="prot">
      <aside class="prot-nav">${navHtml()}</aside>
      <div class="prot-inhalt">
        ${gesperrt() ? `<div class="banner banner-ok">${icon('schloss')}
          <div><strong>Abgeschlossen am ${formatDatum(p.abgeschlossen_am || p.geaendert_am)}</strong><span>Das Protokoll ist schreibgeschützt.</span></div>
          <button class="btn btn-ghost btn-sm" id="entsperren">${icon('offen')}Bearbeiten</button></div>` : ''}
        <fieldset class="prot-fs" ${gesperrt() ? 'disabled' : ''}>
          ${metaHtml()}
          ${p.plan.map(sektionHtml).join('')}
          <section class="karte sek" id="s--maengel">${maengelHtml()}</section>
          ${abschlussHtml()}
        </fieldset>
        <div class="fuss-aktionen">
          <a class="btn btn-ghost btn-gross" href="#/bericht/${esc(p.id)}">${icon('pdf')}Bericht / PDF</a>
          ${gesperrt() ? '' : `<button class="btn btn-primary btn-gross" id="abschliessen">${icon('check')}Protokoll abschließen</button>`}
        </div>
      </div>
    </div>`;

  unterschriftFeld(el.querySelector('#us-techniker'), p.unterschriften?.techniker, v => { p.unterschriften.techniker = v; geaendert(); }, { gesperrt });
  unterschriftFeld(el.querySelector('#us-kunde'), p.unterschriften?.kunde, v => { p.unterschriften.kunde = v; geaendert(); }, { gesperrt });
  el.querySelector('#abschliessen')?.addEventListener('click', abschliessen);
  el.querySelector('#entsperren')?.addEventListener('click', entsperren);
  aktualisiereFortschritt();
}

function sektionNeuZeichnen(sekId) {
  const i = p.plan.findIndex(s => s.id === sekId);
  const alt = el.querySelector(`[data-sek="${CSS.escape(sekId)}"]`);
  const tmp = document.createElement('div');
  tmp.innerHTML = sektionHtml(p.plan[i], i);
  alt.replaceWith(tmp.firstElementChild);
}

function maengelNeuZeichnen() {
  const fokus = document.activeElement?.dataset?.w;
  el.querySelector('#s--maengel').innerHTML = maengelHtml();
  if (fokus) el.querySelector(`#s--maengel [data-w="${CSS.escape(fokus)}"]`)?.focus();
}

function aktualisiereFortschritt() {
  const a = auswertung(p);
  el.querySelector('#fs-balken').style.width = `${a.prozent}%`;
  el.querySelector('#fs-text').textContent = a.offen.length
    ? `${a.prozent} % · ${a.gesamt - a.erledigt} offen`
    : `${a.prozent} % · vollständig`;

  const offenProSek = new Map(a.offen.map(o => [o.id, o.punkte.length]));
  for (const sek of p.plan) {
    const n = offenProSek.get(sek.id) || 0;
    const stand = el.querySelector(`[data-stand="${CSS.escape(sek.id)}"]`);
    const r = modul(sek.typ).pruefe(sek, p.werte[sek.id]);
    if (stand) {
      stand.innerHTML = r.gesamt === 0 ? '' : n ? `<span class="zaehler">${r.gesamt - n}/${r.gesamt}</span>` : `<span class="zaehler zaehler-ok">${icon('check')}</span>`;
    }
    el.querySelector(`[data-punkt="${CSS.escape(sek.id)}"]`)?.setAttribute('data-zustand', r.gesamt === 0 ? '' : n ? 'offen' : 'fertig');
  }
  const metaOk = p.datum && p.meta.techniker.trim();
  el.querySelector('[data-punkt="-meta"]')?.setAttribute('data-zustand', metaOk ? 'fertig' : 'offen');
  el.querySelector('[data-punkt="-maengel"]')?.setAttribute('data-zustand', a.maengel.some(m => !m.behoben) ? 'fehler' : '');
  el.querySelector('[data-punkt="-abschluss"]')?.setAttribute('data-zustand', p.ergebnis ? 'fertig' : 'offen');

  const vorschlag = ergebnisVorschlag(a);
  const box = el.querySelector('#erg-vorschlag');
  if (box) {
    box.innerHTML = !gesperrt() && p.ergebnis !== vorschlag
      ? `<p class="hinweis erg-hinweis">${a.maengel.length} Mängel erfasst${a.maengel.length ? `, davon ${a.maengel.filter(m => m.behoben).length} behoben` : ''} – Vorschlag: <button type="button" class="link" data-vorschlag="${vorschlag}">${ERGEBNISSE[vorschlag].label}</button></p>`
      : '';
  }
}

// ── Interaktion ──────────────────────────────────────────────

function binde() {
  const schreibe = (inp) => {
    if (gesperrt()) return;
    const t = inp.dataset.wt;
    const wert = t === 'bool' ? inp.checked : t === 'zahl' ? zahlAusText(inp.value) : inp.value;
    setzePfad(p, inp.dataset.w, wert);
    geaendert();
    if (inp.hasAttribute('data-mg')) aktualisiereFortschritt();
    const us = inp.dataset.w.match(/^unterschriften\.(zeige\w+)$/);
    if (us) el.querySelector(`[data-us="${us[1]}"]`).hidden = !wert;
    if (/\.notiz$/.test(inp.dataset.w)) maengelNeuZeichnenSpaeter();
  };
  const maengelNeuZeichnenSpaeter = debounce(maengelNeuZeichnen, 600);

  el.addEventListener('input', e => {
    const inp = e.target.closest('[data-w]');
    if (inp && inp.type !== 'checkbox') schreibe(inp);
  });
  el.addEventListener('change', e => {
    const inp = e.target.closest('[data-w]');
    if (!inp) return;
    if (inp.type === 'checkbox' || inp.tagName === 'SELECT') schreibe(inp);
    // Zahlen nach Verlassen des Feldes einheitlich formatieren
    if (inp.dataset.wt === 'zahl') {
      const w = holePfad(p, inp.dataset.w);
      if (typeof w === 'number') inp.value = String(w).replace('.', ',');
    }
  });

  el.addEventListener('click', e => {
    if (gesperrt()) return;
    const set = e.target.closest('[data-w-set]');
    if (set) {
      const pfad = set.dataset.wSet;
      const neu = holePfad(p, pfad) === set.dataset.wert ? null : set.dataset.wert;
      setzePfad(p, pfad, neu);
      set.parentElement.querySelectorAll('[data-w-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.wert === neu));
      const zeile = set.closest('[data-status]');
      if (zeile && pfad.endsWith('.s')) {
        zeile.dataset.status = neu || '';
        if (neu === 'mangel') zeile.querySelector('.cl-notiz input')?.focus();
      }
      geaendert();
      if (/\.(s|klemmen)$/.test(pfad)) maengelNeuZeichnen();
      return;
    }

    const vorschlag = e.target.closest('[data-vorschlag]');
    if (vorschlag) {
      el.querySelector(`[data-w-set="ergebnis"][data-wert="${vorschlag.dataset.vorschlag}"]`)?.click();
      return;
    }

    const aktion = e.target.closest('[data-w-aktion]');
    if (aktion) {
      const sekId = aktion.closest('[data-sek]').dataset.sek;
      const sek = p.plan.find(s => s.id === sekId);
      if (modul(sek.typ).aktion?.(aktion.dataset.wAktion, aktion.dataset, sek, p.werte[sekId])) {
        sektionNeuZeichnen(sekId);
        geaendert();
        maengelNeuZeichnen();
      }
      return;
    }

    const mAktion = e.target.closest('[data-m-aktion]');
    if (mAktion) {
      if (mAktion.dataset.mAktion === 'neu') {
        p.maengel.push({ id: erzeugeId('m'), text: '', prio: 'mittel', behoben: false });
      } else {
        p.maengel.splice(Number(mAktion.dataset.i), 1);
      }
      maengelNeuZeichnen();
      if (mAktion.dataset.mAktion === 'neu') {
        el.querySelector(`#s--maengel [data-w="maengel.${p.maengel.length - 1}.text"]`)?.focus();
      }
      geaendert();
    }
  });

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-sprung]');
    if (!a) return;
    e.preventDefault();
    el.querySelector(`#s-${CSS.escape(a.dataset.sprung)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ── Aktionen ─────────────────────────────────────────────────

async function abschliessen() {
  await jetztSpeichern();
  const a = auswertung(p);
  if (a.pflicht.length) {
    toast(`Bitte ausfüllen: ${a.pflicht.join(', ')}`, 'error', 4500);
    const ziel = a.pflicht[0] === 'Gesamtergebnis' ? '#s--abschluss' : '#s--meta';
    el.querySelector(ziel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (a.offen.length) {
    const wahl = await dialog({
      titel: 'Noch nicht alles ausgefüllt',
      breit: true,
      inhalt: `<p class="dlg-text">${a.gesamt - a.erledigt} Angaben sind noch offen:</p>
        <div class="offen-liste">${a.offen.map(o => `
          <div><strong>${esc(o.sektion)}</strong><ul>${o.punkte.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}
          ${o.punkte.length > 8 ? `<li>… und ${o.punkte.length - 8} weitere</li>` : ''}</ul></div>`).join('')}</div>`,
      aktionen: [
        { label: 'Weiter ausfüllen', wert: 'zurueck' },
        { label: 'Trotzdem abschließen', wert: 'ja', art: 'primary' },
      ],
    });
    if (wahl !== 'ja') {
      if (wahl === 'zurueck') el.querySelector(`#s-${CSS.escape(a.offen[0].id)}`)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  }
  p.status = 'abgeschlossen';
  p.abgeschlossen_am = jetztIso();
  ausstehend = true;
  await jetztSpeichern();
  await DB.setzeEinstellung('techniker', p.meta.techniker);
  toast('Protokoll abgeschlossen', 'success');
  navigiere(`/bericht/${p.id}`);
}

async function entsperren() {
  if (!await bestaetigen('Das Protokoll wird wieder zum Entwurf und kann bearbeitet werden.', { titel: 'Protokoll bearbeiten', ja: 'Bearbeiten', art: 'primary' })) return;
  p.status = 'entwurf';
  delete p.abgeschlossen_am;
  ausstehend = true;
  await jetztSpeichern();
  kopf();
  zeichne();
}

function kopf() {
  setzeKopf({
    titel: anlagenTitel(p.anlage?.stammdaten),
    eyebrow: `Protokoll · ${gesperrt() ? 'Abgeschlossen' : 'Entwurf'} · ${formatDatum(p.datum)}`,
    zurueckZu: '/protokolle',
    status: gesperrt() ? '' : `<span class="status-punkt status-ok">Automatisch gespeichert</span>`,
    aktionen: [
      { id: 'mehr', label: 'Weitere Aktionen', icon: 'mehr', nurIcon: true },
      { id: 'bericht', label: 'Bericht', icon: 'pdf' },
    ],
    onAktion: async (id, btn) => {
      await jetztSpeichern();
      if (id === 'bericht') return navigiere(`/bericht/${p.id}`);
      menue(btn, [
        { label: 'Prüfplan der Anlage bearbeiten', icon: 'einstellungen', aktion: () => navigiere(`/anlage/${encodeURIComponent(p.anlageId)}?tab=plan`) },
        { label: 'Als Datei exportieren', icon: 'export', aktion: async () => toast(`Exportiert: ${await exportProtokolle([p.id], { teilen: true })}`, 'success') },
        '-',
        { label: 'Protokoll löschen', icon: 'loeschen', gefahr: true, aktion: async () => {
          if (!await bestaetigen('Dieses Protokoll endgültig löschen?', { titel: 'Protokoll löschen', ja: 'Löschen' })) return;
          ausstehend = false;
          await DB.protokolle.loesche(p.id);
          toast('Protokoll gelöscht');
          navigiere('/protokolle', { ersetzen: true });
        } },
      ]);
    },
  });
}

export async function render(container, params, query) {
  el = container;
  ausstehend = false;
  speichertGleich = debounce(jetztSpeichern, 700);

  if (params.id === 'neu') {
    const anlage = await DB.anlagen.hole(query.anlage);
    if (!anlage) throw new Error('Anlage nicht gefunden');
    p = neuesProtokoll(anlage, {
      techniker: await DB.einstellung('techniker', ''),
      unterschriftFelder: await DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD),
    });
    await DB.protokolle.speichere(p);
    navigiere(`/protokoll/${p.id}`, { ersetzen: true });
    return;
  }

  p = await DB.protokolle.hole(params.id);
  if (!p) throw new Error('Protokoll nicht gefunden');
  p.unterschriften ??= { techniker: null, kunde: null, kunde_name: '' };
  p.unterschriften.zeigeTechniker ??= true;
  p.unterschriften.zeigeKunde ??= true;
  p.maengel ??= [];
  if (!gesperrt()) {
    const anlage = await DB.anlagen.hole(p.anlageId);
    if (anlage) planAktualisieren(p, anlage);
  }

  kopf();
  zeichne();
  binde();

  const tastatur = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); jetztSpeichern(); }
  };
  document.addEventListener('keydown', tastatur);
  const sichtbar = () => { if (document.visibilityState === 'hidden') jetztSpeichern(); };
  document.addEventListener('visibilitychange', sichtbar);
  return () => {
    document.removeEventListener('keydown', tastatur);
    document.removeEventListener('visibilitychange', sichtbar);
  };
}

export const ungespeichert = () => ausstehend;

export async function verlassen() {
  await jetztSpeichern();
  return true;
}
