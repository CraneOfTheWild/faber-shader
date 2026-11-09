/*
 * faber-worker.js - Web Worker wrapper around faber-core.js, so the page stays responsive.
 *
 *   const worker = new Worker('./engine/faber-worker.js', { type: 'module' });
 *   worker.onmessage = e => {
 *     if (e.data.type === 'progress') ...      // { phase, fraction, overall, painted }
 *     if (e.data.type === 'result')   ...      // { width, height, palette, strokes, seconds, image? }
 *     if (e.data.type === 'error')    ...      // { message }
 *   };
 *   const imageData = ctx.getImageData(0, 0, w, h);
 *   worker.postMessage({ imageData: { width: imageData.width, height: imageData.height, data: imageData.data },
 *                        options: { seed: 2 } }, [imageData.data.buffer]);     // buffer is transferred, not copied
 *
 * To abort a run, terminate() the worker and create a new one; the generator is synchronous.
 */
import { generateStrokes } from './faber-core.js';

self.onmessage = e => {
  const { imageData, options } = e.data || {};
  if (!imageData || !imageData.data) {
    self.postMessage({ type: 'error', message: 'postMessage({ imageData: { width, height, data }, options })' });
    return;
  }
  try {
    const data = imageData.data instanceof Uint8ClampedArray ? imageData.data : new Uint8ClampedArray(imageData.data.buffer || imageData.data);
    const result = generateStrokes({ width: imageData.width, height: imageData.height, data }, options || {},
      p => self.postMessage({ type: 'progress', ...p }));
    const transfer = result.image ? [result.image.buffer] : [];
    self.postMessage({ type: 'result', ...result }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
