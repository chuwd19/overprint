# Overprint

Turns a photo into a risograph-style print: it separates the image into one to
three spot inks, screens each ink through its own halftone, and overprints them
onto a paper stock with grain and a little misregistration.

Built after Apple's [tone](https://apps.apple.com/us/app/tone-photos-printed/id6792391699),
which does the same job on iOS. This is a local web app — no build step, no
dependencies, no network.

## Run it

```sh
./run.sh          # serves on :8123 and opens a browser
./run.sh 9000     # or pick a port
```

ES modules need a real origin, so opening `index.html` from the Finder won't
work. Requires a browser with WebGL2 (Safari 15+, Chrome, Firefox).

Drop a photo onto the sheet, or press **Use a test image** to get a tonal target
to play with. Nothing leaves the machine; the photo and your settings are stored
in the browser and restored next time.

## How it works

The interesting part is that this is a real print simulation rather than a dot
filter. Three stages, all in one fragment shader:

**Separation.** A screened tint of coverage `a` puts ink on that fraction of the
paper, so the reflectance is *linear* in coverage, not exponential:

```
R = P · Π (1 − aᵢ(1 − Cᵢ))
```

for ink colours `C` on paper `P` (Murray-Davies). Inverting that for the
coverages is a small nonlinear least-squares problem, solved per pixel with a
linear-absorbance seed and three Gauss-Newton steps in density space. The fit is
weighted toward luminance, so colours outside the ink set's gamut lose hue
before they lose tone. With a single black ink the grey ramp round-trips exactly.

**Screening.** Each ink gets its own frequency, angle and dot shape. Spot radius
is derived from the target coverage (`r = √(d/π)` for round dots), so tone stays
true to the photo instead of drifting. Past 50% the dots merge, so the shader
crosses over to shrinking holes on the cell corners. Frequency is specified in
lines per inch against a 7-inch long edge, which is why a 3× export has the same
physical dot size as the preview.

**Overprint.** The films are multiplied down onto the paper in order, each
offset slightly if misregistration is on — the shared artwork mask keeps the
frame crisp, so inks shift inside the picture, not at its edge.

**Auto-pick** searches the ink library for the set that reproduces *this* photo
on *this* paper with the least Oklab error: exhaustive over pairs, then a seeded
refinement for three. It is measuring reproduction error, not clustering hues,
so it will happily choose a process-like triad for one photo and two flats for
another.

## Controls worth knowing

| | |
|---|---|
| **Print / Separation / Screens / Photo** | Proof views. Separation shows the continuous ink films, Screens shows them screened — the same steps a press goes through. |
| **Auto-pick** | Best-fitting inks for the current photo and paper. |
| **Shuffle** (`R`) | Keeps the photo, reprints it with new inks, screen and frame. |
| **Screen angle dial** | Drag it. Shift snaps to 7.5°. Arrow keys work too. |
| **Misregistration** | Shifts every ink but the first, the way a second pass through the drum would. |
| **Surround swatches** | Dark, neutral grey (ISO 3664 viewing grey) or white behind the sheet. |
| **Save separations** | One PNG per ink, for actually taking to a press. |

## Files

```
index.html        shell
src/style.css     interface
src/color.js      sRGB/linear, Oklab, small matrix inverse
src/inks.js       ink library, paper stocks, presets
src/separate.js   the separator (also runs standalone in node)
src/render.js     WebGL2 renderer and the shader
src/app.js        state, controls, export, session storage
```

## Not implemented

Crop marks, bleed and true-size imposition; saving custom presets. The ink
library is 26 Riso-like colours rather than a full swatch book.
