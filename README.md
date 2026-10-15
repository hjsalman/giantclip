# GiantClip

Free browser games in the spirit of the old after-school flash sites. Plain HTML, CSS and JavaScript. No build step, no libraries.

## Games

| Game | Folder | Status |
| --- | --- | --- |
| Knockout Alley (boxing) | `games/knockout-alley/` | Playable |
| Code Red Pursuit (police chase) | `games/code-red-pursuit/` | Playable |
| Ember & Tide, Turret Town, Corner Pocket, Sky Courier | | Coming soon |

## Folder layout

```
index.html                  home page with the game grid
css/site.css                shared portal styles
js/site.js                  thumbnails, search, favorites, ratings, fullscreen, awards
games/knockout-alley/       game page + game.js
games/code-red-pursuit/     game page + game.js
```

## Run it locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then go to http://localhost:8000

## Put it on GitHub Pages

1. Create a new public repo on GitHub.
2. Upload everything in this folder (keep the folder structure).
3. Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.
4. Your site goes live at `https://<your-username>.github.io/<repo-name>/`

## Adding a new game

1. Copy `games/code-red-pursuit/` to `games/<new-game>/`.
2. Replace `game.js` and update the page title, controls and awards.
3. Add a tile to the grid in `index.html`, and a thumbnail painter in `js/site.js` (`art` object).
