# Faber shader, in the browser

A "stroke by stroke" viewer that turns a photo into a marker drawing and paints it one stroke at a time, entirely in your browser. A tribute to [Faber van Eeden](https://fabervaneeden.nl/), the author's uncle, whose felt-tip marker drawings inspired the style.

Live demo: https://craneofthewild.github.io/faber-shader/ (also embedded at https://arthurvaneeden.nl/project/faber-shader/stroke-by-stroke/)

## Features

- Presets: Marker, Realistic and Custom, with settings for the drawing style.
- Convert your own photo in the browser. Nothing is uploaded; the conversion runs in a Web Worker on your machine.
- Download a PNG at any stage of the drawing.
- The bundled example is a photo of the Binnenhof in The Hague.

## Run locally

The page uses a module Web Worker, so it must be served over http (opening the file directly will not work):

```sh
python3 -m http.server
```

Then open http://localhost:8000/.

## GitHub Pages

The repository root is the site. Enable Pages with source "Deploy from a branch", branch `main`, folder `/ (root)`. The `.nojekyll` file keeps GitHub from processing the files.

## Embed

```html
<iframe src="https://arthurvaneeden.nl/project/faber-shader/stroke-by-stroke/" width="100%" height="700" style="border:0"></iframe>
```

When embedded, the page posts `{faberHeight}` (its content height in pixels) to its parent, so the iframe can fit it:

```js
addEventListener('message', e => {
  if (e.data && e.data.faberHeight) {
    document.querySelector('iframe').style.height = e.data.faberHeight + 'px';
  }
});
```

## Layout

- `index.html`: the viewer (single page).
- `engine/`: the JavaScript engine, see [engine/README.md](engine/README.md).
- `data/binnenhof.jpg`: the example photo (700 px).

`index.html` is generated from the author's private faber_shader project (the palette is baked into it), so edits to the viewer should be made there, not in this file.

## Credits

- Inspiration: the marker drawings of [Faber van Eeden](https://fabervaneeden.nl/).
- Photo "Den Haag Binnenhof 02" by Zairon, Wikimedia Commons, CC BY-SA 4.0. Drawings made from it carry the same licence. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Licence

Code: MIT, see [LICENSE](LICENSE).
