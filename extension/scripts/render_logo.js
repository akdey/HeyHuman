const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const svgPath = path.join(rootDir, 'media', 'logo.svg');
const logoPngPath = path.join(rootDir, 'media', 'logo.png');
const iconPngPath = path.join(rootDir, 'media', 'icon.png');

console.log('Rendering SVG logo into PNGs...');
try {
  const tmpOut = '/tmp';
  execSync(`qlmanage -t -s 512 -o ${tmpOut} "${svgPath}"`, { stdio: 'pipe' });
  const renderedTmp = path.join(tmpOut, 'logo.svg.png');
  if (fs.existsSync(renderedTmp)) {
    fs.copyFileSync(renderedTmp, logoPngPath);
    fs.copyFileSync(renderedTmp, iconPngPath);
    console.log(`Successfully generated:\n- ${logoPngPath}\n- ${iconPngPath}`);
  } else {
    console.warn('qlmanage output not found at', renderedTmp);
  }
} catch (err) {
  console.error('Error rendering logo:', err.message);
}

