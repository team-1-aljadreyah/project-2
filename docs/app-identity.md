# The phone apps' visual identity

The two phone apps of Al-Nahrain share one identity. Each app has its own pair of colors.

- **Shop owners' app:** `/client`
- **Reps' app:** `/driver`

The code is `IDENTITY` and `Rivers` in `components/apps/kit.tsx`.

## Colors: two per app, on graphite

| | main (buttons, icons, numbers) | soft (tints, second lines, highlights) |
| --- | --- | --- |
| Shop owners | `#e1692b`: the orange of the logo's sun | `#f6c7a1`: sand |
| Reps | `#1fb5a5`: river teal | `#a8ede3`: mint |

- **Background:** always the dark graphite of the logo, `#08090b`.
- **Text:** white, with grey (white at 55 to 75% opacity) for second lines.
- **Neutral states:** "before" or "off" uses grey (`#8a8f98`), never a third color.
- **Shades:** a darker shade of `main` is allowed for depth, for example the last call of the shop owners' page. It is the same color, not a new one.

## The motif: the two rivers

The Al-Nahrain logo has two waves, the Tigris and the Euphrates. On the app pages they become `Rivers`:
- **two long waving lines:** a solid one in `main`, and a dashed one in `soft` that flows slowly;
- **where:** under the hero, and before the last call.

## Shapes and type

- **Font:** IBM Plex Sans Arabic, the same as the whole site. Titles are bold, with the key words in a slow gradient from `soft` to `main`.
- **Corners:** cards 24 to 28 px, the hero phone 44 px, buttons 16 px. Chips and pills are fully round.
- **Cards:** a thin white border at 10% opacity, and a gradient from the card's color at about 20% opacity down to graphite.
- **Icons:** lucide icons, in a rounded square filled with `main` or `soft`, with dark icons on top.
- **Motion:** things rise and fade in when they scroll into view; the hero's phone changes screens by itself. Everything stops for people who turned off motion on their device.

## App icons

`public/apps/` holds the app icons:
- **Shop owners:** a white shop with sand stripes on orange.
- **Reps:** a white van with a mint stripe on teal.

Each comes in four kinds: a normal one, a "maskable" one (with an edge for Android's shapes), an Apple one, and sizes 192 and 512. They are drawn by a script, so any color change means drawing them again.
