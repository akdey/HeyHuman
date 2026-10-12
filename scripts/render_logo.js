const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc ^ byte) & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  const crc = crc32(chunk.slice(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, getPixel) {
  // RGBA 8-bit
  const rawBytesPerLine = 1 + width * 4;
  const rawData = Buffer.alloc(height * rawBytesPerLine);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rawBytesPerLine;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// 256x256 rendering
const WIDTH = 256;
const HEIGHT = 256;

const pngBuf = createPng(WIDTH, HEIGHT, (x, y) => {
  // Normalize coords
  const nx = x / WIDTH;
  const ny = y / HEIGHT;

  // 1. Squircle background check (radius 48 from corners)
  const pad = 8;
  const r = 50;
  const inLeft = x < pad + r;
  const inRight = x > (WIDTH - pad - r);
  const inTop = y < pad + r;
  const inBottom = y > (HEIGHT - pad - r);

  let outside = x < pad || x > WIDTH - pad || y < pad || y > HEIGHT - pad;
  if (inLeft && inTop) {
    const dx = x - (pad + r);
    const dy = y - (pad + r);
    if (dx * dx + dy * dy > r * r) outside = true;
  } else if (inRight && inTop) {
    const dx = x - (WIDTH - pad - r);
    const dy = y - (pad + r);
    if (dx * dx + dy * dy > r * r) outside = true;
  } else if (inLeft && inBottom) {
    const dx = x - (pad + r);
    const dy = y - (HEIGHT - pad - r);
    if (dx * dx + dy * dy > r * r) outside = true;
  } else if (inRight && inBottom) {
    const dx = x - (WIDTH - pad - r);
    const dy = y - (HEIGHT - pad - r);
    if (dx * dx + dy * dy > r * r) outside = true;
  }

  if (outside) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  // Base background: Deep sleek navy / slate gradient (#0B0F19 to #1E293B)
  let bgR = Math.floor(11 + ny * 19);
  let bgG = Math.floor(15 + ny * 26);
  let bgB = Math.floor(25 + ny * 34);

  // Siren Light Glow: Center (128, 52)
  const sDist = Math.hypot(x - 128, y - 52);
  if (sDist < 60) {
    const glow = (1 - sDist / 60) * 0.7;
    bgR = Math.min(255, Math.floor(bgR + 255 * glow));
    bgG = Math.min(255, Math.floor(bgG + 60 * glow));
    bgB = Math.min(255, Math.floor(bgB + 60 * glow));
  }

  // Siren Dome Bulb: (115..141, 40..62)
  if (x >= 114 && x <= 142 && y >= 40 && y <= 64) {
    const domeDist = Math.hypot(x - 128, y - 62);
    if (domeDist <= 15) {
      // Emergency Red Siren Bulb
      return [255, 59, 48, 255];
    }
  }

  // Siren Sound Waves left/right
  if ((x >= 80 && x <= 95 && Math.abs(y - 52) < 20) || (x >= 161 && x <= 176 && Math.abs(y - 52) < 20)) {
    const leftArc = Math.abs(Math.hypot(x - 128, y - 52) - 40);
    if (leftArc < 3.5) {
      return [255, 69, 58, 255]; // Red wave
    }
    const outerArc = Math.abs(Math.hypot(x - 128, y - 52) - 52);
    if (outerArc < 3.0) {
      return [255, 159, 10, 255]; // Orange wave
    }
  }

  // Siren Base Mount: (112..144, 62..70)
  if (x >= 112 && x <= 144 && y >= 62 && y <= 72) {
    return [71, 85, 105, 255];
  }

  // Stem line to head: x around 128, y 72..84
  if (Math.abs(x - 128) <= 3 && y >= 72 && y <= 86) {
    return [100, 116, 139, 255];
  }

  // Robot Ears: left (48..58, 124..152), right (198..208, 124..152)
  if ((x >= 48 && x <= 58 && y >= 124 && y <= 152) || (x >= 198 && x <= 208 && y >= 124 && y <= 152)) {
    return [56, 189, 248, 255]; // Cyan ear
  }

  // Robot Head: (58..198, 86..202), rounded corners r=22
  const headX1 = 58, headX2 = 198, headY1 = 86, headY2 = 202;
  const inHead = x >= headX1 && x <= headX2 && y >= headY1 && y <= headY2;

  if (inHead) {
    // Check head border (4px border: #38BDF8)
    const isBorder = (x - headX1 < 5 || headX2 - x < 5 || y - headY1 < 5 || headY2 - y < 5);
    if (isBorder) {
      return [56, 189, 248, 255]; // Neon cyan head stroke
    }

    // Visor Area: (74..182, 104..166), r=12
    const inVisor = x >= 74 && x <= 182 && y >= 104 && y <= 166;
    if (inVisor) {
      const isVisorBorder = (x - 74 < 3 || 182 - x < 3 || y - 104 < 3 || 166 - y < 3);
      if (isVisorBorder) {
        return [2, 132, 199, 255]; // Visor outline
      }

      // Inside Visor: Sarcastic LED Eyes
      // Left eye: x in (90..116), y in (128..135)
      // Right eye: x in (140..166), y in (128..135)
      const isLeftEye = (x >= 90 && x <= 116 && y >= 129 && y <= 134);
      const isRightEye = (x >= 140 && x <= 166 && y >= 129 && y <= 134);

      // Sarcastic eyelids / glare (slanted eyebrow above eye):
      const isLeftBrow = (x >= 88 && x <= 118 && Math.abs(y - (124 + (x - 90) * 0.15)) < 2);
      const isRightBrow = (x >= 138 && x <= 168 && Math.abs(y - (128 - (x - 140) * 0.15)) < 2);

      if (isLeftEye || isRightEye) {
        return [56, 189, 248, 255]; // Bright cyan LED eye slit
      }
      if (isLeftBrow || isRightBrow) {
        return [15, 23, 42, 255]; // Eyelid slant
      }

      // Impatient straight mouth: x in (114..142), y in (152..154)
      if (x >= 114 && x <= 142 && y >= 152 && y <= 154) {
        return [56, 189, 248, 255];
      }

      // Visor screen background: dark void (#020617)
      return [2, 6, 23, 255];
    }

    // Head interior background: slate (#1E293B)
    return [30, 41, 59, 255];
  }

  // Interactive Bottom Button Badge: [ ALLOW? ] (x: 82..174, y: 212..232)
  if (x >= 82 && x <= 174 && y >= 212 && y <= 232) {
    const isBtnBorder = (x - 82 < 2 || 174 - x < 2 || y - 212 < 2 || 232 - y < 2);
    if (isBtnBorder) {
      return [239, 68, 68, 255]; // Red alert button border
    }
    // Blinking red beacon dot inside button: (92, 222)
    if (Math.hypot(x - 92, y - 222) < 3.5) {
      return [239, 68, 68, 255];
    }
    return [15, 23, 42, 255]; // Button background
  }

  // Sarcastic "HEY!" speech bubble badge in top-right: (164..224, 72..92)
  if (x >= 164 && x <= 224 && y >= 72 && y <= 92) {
    const isBubbleBorder = (x - 164 < 2 || 224 - x < 2 || y - 72 < 2 || 92 - y < 2);
    if (isBubbleBorder) {
      return [255, 255, 255, 255];
    }
    return [239, 68, 68, 255]; // Red bubble
  }

  return [bgR, bgG, bgB, 255];
});

const outPath = path.join(__dirname, '..', 'media', 'logo.png');
fs.writeFileSync(outPath, pngBuf);
console.log('Successfully generated media/logo.png (256x256)');
