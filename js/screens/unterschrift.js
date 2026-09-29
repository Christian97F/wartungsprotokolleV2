import { icon } from '../core/icons.js';
import { dialog } from '../core/ui.js';

const STRICH = 2.2;

// Zeichenfläche auf einem Canvas. basisBreite: Breite, für die STRICH gilt (größere Flächen zeichnen dicker)
function zeichenflaeche(canvas, { wert, basisBreite, gesperrt = () => false, onStrich, onEnde }) {
  const ctx = canvas.getContext('2d');
  let zeichnet = false;

  const einrichten = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = STRICH * (basisBreite ? r.width / basisBreite : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1B2430';
    if (wert) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
      img.src = wert;
    }
  };
  // Größe erst bestimmen, wenn das Feld sichtbar ist (kann ausgeblendet starten)
  new ResizeObserver(einrichten).observe(canvas);

  const punkt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener('pointerdown', e => {
    if (gesperrt()) return;
    zeichnet = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...punkt(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!zeichnet) return;
    ctx.lineTo(...punkt(e));
    ctx.stroke();
    onStrich?.();
  });
  const ende = () => {
    if (!zeichnet) return;
    zeichnet = false;
    onEnde?.();
  };
  canvas.addEventListener('pointerup', ende);
  canvas.addEventListener('pointercancel', ende);

  return {
    leeren: () => ctx.clearRect(0, 0, canvas.width, canvas.height),
    setze: (neu) => { wert = neu; einrichten(); },
    bild: () => canvas.toDataURL('image/png'),
  };
}

const feldHtml = (gross = false) => `
  <div class="us-feld ${gross ? 'us-gross' : ''}">
    <canvas class="us-canvas"></canvas>
    <span class="us-linie"></span>
    <span class="us-platzhalter">Hier unterschreiben</span>
    <div class="us-knoepfe">
      ${gross ? '' : `<button type="button" class="btn-icon us-vergroessern" title="Vergrößern">${icon('vergroessern')}</button>`}
      <button type="button" class="btn-icon us-leeren" title="Unterschrift löschen">${icon('loeschen')}</button>
    </div>
  </div>`;

// Großes Feld im Dialog, gleiches Seitenverhältnis wie das kleine, damit die Unterschrift nicht verzerrt
async function grossUnterschreiben(wert, verhaeltnis, basisBreite) {
  let neu = wert;
  const r = await dialog({
    titel: 'Unterschrift',
    breit: true,
    inhalt: feldHtml(true),
    aktionen: [{ label: 'Abbrechen', wert: null }, { label: 'Übernehmen', wert: 'ok', art: 'primary', icon: 'check' }],
    onOpen: (dlg) => {
      const feld = dlg.querySelector('.us-feld');
      dlg.classList.add('dlg-unterschrift');
      feld.style.setProperty('--r', String(verhaeltnis));
      feld.classList.toggle('us-leer', !neu);
      const flaeche = zeichenflaeche(feld.querySelector('canvas'), {
        wert, basisBreite,
        onStrich: () => feld.classList.remove('us-leer'),
        onEnde: () => { neu = flaeche.bild(); },
      });
      dlg.querySelector('.us-leeren').addEventListener('click', () => {
        flaeche.leeren();
        neu = null;
        feld.classList.add('us-leer');
      });
    },
  });
  return r === 'ok' ? { wert: neu } : null;
}

/**
 * Unterschriftenfeld (Canvas) mit Vergrößern-Knopf. onChange(dataUrl | null).
 * Liefert { setze(dataUrl) } zum Einsetzen einer gespeicherten Unterschrift.
 */
export function unterschriftFeld(container, wert, onChange, { gesperrt = () => false } = {}) {
  container.innerHTML = feldHtml();
  const feld = container.querySelector('.us-feld');
  const canvas = container.querySelector('canvas');
  let leer = !wert;
  feld.classList.toggle('us-leer', leer);

  const setze = (neu) => {
    wert = neu;
    leer = !neu;
    feld.classList.toggle('us-leer', leer);
    if (neu) flaeche.setze(neu); else flaeche.leeren();
    onChange(neu);
  };

  const flaeche = zeichenflaeche(canvas, {
    wert, gesperrt,
    onStrich: () => { if (leer) { leer = false; feld.classList.remove('us-leer'); } },
    onEnde: () => {
      wert = leer ? null : flaeche.bild();
      onChange(wert);
    },
  });

  container.querySelector('.us-leeren').addEventListener('click', () => {
    if (!gesperrt()) setze(null);
  });
  container.querySelector('.us-vergroessern').addEventListener('click', async () => {
    if (gesperrt()) return;
    const r = canvas.getBoundingClientRect();
    const ergebnis = await grossUnterschreiben(wert, r.width / r.height, r.width);
    if (ergebnis) setze(ergebnis.wert);
  });

  return { setze, wert: () => wert };
}
