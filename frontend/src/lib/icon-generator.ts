/**
 * Icon generator — runs once at app startup to create PNG icons from the SVG source.
 * This is needed so PWABuilder can fetch real PNG files from the manifest.
 * Generated files are placed at /icon/icon-192.png etc via a service worker cache trick.
 *
 * In production, the PNG icons already exist in public/icon/ folder.
 * This script is only a fallback utility — not imported in main app.
 */

const SVG_URL = '/icon/icon.svg';

async function svgToPngBlob(size: number, maskable: boolean): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }

      if (maskable) {
        // Maskable: fill background color and scale down to 80% for safe zone
        ctx.fillStyle = '#0d0400';
        ctx.fillRect(0, 0, size, size);
        const padding = size * 0.1;
        ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);
      } else {
        ctx.drawImage(img, 0, 0, size, size);
      }

      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = SVG_URL;
  });
}

export async function generatePngIcons() {
  const tasks = [
    { size: 192, maskable: false, name: 'icon-192.png' },
    { size: 512, maskable: false, name: 'icon-512.png' },
    { size: 192, maskable: true,  name: 'icon-maskable-192.png' },
    { size: 512, maskable: true,  name: 'icon-maskable-512.png' },
  ];

  for (const task of tasks) {
    const blob = await svgToPngBlob(task.size, task.maskable);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = task.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
