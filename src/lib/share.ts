import type { Archetype } from '@shared/archetypes';

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5, the aspect that survives every feed crop.

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws `img` to fill the box, cropping the overflow like object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  ctx.drawImage(
    img,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Renders the shareable result card. Everything is drawn on canvas rather than
 * screenshotting the DOM, so the output is deterministic across browsers and
 * does not depend on the page's current scroll or layout.
 */
export async function renderResultCard(
  archetype: Archetype,
  sceneSrc: string,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Wait for the webfonts, otherwise the card renders in a fallback face.
  try {
    await document.fonts.ready;
  } catch {
    /* older browsers: fall through with system fonts */
  }

  const display = '"Instrument Serif", Georgia, serif';
  const sans = '"Inter", system-ui, sans-serif';
  const [r, g, b] = archetype.accent.split(' ').map(Number);
  const accent = `rgb(${r}, ${g}, ${b})`;

  ctx.fillStyle = '#06050a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // --- film still -------------------------------------------------------
  const imageHeight = 760;
  const scene = await loadImage(sceneSrc);
  if (scene) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, imageHeight);
    ctx.clip();
    drawCover(ctx, scene, 0, 0, WIDTH, imageHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = '#16121f';
    ctx.fillRect(0, 0, WIDTH, imageHeight);
  }

  const fade = ctx.createLinearGradient(0, imageHeight - 320, 0, imageHeight);
  fade.addColorStop(0, 'rgba(6,5,10,0)');
  fade.addColorStop(1, 'rgba(6,5,10,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, imageHeight - 320, WIDTH, 320);

  // --- header rule ------------------------------------------------------
  ctx.fillStyle = accent;
  ctx.fillRect(72, 72, 56, 3);
  ctx.font = `600 22px ${sans}`;
  ctx.fillStyle = 'rgba(243,237,228,0.9)';
  ctx.letterSpacing = '5px';
  ctx.fillText('K-DRAMA DREAMS', 72, 130);
  ctx.letterSpacing = '0px';

  // --- title ------------------------------------------------------------
  let y = imageHeight - 30;
  ctx.font = `400 26px ${sans}`;
  ctx.fillStyle = accent;
  ctx.letterSpacing = '4px';
  ctx.fillText('MY ROMANCE ARCHETYPE', 72, y);
  ctx.letterSpacing = '0px';

  y += 78;
  ctx.font = `400 82px ${display}`;
  ctx.fillStyle = '#f3ede4';
  for (const line of wrap(ctx, archetype.title, WIDTH - 144)) {
    ctx.fillText(line, 72, y);
    y += 88;
  }

  // --- hook -------------------------------------------------------------
  y += 14;
  ctx.font = `italic 400 40px ${display}`;
  ctx.fillStyle = 'rgba(197,188,179,0.95)';
  for (const line of wrap(ctx, archetype.hook, WIDTH - 144)) {
    ctx.fillText(line, 72, y);
    y += 50;
  }

  // --- trait + footer ---------------------------------------------------
  y += 34;
  ctx.strokeStyle = 'rgba(44,36,56,1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, y);
  ctx.lineTo(WIDTH - 72, y);
  ctx.stroke();

  y += 52;
  ctx.font = `600 24px ${sans}`;
  ctx.fillStyle = 'rgba(139,131,148,1)';
  ctx.letterSpacing = '3px';
  ctx.fillText('CORE TRAIT', 72, y);
  ctx.letterSpacing = '0px';

  y += 44;
  ctx.font = `400 34px ${sans}`;
  ctx.fillStyle = '#f3ede4';
  for (const line of wrap(ctx, archetype.trait, WIDTH - 144)) {
    ctx.fillText(line, 72, y);
    y += 44;
  }

  ctx.font = `400 24px ${sans}`;
  ctx.fillStyle = 'rgba(139,131,148,1)';
  ctx.fillText('Take the quiz — danielshorts.vercel.app', 72, HEIGHT - 64);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next frame so Safari has finished reading the object URL.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export interface ShareResult {
  method: 'share' | 'clipboard' | 'none';
}

export async function shareArchetype(
  archetype: Archetype,
  file?: Blob,
): Promise<ShareResult> {
  const url = window.location.origin;
  const text = `I got "${archetype.title}" — ${archetype.hook}\n\nFind your K-drama romance archetype:`;

  if (file && navigator.canShare) {
    const image = new File([file], 'my-archetype.png', { type: 'image/png' });
    if (navigator.canShare({ files: [image] })) {
      try {
        await navigator.share({ title: archetype.title, text, url, files: [image] });
        return { method: 'share' };
      } catch (error) {
        // AbortError means the user dismissed the sheet — not a failure worth
        // falling back from, but any other error should try the next method.
        if ((error as Error).name === 'AbortError') return { method: 'share' };
      }
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: archetype.title, text, url });
      return { method: 'share' };
    } catch (error) {
      if ((error as Error).name === 'AbortError') return { method: 'share' };
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return { method: 'clipboard' };
  } catch {
    return { method: 'none' };
  }
}
