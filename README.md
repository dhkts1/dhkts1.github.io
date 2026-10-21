# dhkts1.github.io

The site for [tcr](https://github.com/dhkts1/tcr), served at https://dhkts1.github.io/.

One static page: `index.html` with inline CSS, no build step, no web fonts. GitHub Pages serves this
repository's `main` branch as it is.

`motion.js` adds the motion on top of the page: GSAP 3.15.0 with ScrollTrigger and Flip, and d3
7.9.0 for the performance charts, all copied unmodified into `vendor/` and served from this site, so
a visit makes no request to a third-party CDN. d3 is fetched only when the charts come near the
viewport. The page is complete without the script, and with reduced motion asked for it does not move.

The Download buttons link to the release page, and a script in `index.html` points them straight at
the newest `TcrBar-<version>.dmg` by asking the GitHub API for the latest release.

Every factual claim on the page comes from tcr's own `README.md`, `docs/` and `LICENSE`; change the
page when those change. The panel in the hero is an illustration with example accounts, drawn from
TcrBar's colour tokens (`apps/macos/Sources/TcrBar/Tokens.swift` in tcr).

The performance figures were measured on 2026-10-20 against a local stand-in for Anthropic's API;
the page says how, and where the tools tie.
