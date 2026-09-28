// Bilder verkleinern. Läuft über ein <img>-Element statt createImageBitmap,
// weil Safari (iOS) dort Blob-Dateien bzw. Optionen nicht zuverlässig unterstützt.
// Die EXIF-Drehung von Handyfotos wendet der Browser beim Zeichnen selbst an.
function ladeBild(datei) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`„${datei.name}“ ist kein lesbares Bild`)); };
    img.src = url;
  });
}

/** Lange Kante max. `max` px; JPEG (Fotos) oder PNG (Logo mit Transparenz). */
export async function bildVerkleinern(datei, { max = 1280, qualitaet = 0.7, format = 'image/jpeg' } = {}) {
  const img = await ladeBild(datei);
  const faktor = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * faktor));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * faktor));
  const ctx = canvas.getContext('2d');
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(format, qualitaet);
}
