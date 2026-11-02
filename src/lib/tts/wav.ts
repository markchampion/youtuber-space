// Minimal 16-bit mono PCM WAV helpers. Keeping audio as raw PCM means
// sample counts are exact, which is what makes voice/image sync drift-free.

export const WAV_HEADER_BYTES = 44;

export function wavHeader(dataBytes: number, sampleRate: number, channels = 1, bits = 16): Buffer {
  const h = Buffer.alloc(WAV_HEADER_BYTES);
  const blockAlign = (channels * bits) / 8;
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
}

export function wavPcm(wav: Buffer): Buffer {
  return wav.subarray(WAV_HEADER_BYTES);
}

/** Concatenate PCM chunks with `pauseMs` of silence between them. */
export function stitchPcm(chunks: Buffer[], sampleRate: number, pauseMs: number): Buffer {
  const silence = Buffer.alloc(Math.round((pauseMs / 1000) * sampleRate) * 2);
  const parts: Buffer[] = [];
  chunks.forEach((c, i) => {
    parts.push(c);
    if (i < chunks.length - 1) parts.push(silence);
  });
  return Buffer.concat(parts);
}

/** Placeholder audio for DRY_RUN: a soft tone per sentence, silence between. */
export function fakeSpeech(sentenceDurations: number[], sampleRate: number): Buffer {
  const parts: Buffer[] = [];
  for (const d of sentenceDurations) {
    const n = Math.round(d * sampleRate);
    const b = Buffer.alloc(n * 2);
    const toneN = Math.round(n * 0.85);
    for (let i = 0; i < toneN; i++) {
      const env = Math.min(1, i / 400, (toneN - i) / 400);
      b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 2500 * env), i * 2);
    }
    parts.push(b);
  }
  return Buffer.concat(parts);
}
