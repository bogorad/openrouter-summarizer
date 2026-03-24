// ── Imports ───────────────────────────────────────────────────────────────────
#import "@preview/fletcher:0.5.7" as fletcher: diagram, node, edge

// ── Page & typography ─────────────────────────────────────────────────────────
#set page(paper: "a4", margin: 1cm)
#set text(size: 5.5pt, font: "3270 Nerd Font")

// ── Layer colour themes ───────────────────────────────────────────────────────
#let ui   = (fill: rgb("#e1f5fe"), stroke: rgb("#01579b") + 0.7pt)
#let cs   = (fill: rgb("#f3e5f5"), stroke: rgb("#4a148c") + 0.7pt)
#let bg   = (fill: rgb("#e8f5e8"), stroke: rgb("#1b5e20") + 0.7pt)
#let ext  = (fill: rgb("#fff3e0"), stroke: rgb("#e65100") + 0.7pt)
#let stor = (fill: rgb("#fce4ec"), stroke: rgb("#880e4f") + 0.7pt)

// ── Legend helper — derives directly from theme dicts (no colour repetition) ──
#let legend-item(theme, label) = rect(
  fill:   theme.fill,
  stroke: theme.stroke,
  inset:  2pt,
  radius: 2pt,
)[#label]

// ── Title ──────────────────────────────────────────────────────────────────────
#place(top + center, dy: -0.5cm)[
  #text(size: 9pt, weight: "bold")[OpenRouter Summarizer — Architecture]
  #h(0.6em)
  #text(size: 6pt, fill: gray)[v3.9.42]
]

// ── Diagram ───────────────────────────────────────────────────────────────────
#diagram(
  // Positions faithfully converted from draw.io edits (col=(x-20)/120, row=(y-20)/85)
  //
  // Left cluster  (x 0–3.25):  CS track + ext libs + nb + japi/or
  // Right cluster (x 6.58–8.5): Chat/Options pages, BG SW/JS, handlers, storage
  spacing:           (1.0cm, 0.75cm),
  node-inset:        3pt,
  node-corner-radius: 2pt,
  edge-stroke:       0.45pt,
  mark-scale:        55%,

  // ── Row 0 ────────────────────────────────────────────────────────────────────
  node((3.67, 0),    [User],                    ..ui,   name: <user>),

  // ── Row 1 — UI pages ─────────────────────────────────────────────────────────
  node((1,    1),    [Web Page],                ..ui,   name: <webpage>),
  node((3.67, 1),    [Chat Page],               ..ui,   name: <chatpage>),  // moved centre
  node((6.58, 1),    [Options Page],            ..ui,   name: <optpage>),   // moved right

  // ── Row ~1.4 / ~1.9 / ~2 — script layers & pulled-up ext libs ───────────────
  node((2.33, 1.41), [marked.js],               ..ext,  name: <md>),        // pulled up
  node((3.67, 1.88), [chat.js],                 ..ui,   name: <chatjs>),
  node((1,    2),    [Content Script Layer],    ..cs,   name: <cslayer>),
  node((6.58, 2),    [options.js],              ..ui,   name: <optjs>),
  node((2.33, 2.31), [TurndownService],         ..ext,  name: <td>),        // pulled up

  // ── Row ~2.5 — NewsBlur (moved top-left) ─────────────────────────────────────
  node((0.17, 2.47), [NewsBlur API],            ..ext,  name: <nb>),

  // ── Row ~3 — BG SW & CS entry ────────────────────────────────────────────────
  node((1,    3),    [pageInteraction.js],      ..cs,   name: <pi>),
  node((6.58, 2.94), [Background SW],           ..bg,   name: <bgsw>),      // moved right+up

  // ── Row 4 — CS modules & BG JS & storage ─────────────────────────────────────
  node((0,    4),    [highlighter.js],          ..cs,   name: <hl>),
  node((1,    4),    [floatingIcon.js],         ..cs,   name: <fi>),
  node((2,    4),    [joplinManager.js],        ..cs,   name: <jm>),        // swapped left
  node((3.25, 4),    [summaryPopup.js],         ..cs,   name: <sp>),        // swapped right
  node((6.58, 3.94), [background.js],           ..bg,   name: <bgjs>),
  node((7.83, 3.88), [Chrome Storage],          ..stor, name: <cstore>),    // moved far right
  node((8.5,  3.25), [storage.sync],            ..stor, name: <ssync>),
  node((8.5,  4.47), [storage.session],         ..stor, name: <ssess>),

  // ── Row 5 — CS utilities, Joplin API, BG handlers ────────────────────────────
  node((0,    5),    [htmlSanitizer.js],        ..cs,   name: <hs>),
  node((1,    5),    [utils.js],                ..cs,   name: <ut>),
  node((2,    5),    [constants.js],            ..cs,   name: <co>),
  node((3.25, 4.94), [Joplin API],              ..ext,  name: <japi>),      // moved up
  node((4.58, 4.94), [summaryHandler.js],       ..bg,   name: <sh>),
  node((5.58, 4.94), [chatHandler.js],          ..bg,   name: <ch>),
  node((6.58, 4.94), [settingsManager.js],      ..bg,   name: <sm>),
  node((7.58, 4.94), [chatContextManager.js],   ..bg,   name: <ccm>),

  // ── Row 6 — OpenRouter API & BG utilities ────────────────────────────────────
  node((3.25, 5.76), [OpenRouter API],          ..ext,  name: <or>),        // moved up
  node((4.58, 5.94), [pricingService.js],       ..bg,   name: <ps>),
  node((5.58, 5.94), [uiActions.js],            ..bg,   name: <ua>),
  node((6.58, 5.94), [backgroundUtils.js],      ..bg,   name: <bu>),

  // ── Edges: User → UI pages ───────────────────────────────────────────────────
  edge(<user>,    <webpage>,  "->"),
  edge(<user>,    <optpage>,  "->"),
  edge(<user>,    <chatpage>, "->"),

  // ── Edges: Web page → Content script layer ───────────────────────────────────
  edge(<webpage>, <cslayer>,  "->"),
  edge(<cslayer>, <pi>,       "->"),

  // ── Edges: pageInteraction → CS modules & shared utilities ───────────────────
  edge(<pi>, <hl>,   "->"),
  edge(<pi>, <fi>,   "->"),
  edge(<pi>, <sp>,   "->"),
  edge(<pi>, <jm>,   "->"),
  edge(<pi>, <hs>,   "->"),
  edge(<pi>, <ut>,   "->"),
  edge(<pi>, <co>,   "->"),
  edge(<pi>, <td>,   "->"),
  edge(<pi>, <md>,   "->"),
  edge(<pi>, <bgsw>, "->"),
  edge(<pi>, <nb>,   "->"),

  // ── Edges: Background SW → background.js → handlers & utilities ──────────────
  edge(<bgsw>, <bgjs>, "->"),
  edge(<bgjs>, <sh>,     "->"),
  edge(<bgjs>, <ch>,     "->"),
  edge(<bgjs>, <sm>,     "->"),
  edge(<bgjs>, <ccm>,    "->"),
  edge(<bgjs>, <ps>,     "->"),
  edge(<bgjs>, <ua>,     "->"),
  edge(<bgjs>, <bu>,     "->"),
  edge(<bgjs>, <cstore>, "->"),

  // ── Edges: Storage hierarchy ─────────────────────────────────────────────────
  edge(<cstore>, <ssync>,  "->"),
  edge(<cstore>, <ssess>,  "->"),

  // ── Edges: Background → External APIs ────────────────────────────────────────
  edge(<sh>, <or>,   "->"),
  edge(<ch>, <or>,   "->"),
  edge(<ps>, <or>,   "->"),

  // ── Edges: Joplin manager → Joplin API ───────────────────────────────────────
  edge(<jm>, <japi>, "->"),

  // ── Edges: Options page pipeline ─────────────────────────────────────────────
  edge(<optpage>, <optjs>,   "->"),
  edge(<optjs>,   <bgsw>,    "->"),
  edge(<optjs>,   <cstore>,  "->"),

  // ── Edges: Chat page pipeline ────────────────────────────────────────────────
  edge(<chatpage>, <chatjs>, "->"),
  edge(<chatjs>,   <bgsw>,   "->"),
  edge(<chatjs>,   <ut>,     "->"),
  edge(<chatjs>,   <co>,     "->"),
  edge(<chatjs>,   <md>,     "->"),

  // ── Edges: Interaction flow (dashed, labelled) ────────────────────────────────
  edge(<hl>,   <fi>,       "-->", label: [DOM sel.],    label-size: 4pt),
  edge(<fi>,   <jm>,       "-->"),                                          // new: fi → jm
  edge(<jm>,   <sp>,       "-->", label: [user action], label-size: 4pt),  // was fi → sp
  edge(<sp>,   <bgsw>,     "-->", label: [req.],        label-size: 4pt),
  edge(<bgsw>, <sp>,       "-->", label: [resp.],       label-size: 4pt),
  edge(<sp>,   <chatpage>, "-->", label: [chat req.],   label-size: 4pt),
)

// ── Legend ────────────────────────────────────────────────────────────────────
#v(0.4em)
#grid(
  columns: 5,
  gutter:  0.5em,
  legend-item(ui,   [User Interface]),
  legend-item(cs,   [Content Scripts]),
  legend-item(bg,   [Background Services]),
  legend-item(ext,  [External / Libraries]),
  legend-item(stor, [Storage]),
)
