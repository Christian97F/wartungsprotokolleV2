import { icon } from '../core/icons.js';

// Unterschriftenfeld (Canvas). onChange(dataUrl | null)
export function unterschriftFeld(container, wert, onChange, { gesperrt = () => false } = {}) {
  container.innerHTML = `
    <div class="us-feld">
      <canvas class="us-canvas"></canvas>
      <span class="us-linie"></span>
      <button type="button" class="btn-icon us-leeren" title="Unterschrift löschen">${icon('loeschen')}</button>
      <span class="us-platzhalter">Hier unterschreiben</span>
    </div>`;
  const feld = container.querySelector('.us-feld');
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  let zeichnet = false;
  let leer = !wert;
  feld.classList.toggle('us-leer', leer);

  const groesse = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1B2430';
    if (wert) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
      img.src = wert;
    }
  };
  requestAnimationFrame(groesse);

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
    if (leer) { leer = false; feld.classList.remove('us-leer'); }
  });
  const ende = () => {
    if (!zeichnet) return;
    zeichnet = false;
    wert = leer ? null : canvas.toDataURL('image/png');
    onChange(wert);
  };
  canvas.addEventListener('pointerup', ende);
  canvas.addEventListener('pointercancel', ende);

  container.querySelector('.us-leeren').addEventListener('click', () => {
    if (gesperrt()) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wert = null;
    leer = true;
    feld.classList.add('us-leer');
    onChange(null);
  });
}
