<div align="center">

# Overprint

**Turn a photo into a risograph print, in the browser.**

[**Try it live →**](https://chuwd19.github.io/overprint/)

</div>

<table>
<tr>
<td width="50%" valign="top"><img src="docs/images/source.jpg" alt="Photograph of Grand Prismatic Spring, Yellowstone"><br><sub><b>The photograph.</b> Grand Prismatic Spring, Yellowstone — continuous tone, thousands of colours.</sub></td>
<td width="50%" valign="top"><img src="docs/images/hero.jpg" alt="The same photograph printed in black, blue and orange halftone inks"><br><sub><b>Printed.</b> Three inks — Black, Blue, Orange — each screened at its own angle onto natural stock.</sub></td>
</tr>
</table>

Overprint doesn't lay a dot filter over your photo. It does roughly what a print shop
does: pick a handful of spot inks, work out how much of each one belongs at every point
in the picture, screen each ink into its own grid of dots at its own angle, then print
them one on top of another onto paper.

You get the things that make a riso print look like a riso print — rosettes where the
screens cross, ink that drifts slightly out of register, colours the ink set can't
quite reach, and paper grain showing through the highlights.

It's a single static page. No build step, no dependencies, no server, nothing uploaded —
your photo is decoded and drawn entirely in your own browser.

> **Reproduce any picture on this page.** The source image is in this repo at
> [`docs/images/source.jpg`](docs/images/source.jpg). Open the app, drop that file on the
> sheet, and pick the matching preset.

## Six treatments of one photograph

<table>
<tr>
<td width="33%" valign="top"><img src="docs/images/autopick.jpg" alt="Auto-picked inks"><br><b>What Auto-pick chose</b><br><sub>Left to itself the app picked Blue + Fluorescent Pink + Yellow — a process-like triad. Note the lavender cast on the mineral flats: three inks can't reach every colour, and it spends the error on hue rather than tone.</sub></td>
<td width="33%" valign="top"><img src="docs/images/two-colour.jpg" alt="Two-colour poster"><br><b>Two-colour poster</b><br><sub>Blue + Scarlet on natural stock, 34 lpi round dot. Two inks, and the pool still separates cleanly from the mats.</sub></td>
<td width="33%" valign="top"><img src="docs/images/fluoro.jpg" alt="Fluoro zine"><br><b>Fluoro zine</b><br><sub>Fluorescent pink + blue through a grain screen instead of dots, registration deliberately loose.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="docs/images/kraft.jpg" alt="Kraft duotone"><br><b>Kraft duotone</b><br><sub>Black + Sunflower on kraft, diamond screen, hand-cut edge. Dark paper means highlights can only ever be paper.</sub></td>
<td width="33%" valign="top"><img src="docs/images/coarse.jpg" alt="Coarse dot"><br><b>Coarse dot</b><br><sub>A single ink at 14 lpi. Big enough that you read the dots before the picture.</sub></td>
<td width="33%" valign="top"><img src="docs/images/line.jpg" alt="Line screen"><br><b>Line screen</b><br><sub>Steel + Crimson through a 40 lpi line screen, each ink at its own angle.</sub></td>
</tr>
</table>

## How a print is made

The app shows you its own working. The buttons along the top step through the same
stages a press goes through.

**1. The photo** — whatever you dropped in, with exposure, contrast and saturation applied.

<img src="docs/images/stage-photo.jpg" width="420" alt="The source image">

**2. Separation** — the photo resolved into one film per ink: how much black, how much
blue, how much orange belongs at each point. Continuous tone, no dots yet. Look at what
each film ended up carrying — black took the dark mineral structure and the boardwalk,
blue took the pool, orange took the bacterial mats with the pool knocked out of it.

<img src="docs/images/stage-separation.jpg" width="860" alt="Three continuous-tone ink films: black, blue, orange">

**3. Screening** — each film broken into dots. Every ink gets its own frequency, angle and
dot shape, which is what stops the three screens landing on top of each other and turning
into a muddy moiré.

<img src="docs/images/stage-screens.jpg" width="860" alt="The same three films after halftone screening">

**4. Overprint** — the screened films printed onto the paper in order, each shifted a
fraction against the last. Where dots overlap you get colours that aren't in any single
ink; the green rim around the pool is blue and orange landing together.

<img src="docs/images/stage-print.jpg" width="420" alt="The finished three-colour print">

## Screens

Five ways of breaking a tone into marks, shown on the pool's edge at 22 lpi in a single
black ink. The first four are *amplitude* screens — a regular grid where the marks grow
and shrink. The last is *frequency* — same-sized specks, scattered more densely in the
shadows.

<table>
<tr>
<td align="center"><img src="docs/images/shape-dot.jpg" width="150" alt="Dot screen"><br><b>Dot</b></td>
<td align="center"><img src="docs/images/shape-diamond.jpg" width="150" alt="Diamond screen"><br><b>Diamond</b></td>
<td align="center"><img src="docs/images/shape-square.jpg" width="150" alt="Square screen"><br><b>Square</b></td>
<td align="center"><img src="docs/images/shape-line.jpg" width="150" alt="Line screen"><br><b>Line</b></td>
<td align="center"><img src="docs/images/shape-grain.jpg" width="150" alt="Grain screen"><br><b>Grain</b></td>
</tr>
</table>

## The interface

<img src="docs/images/interface.jpg" width="860" alt="The Overprint interface: a print on a dark press bed, ink channel controls on the right">

The panel is deliberately colourless — the only saturated thing in the interface is each
channel's actual ink, so nothing competes with the print you're judging.

| Control | What it does |
|---|---|
| **Open photo** (<kbd>O</kbd>) | Loads a new photo. You can also drop an image file on the sheet, or paste one from the clipboard. |
| **Auto-pick** | Searches the ink library for the set that reproduces *this* photo on *this* paper most closely. It measures reproduction error, so it picks a process-like triad for one image and two flat colours for another. |
| **Screen angle dial** | Drag it. Hold <kbd>Shift</kbd> to snap to 7.5°, or use the arrow keys. |
| **Shuffle** (<kbd>R</kbd>) | Keeps your photo, reprints it with new inks, screen and frame. |
| **Misregistration** | Shifts every ink but the first, the way a second pass through the drum would. |
| **Hand-cut edge** | Roughens the edge of the ink block, like paper torn against a ruler. |
| **Surround** | Dark, neutral grey or white behind the sheet. The grey is the ISO 3664 viewing grey you'd judge a real proof against. |
| **Save separations** | One PNG per ink, ready to take to an actual press. |

Your photo and settings are kept in your browser and restored when you come back.

## Run it locally

```sh
git clone https://github.com/chuwd19/overprint.git
cd overprint
./run.sh          # serves on :8123 and opens a browser
```

ES modules need a real origin, so opening `index.html` straight from the Finder won't
work — hence the tiny server. Any browser with WebGL2 will do (Safari 15+, Chrome,
Firefox, and mobile Safari).

To host your own copy, push it anywhere that serves static files. There's no build step;
the app itself is 76 KB.

## Under the hood

The part worth reading about is the separation, because it's where a print simulator
usually goes wrong.

**Ink doesn't work like a filter.** The obvious model is Beer–Lambert — light passes
through ink and gets attenuated, so density adds up. That's true of a solid film, but a
*screened tint* isn't a film. It's a scattering of solid dots with bare paper between
them, and what you see is the average. So reflectance is **linear** in coverage, not
exponential:

```
R = P · ∏ (1 − aᵢ(1 − Cᵢ))
```

for ink colours `C` on paper `P`, with `a` the fraction of the area each ink covers.
That's the Murray–Davies relation, and it's what the renderer composites.

Getting from a photo to those coverages means inverting it, which is a small nonlinear
least-squares problem — solved per pixel with a linear-absorbance estimate followed by
three Gauss–Newton steps in density space. The fit is weighted toward luminance, so a
colour outside the ink set's reach loses its hue before it loses its tone.

It's worth doing properly. The first version used plain Beer–Lambert and mid-grey came
out as `#c3adb6` — visibly washed out, with every photo needing the density cranked by
hand. With the correct model, a single black ink reproduces a grey ramp **exactly**.

**Screening keeps tone honest.** A dot's radius is derived from the coverage it needs to
represent — `r = √(d/π)` for a round dot — rather than being scaled by eye, so tones don't
drift as the frequency changes. Past 50% coverage neighbouring dots would merge and the
maths stops working, so the shader crosses over to drawing shrinking *holes* at the cell
corners instead.

**Everything is in physical units.** Frequency is lines per inch against a 7-inch long
edge, so a 3× export has the same physical dot size as what you saw on screen, just with
more pixels describing it.

**Auto-pick is a search, not a heuristic.** It scores every candidate ink set by how
closely it reproduces a sample of your photo's pixels, in Oklab. Exhaustive over pairs;
for three inks it seeds from the best pair and refines each slot until no swap helps.

## Project layout

```
index.html        page shell
src/style.css     interface
src/color.js      sRGB ↔ linear, Oklab, small matrix inverse
src/inks.js       ink library, paper stocks, presets
src/separate.js   the separator — runs standalone in node, too
src/render.js     WebGL2 renderer and the shader
src/app.js        state, controls, export, session storage
docs/images/      everything on this page, including the source scan
```

`src/separate.js` has no browser dependencies, so you can import it in node and check the
colour maths for yourself.

## Not implemented

Crop marks, bleed and true-size imposition; saving your own presets. The ink library is 26
Riso-like colours rather than a full swatch book.

## Licence

MIT — see [LICENSE](LICENSE). The demo photograph is public domain (see Credits).

## Credits

Built after Apple's [tone](https://apps.apple.com/us/app/tone-photos-printed/id6792391699),
which does the same job on iOS and is worth your money if you're on a phone.

The demo photograph is Grand Prismatic Spring, Yellowstone National Park, by Jim Peaco
for the [National Park Service](https://commons.wikimedia.org/wiki/File:Grand_prismatic_spring.jpg).
As a work of the US government it is in the public domain. It was picked because it is an
ordinary photograph that happens to run the whole way from deep blue through cyan, green
and yellow to rust — which is exactly the kind of thing a three-ink press has to fight.
