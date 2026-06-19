import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();

async function generateIcons() {
  const iconDir = path.join(root, 'public', 'icons');
  fs.mkdirSync(iconDir, { recursive: true });

  const svg = fs.readFileSync(path.join(root, 'public', 'printflowpro-mark.svg'));
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  await Promise.all(
    sizes.map((size) =>
      sharp(svg)
        .resize(size, size)
        .png()
        .toFile(path.join(iconDir, `icon-${size}x${size}.png`))
    )
  );
}

async function generateScreenshots() {
  const screenshotDir = path.join(root, 'public', 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const makeScreenshot = (width, height, fileName) => {
    const headerHeight = Math.round(height * 0.18);
    const firstCardY = Math.round(height * 0.24);
    const secondCardY = Math.round(height * 0.48);
    const rows = Array.from({ length: 5 })
      .map((_, index) => (
        `<rect x="56" y="${Math.round(height * 0.52) + index * 44}" width="${width - 112}" height="18" rx="9"/>`
      ))
      .join('');

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#F7F9FC"/>
        <rect width="${width}" height="${headerHeight}" fill="#1D35C9"/>
        <rect x="32" y="32" width="72" height="72" rx="18" fill="#5B3DF4"/>
        <path d="M68 48 L88 58 L68 68 L48 58 Z" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/>
        <path d="M88 76 L68 86 L48 76" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="124" y="72" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#fff">PrintFlowPRO</text>
        <text x="124" y="104" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#DCE6FF">Gestao completa para graficas</text>
        <rect x="32" y="${firstCardY}" width="${width - 64}" height="${Math.round(height * 0.18)}" rx="18" fill="#FFFFFF" stroke="#D7E0EF"/>
        <rect x="56" y="${firstCardY + 28}" width="${Math.round((width - 112) * 0.42)}" height="18" rx="9" fill="#1D35C9" opacity="0.16"/>
        <rect x="56" y="${firstCardY + 62}" width="${Math.round((width - 112) * 0.72)}" height="14" rx="7" fill="#64748B" opacity="0.22"/>
        <rect x="32" y="${secondCardY}" width="${width - 64}" height="${Math.round(height * 0.38)}" rx="18" fill="#FFFFFF" stroke="#D7E0EF"/>
        <g fill="#E8EEF8">${rows}</g>
        <rect x="56" y="${Math.round(height * 0.52)}" width="110" height="18" rx="9" fill="#1D35C9" opacity="0.2"/>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toFile(path.join(screenshotDir, fileName));
  };

  await Promise.all([
    makeScreenshot(540, 720, 'app-home-540x720.png'),
    makeScreenshot(1280, 720, 'app-home-1280x720.png')
  ]);
}

await generateIcons();
await generateScreenshots();

console.log('PWA assets generated.');
