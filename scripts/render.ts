// Renders the Remotion composition to MP4. Spawned by the app as a child
// process (keeps webpack/Chromium out of the Next.js server).
// Usage: tsx scripts/render.ts <props.json> <out.mp4> [compositionId]
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const [propsPath, outPath, compositionId = "DoodleVideo"] = process.argv.slice(2);
if (!propsPath || !outPath) {
  console.error("Usage: tsx scripts/render.ts <props.json> <out.mp4>");
  process.exit(1);
}

const report = (p: number, msg: string) => console.log(`PROGRESS ${p.toFixed(4)} ${msg}`);

async function main() {
  const inputProps = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  report(0.01, "Bundling composition");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts") });
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  report(0.05, "Rendering frames");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outPath,
    inputProps,
    onProgress: ({ progress, renderedFrames }) =>
      report(0.05 + progress * 0.95, `Rendered ${renderedFrames}/${composition.durationInFrames} frames`),
  });
  report(1, "Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
