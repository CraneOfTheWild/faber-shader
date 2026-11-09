# faber engine: the marker-painting algorithm in the browser

A dependency-free JavaScript port of `faber_shader.py` v1.8. A visitor's photo is turned into a
list of marker strokes entirely in the browser: nothing is uploaded, and the result has exactly the
shape of the Python `.strokes.json`, so the existing canvas viewer (`index.html`)
draws it as is.

Files:

| file | what |
| --- | --- |
| `faber-core.js` | ES module. `generateStrokes(imageData, options, onProgress)`; the palette is embedded. |
| `faber-worker.js` | Web Worker wrapper so the page stays responsive while it runs (10-30 s). |

## Use from a page

```html
<input type="file" id="photo" accept="image/*">
<script type="module">
const worker = new Worker('./engine/faber-worker.js', { type: 'module' });
worker.onmessage = e => {
  const m = e.data;
  if (m.type === 'progress') console.log(m.phase, Math.round(m.overall * 100) + '%');   // phase, fraction, overall
  else if (m.type === 'result') showStrokes(m);        // { width, height, palette, strokes, seconds }
  else if (m.type === 'error') alert(m.message);
};
document.getElementById('photo').onchange = async ev => {
  const bmp = await createImageBitmap(ev.target.files[0]);
  // decode to RGBA; downscaling here is optional, generateStrokes downscales to max_size itself
  const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  worker.postMessage({ imageData: { width: img.width, height: img.height, data: img.data }, options: { seed: 1 } },
                     [img.data.buffer]);                // the pixel buffer is transferred, not copied
};
</script>
```

Without a worker (blocks the page for the duration):

```js
import { generateStrokes } from './engine/faber-core.js';
const result = generateStrokes(imageData, { seed: 3 }, p => console.log(p.phase, p.overall));
```

`result` is `{ width, height, palette, strokes, regions }` (plus `seconds`, and `image` when asked for):

- `width`, `height`: the size the strokes are in (the photo downscaled to `max_size`).
- `palette`: `{ paper: '#f5f2ea', pens: { c01r01: '#b3a4a3', ... } }`, the same shape as the
  `PALETTE` constant that the build script of the source project bakes into the viewer, so a page can draw the result
  with no palette file. (The Python JSON has a file path here instead.)
- `strokes`: one object per stroke, in drawing order (contours first, then levels 0..3):
  `x0, y0, x1, y1, width, pen (name), opacity, level (-1 = contour), tilt (degrees), bow, amp,
  waves [[phase, freq, weight] x3], hook, hook_end, hook_len`, rounded like the Python output.
- `regions`: outlines of the areas the strokes follow, as flat arrays `[x0, y0, x1, y1, ...]` in the same
  pixel coordinates as the strokes (rounded to 0.1 px): every 8-connected piece of an area traced like a contour and
  simplified with Douglas-Peucker (eps 0.7 px), runs along the image border left out. A shared edge appears once per
  side. The viewer draws them as a pencil underdrawing; they use no random numbers, so the strokes are unchanged.
- `image` (only with `return_image: true`): `Uint8ClampedArray` RGBA of the simulated painting
  (paper texture times ink), the equivalent of the Python PNG. 

To cancel a run, `worker.terminate()` and make a new worker; the generator itself is synchronous.

## Options

All Python CLI flags, under their argparse names (`--paper-show` is `paper_show`), with the same
defaults; see `DEFAULTS` in `faber-core.js` and the parameter table in the project README.
The ones a page is likely to expose:

| option | default | effect |
| --- | --- | --- |
| `max_size` | 1200 | long side of the working image; the main speed knob (runtime scales with pixels) |
| `seed` | 1 | different random strokes, same everything else |
| `size_ref` | `'long'` | which side the sizes are a fraction of: `'long'`, `'width'`, `'height'` |
| `widths`, `opacities`, `thresholds` | as Python | per level; a CSV string or an array of numbers |
| `paper_show` | 0.3 | share of each area meant to stay paper |
| `stroke_share` | 1.0 | share of candidate seeds tried per level (sparser, faster) |
| `grid` | 1.0 | seed spacing in stroke widths (larger = faster, sparser) |
| `contours` | true | contour lines around big areas (`contour_pen: 'block' | 'dark'`) |
| `directions` | `'auto'` | `'h'` / `'v'` force one direction |
| `hook_chance` | 0 | fraction of strokes with a hook at one end |

JS-only options: `palette` (an object in either the viewer shape or the `palette.json` shape;
default is the embedded 100-pen set), `return_image` (also render the painting), `log` (a
function that receives the per-level summary lines the Python prints).

Progress callback / worker messages: `{ phase, fraction, overall, painted? }` with phases
`flatten`, `segment`, `contours`, `level 0`..`level 3`, `done`. `overall` is a 0..1 estimate
weighted by the typical cost of each phase.

## Performance

A 1024 x 681 photo (no downscale), Node 22 on a laptop: about 10 s for 30 000 strokes
(flatten 3 s, segmentation 1.5 s, contours and direction field 2 s, the four levels 4.5 s).
A 1920 x 1229 photo, downscaled to 1200 x 768, took 13.5 s for 49 000 strokes. Browsers run the
same code at about the same speed (same V8/SpiderMonkey JIT); a 400 px `max_size` finishes in 3 s. Memory: a handful of Float32 planes of the working
image (about 20 bytes per pixel), nothing is kept between runs.

## How faithful is it

Compared with the Python original on a test photo (same defaults): 30 225 strokes vs 30 803 (ratio 0.98), per level 379/423/127/10613/18683 vs
469/424/143/10478/19289, and a pen histogram overlap of 94% (the top pens agree within about
10-30%). Side by side the drawings read the same; individual strokes differ because the random
numbers and the segmentation differ.

Known differences from the Python version:

1. **Random numbers.** sfc32 instead of numpy's PCG64: the same seed gives a different but
   equally valid drawing. The paper texture is only generated when `return_image` is set, so it
   no longer consumes random numbers before the strokes.
2. **Mean-shift flattening** (`cv2.pyrMeanShiftFiltering`): plain per-pixel mean shift with
   OpenCV's stopping rule, but without the image pyramid, and with the 33 x 33 spatial window
   sampled every 3rd pixel (every 2nd for `flatten_spatial` 6..11). The flattened image feeds only
   the segmentation; the modes it finds are the same.
3. **SLIC** (`skimage.segmentation.slic`): standard SLIC in Lab, 10 iterations, distance
   `dLab^2 / compactness^2 + dxy^2 / step^2`, grid step `floor(sqrt(w h / n_segments))`.
   Connectivity enforcement attaches fragments smaller than half a segment to a neighbour, but
   does not split oversized segments as scikit-image does.
4. **Region merging** (`graph.merge_hierarchical` on `rag_mean_color`): the same greedy
   merge-nearest-pair-first on mean colour, 4-adjacency. Done once on the SLIC labels for both
   thresholds (`merge`, `contour_merge`), which is what the Python effectively does too since SLIC
   is deterministic.
5. **Direction field**: structure tensor from central-difference gradients and Gaussian
   smoothing (reflect borders instead of zero padding). The "copy the nearest strong pixel" step
   uses a breadth-first fill (4-neighbour, Manhattan distance) instead of an exact Euclidean
   distance transform. The per-area majority vote afterwards makes this irrelevant for areas of
   64 px and more.
6. **Gaussian blur**: radius 3 sigma (OpenCV uses 4 sigma for float images), reflect-101 borders.
   Blurs with sigma > 3 run on a box-downsampled copy and are upsampled bilinearly.
7. **Downscale**: area averaging like `INTER_AREA`; the image is read as RGBA (alpha ignored).
8. **Contours**: Moore-neighbour boundary tracing of each 8-connected component in place of
   `cv2.findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE)`, and a closed-curve Douglas-Peucker in
   place of `cv2.approxPolyDP`. The walking direction can differ from OpenCV's; the Python code
   already probes both sides of a contour piece, so the pen choice does not depend on it.
9. **Textures**: `smooth_noise` upsamples the coarse random grid bilinearly rather than bicubic
   (dry-tip streaks, paper). `np.percentile` is reproduced with linear interpolation.
10. Everything the strokes are decided by (pen matching in Lab, lit tone per area, the deep
    target, local-average done-ness, grow, the three acceptance tests, the ink/coverage model
    and the stroke shaping) is ported line by line; the Python function names are kept as
    comments in `faber-core.js`.
