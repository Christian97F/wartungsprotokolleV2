import { DB } from '../core/db.js';
import { esc, jetztIso, setzePfad, holePfad, debounce, formatZeit, formatDatum, erzeugeId, istLeer } from '../core/util.js';
import { icon } from '../core/icons.js';
import { toast, bestaetigen, menue, dialog } from '../core/ui.js';
import { setzeKopf, setzeKopfStatus } from '../core/shell.js';
import { navigiere } from '../core/router.js';
import {
  neuesProtokoll, planAktualisieren, auswertung, ergebnisVorschlag, anlagenTitel, ERGEBNISSE, UNTERSCHRIFT_STANDARD, unterschriftFelder,
} from '../core/model.js';
import { modul } from '../sektionen/registry.js';
import { zahlAusText, segment, eingabe, checkbox, fotoLeiste } from '../sektionen/helfer.js';
import { bildVerkleinern } from '../core/bild.js';
import { exportProtokolle } from '../io/austausch.js';
import { unterschriftFeld } from './unterschrift.js';
import { berichtHtml } from '../io/bericht.js';

let p = null;
let usStandard = UNTERSCHRIFT_STANDARD;
let el = null;
let speichertGleich = null;
let ausstehend = false;
let vorher = null;   // letztes abgeschlossenes Protokoll derselben Anlage
let firma = {};

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
  const vorMaengel = vorherigeMaengel();
  return `
    <header class="sek-kopf"><span class="sek-nr">${nr(p.plan.length + 1)}</span><h2>Mängel</h2>
      <span class="sek-stand">${a.maengel.length ? `<span class="zaehler zaehler-fehler">${a.maengel.length}</span>` : ''}</span></header>
    ${vorMaengel.length ? `<div class="vm-box">
      <div class="vm-kopf"><span>${icon('warnung')}Offene Mängel der Wartung vom ${formatDatum(vorher.datum)}</span>
        ${vorMaengel.length > 1 ? '<button type="button" class="link" data-vm="alle">Alle übernehmen</button>' : ''}</div>
      ${vorMaengel.map((m, i) => `<div class="vm-zeile"><span>${esc(m.uebernahmeText)}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-vm="${i}">${icon('plus')}Übernehmen</button></div>`).join('')}
    </div>` : ''}
    ${abgeleitet.length ? `<div class="mg-liste">${abgeleitet.map(m => `
      <div class="mg-zeile">
        <div class="mg-text"><span class="tag tag-fehler">Prüfpunkt</span> ${esc(m.text)}
          ${m.notiz ? `<div class="mg-notiz">${esc(m.notiz)}</div>` : ''}</div>
        <label class="check"><input type="checkbox" data-w="${esc(m.pfad)}" data-wt="bool" data-mg ${m.behoben ? 'checked' : ''}><span>behoben</span></label>
        ${m.fotoPfad ? fotoLeiste(m.fotoPfad, m.fotos) : ''}
      </div>`).join('')}</div>` : ''}
    <div class="mg-liste">${p.maengel.map((m, i) => `
      <div class="mg-zeile mg-manuell">
        <div class="mg-text">${eingabe(`maengel.${i}.text`, m.text, { typ: 'text', platzhalter: 'Mangel beschreiben …' })}</div>
        ${segment(`maengel.${i}.prio`, m.prio, [['niedrig', 'niedrig'], ['mittel', 'mittel'], ['hoch', 'hoch']], 'segment-prio')}
        <label class="check"><input type="checkbox" data-w="maengel.${i}.behoben" data-wt="bool" data-mg ${m.behoben ? 'checked' : ''}><span>behoben</span></label>
        <button type="button" class="btn-icon gefahr" data-m-aktion="loeschen" data-i="${i}" title="Entfernen">${icon('loeschen')}</button>
        ${fotoLeiste(`maengel.${i}.fotos`, m.fotos)}
      </div>`).join('')}</div>
    ${!a.maengel.length ? '<p class="hinweis">Keine Mängel. Prüfpunkte mit „Mangel“ erscheinen hier automatisch.</p>' : ''}
    <button type="button" class="btn btn-ghost" data-m-aktion="neu">${icon('plus')}Weiteren Mangel erfassen</button>`;
}

function abschlussHtml() {
  const u = p.unterschriften;
  const zeige = unterschriftFelder(p, usStandard);
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
          ${checkbox('unterschriften.zeigeTechniker', zeige.techniker, 'Techniker')}
          ${checkbox('unterschriften.zeigeKunde', zeige.kunde, 'Kunde / Betreiber')}
        </div>
      </div>
      <div class="unterschriften">
        <div class="feld" data-us="zeigeTechniker" ${zeige.techniker ? '' : 'hidden'}><span class="feld-label">Unterschrift Techniker</span><div id="us-techniker"></div></div>
        <div class="feld" data-us="zeigeKunde" ${zeige.kunde ? '' : 'hidden'}><span class="feld-label">Unterschrift Kunde</span><div id="us-kunde"></div>
          <input class="inp" type="text" data-w="unterschriften.kunde_name" data-wt="text" value="${esc(u.kunde_name)}" placeholder="Name in Druckbuchstaben"></div>
      </div>
    </section>`;
}

// ── Vorwerte der letzten Wartung ─────────────────────────────

const STATUS_TEXT = { ok: 'i.O.', mangel: 'Mangel', ng: 'n.g.' };

function vorwerteAn() {
  try { return localStorage.getItem('vorwerte') !== 'aus'; } catch { return true; }
}

function letztesProtokoll(liste) {
  return liste
    .filter(x => x.id !== p.id && x.status === 'abgeschlossen' && (x.datum || '') <= (p.datum || ''))
    .sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.abgeschlossen_am || '').localeCompare(a.abgeschlossen_am || ''))[0] || null;
}

// Hängt an jedes Eingabefeld / jede Bewertung den Wert der letzten Wartung (gleicher Pfad)
function vorwerteEinfuegen(root) {
  root.querySelectorAll('.vorwert').forEach(x => x.remove());
  if (!vorher) return;
  root.querySelectorAll('[data-w^="werte."]:not([type="checkbox"]):not([data-w$=".notiz"])').forEach(inp => {
    const pfad = inp.dataset.w;
    let wert = holePfad(vorher, pfad);
    let label = 'zuletzt';
    // Beim Zählerstand „vorher“ ist der Stand nach der letzten Wartung der Vergleichswert
    if (pfad.endsWith('.vor')) {
      const nach = holePfad(vorher, pfad.replace(/\.vor$/, '.nach'));
      if (!istLeer(nach)) { wert = nach; label = 'zuletzt nach Wartung'; }
    }
    if (istLeer(wert) || typeof wert === 'object') return;
    const einheit = inp.closest('.mit-einheit')?.querySelector('.einheit')?.textContent || '';
    const text = typeof wert === 'number' ? `${String(wert).replace('.', ',')}${einheit ? ` ${einheit}` : ''}` : String(wert);
    (inp.closest('.mit-einheit') || inp).insertAdjacentHTML('afterend', `<span class="vorwert">${esc(label)}: ${esc(text)}</span>`);
  });
  root.querySelectorAll('.segment').forEach(seg => {
    const pfad = seg.querySelector('[data-w-set^="werte."]')?.dataset.wSet;
    const wert = pfad && holePfad(vorher, pfad);
    if (!wert || typeof wert === 'object') return;
    let text = STATUS_TEXT[wert] || wert;
    const notiz = wert === 'mangel' && holePfad(vorher, pfad.replace(/\.s$/, '.notiz'));
    if (notiz) text += ` – ${notiz}`;
    seg.insertAdjacentHTML('afterend', `<span class="vorwert ${wert === 'mangel' ? 'vorwert-mangel' : ''}">zuletzt: ${esc(text)}</span>`);
  });
}

function vorherigeMaengel() {
  if (!vorher) return [];
  const vorhanden = new Set(p.maengel.map(m => m.text));
  return auswertung(vorher).maengel
    .filter(m => !m.behoben)
    .map(m => ({ ...m, uebernahmeText: m.notiz ? `${m.text} – ${m.notiz}` : m.text }))
    .filter(m => !vorhanden.has(m.uebernahmeText));
}

function letztenBerichtZeigen() {
  dialog({
    titel: `Letzte Wartung · ${formatDatum(vorher.datum)}`,
    breit: true,
    inhalt: `<div class="papier-rahmen vorschau-dlg">${berichtHtml(vorher, firma, usStandard)}</div>`,
    onOpen: (dlg) => {
      const r = dlg.querySelector('.papier-rahmen');
      r.style.setProperty('--zoom', Math.min(1, r.clientWidth / 794).toFixed(3));
    },
  });
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
    ${vorher ? `<div class="vorwerte-leiste">
      <label class="check"><input type="checkbox" id="vorwerte-an" ${vorwerteAn() ? 'checked' : ''}><span>Vorwerte vom ${formatDatum(vorher.datum)}</span></label>
      <button type="button" class="link" id="letzter-bericht">${icon('auge')}Letzter Bericht</button>
    </div>` : ''}
    <nav class="prot-sprung">${eintraege.map(([id, t]) =>
      `<a href="#s-${esc(id)}" data-sprung="${esc(id)}"><span class="sprung-punkt" data-punkt="${esc(id)}"></span>${esc(t)}</a>`).join('')}
    </nav>`;
}

function zeichne() {
  el.innerHTML = `
    <div class="prot ${vorwerteAn() ? 'mit-vorwerten' : ''}">
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
  el.querySelector('#letzter-bericht')?.addEventListener('click', letztenBerichtZeigen);
  el.querySelector('#vorwerte-an')?.addEventListener('change', e => {
    try { localStorage.setItem('vorwerte', e.target.checked ? 'an' : 'aus'); } catch { /* privat */ }
    el.querySelector('.prot').classList.toggle('mit-vorwerten', e.target.checked);
  });
  vorwerteEinfuegen(el);
  aktualisiereFortschritt();
}

function sektionNeuZeichnen(sekId) {
  const i = p.plan.findIndex(s => s.id === sekId);
  const alt = el.querySelector(`[data-sek="${CSS.escape(sekId)}"]`);
  const tmp = document.createElement('div');
  tmp.innerHTML = sektionHtml(p.plan[i], i);
  const neu = tmp.firstElementChild;
  vorwerteEinfuegen(neu);
  alt.replaceWith(neu);
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
  // ── Fotos ──
  const fotosGeaendert = (pfad) => {
    geaendert();
    const sekId = pfad.match(/^werte\.([^.]+)\./)?.[1];
    if (sekId) sektionNeuZeichnen(sekId);
    maengelNeuZeichnen();
  };
  el.addEventListener('change', async e => {
    const inp = e.target.closest('[data-foto-neu]');
    if (!inp || gesperrt() || !inp.files.length) return;
    const pfad = inp.dataset.fotoNeu;
    const dateien = [...inp.files];
    inp.value = '';
    try {
      const neu = await Promise.all(dateien.map(d => bildVerkleinern(d)));
      const liste = holePfad(p, pfad) || [];
      setzePfad(p, pfad, [...liste, ...neu]);
      fotosGeaendert(pfad);
    } catch (err) {
      toast(`Foto konnte nicht gelesen werden: ${err.message}`, 'error');
    }
  });
  el.addEventListener('click', async e => {
    const zeigen = e.target.closest('[data-foto-zeigen]');
    if (zeigen) {
      dialog({ titel: 'Foto', breit: true, inhalt: `<img class="foto-gross" src="${zeigen.src}" alt="">` });
      return;
    }
    const weg = e.target.closest('[data-foto-weg]');
    if (!weg || gesperrt()) return;
    if (!await bestaetigen('Foto entfernen?', { ja: 'Entfernen' })) return;
    holePfad(p, weg.dataset.fotoWeg).splice(Number(weg.dataset.i), 1);
    fotosGeaendert(weg.dataset.fotoWeg);
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

    const vm = e.target.closest('[data-vm]');
    if (vm) {
      const liste = vorherigeMaengel();
      const auswahl = vm.dataset.vm === 'alle' ? liste : [liste[Number(vm.dataset.vm)]];
      for (const m of auswahl) {
        p.maengel.push({ id: erzeugeId('m'), text: m.uebernahmeText, prio: m.prio || 'mittel', behoben: false, fotos: m.fotos ? [...m.fotos] : [] });
      }
      maengelNeuZeichnen();
      geaendert();
      toast(auswahl.length === 1 ? 'Mangel übernommen' : `${auswahl.length} Mängel übernommen`, 'success');
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
  import('./erinnerung.js').then(m => m.backupErinnerung());
}

async function entsperren() {
  const u = p.unterschriften || {};
  const unterschrieben = !!(u.techniker || u.kunde);
  const text = unterschrieben
    ? 'Das Protokoll wird wieder zum Entwurf und kann bearbeitet werden.\n\n'
      + 'Die vorhandenen Unterschriften werden dabei entfernt, da sie sich auf den bisherigen Stand beziehen. '
      + 'Nach der Bearbeitung muss erneut unterschrieben werden.'
    : 'Das Protokoll wird wieder zum Entwurf und kann bearbeitet werden.';
  if (!await bestaetigen(text, {
    titel: 'Protokoll bearbeiten',
    ja: unterschrieben ? 'Unterschriften entfernen & bearbeiten' : 'Bearbeiten',
    art: unterschrieben ? 'danger' : 'primary',
  })) return;
  p.status = 'entwurf';
  delete p.abgeschlossen_am;
  // Unterschriften gelten nur für den unterschriebenen Stand
  u.techniker = null;
  u.kunde = null;
  p.unterschriften = u;
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
        ...(vorher ? [{ label: `Letzte Wartung ansehen (${formatDatum(vorher.datum)})`, icon: 'auge', aktion: letztenBerichtZeigen }] : []),
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
    });
    await DB.protokolle.speichere(p);
    navigiere(`/protokoll/${p.id}`, { ersetzen: true });
    return;
  }

  p = await DB.protokolle.hole(params.id);
  if (!p) throw new Error('Protokoll nicht gefunden');
  p.unterschriften ??= { techniker: null, kunde: null, kunde_name: '' };
  usStandard = await DB.einstellung('unterschriftFelder', UNTERSCHRIFT_STANDARD);
  p.maengel ??= [];
  if (!gesperrt()) {
    const anlage = await DB.anlagen.hole(p.anlageId);
    if (anlage) planAktualisieren(p, anlage);
  }
  vorher = letztesProtokoll(await DB.protokolle.vonAnlage(p.anlageId));
  firma = await DB.einstellung('firma', {});

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
