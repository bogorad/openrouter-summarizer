#import "@preview/fletcher:0.5.7" as fletcher: diagram, node, edge

#set page(paper: "a4", margin: 1cm)
#set text(size: 5.5pt, font: "3270 Nerd Font")

#let ui   = (fill: rgb("#e1f5fe"), stroke: rgb("#01579b") + 0.7pt)
#let cs   = (fill: rgb("#f3e5f5"), stroke: rgb("#4a148c") + 0.7pt)
#let bg   = (fill: rgb("#e8f5e8"), stroke: rgb("#1b5e20") + 0.7pt)
#let ext  = (fill: rgb("#fff3e0"), stroke: rgb("#e65100") + 0.7pt)
#let stor = (fill: rgb("#fce4ec"), stroke: rgb("#880e4f") + 0.7pt)

#place(top + center, dy: -0.5cm)[
  #text(size: 9pt, weight: "bold")[OpenRouter Summarizer — Architecture]
  #h(0.6em)#text(size: 6pt, fill: gray)[v3.9.42]
]
#diagram(
  spacing: (1.2cm, 0.75cm),
  node-inset: 3pt, node-corner-radius: 2pt,
  edge-stroke: 0.45pt, mark-scale: 55%,

  node((3,   0), [User],              ..ui, name: <user>),
  node((0.5, 1), [Web Page],          ..ui, name: <webpage>),
  node((3,   1), [Options Page],      ..ui, name: <optpage>),
  node((5.5, 1), [Chat Page],         ..ui, name: <chatpage>),
  node((0.5, 2), [Content Script Layer], ..cs, name: <cslayer>),
  node((3,   2), [options.js],           ..ui, name: <optjs>),
  node((5.5, 2), [chat.js],              ..ui, name: <chatjs>),
  node((0.5, 3), [pageInteraction.js],   ..cs, name: <pi>),
  node((0,   4), [highlighter.js],       ..cs, name: <hl>),
  node((2,   4), [floatingIcon.js],      ..cs, name: <fi>),
  node((4,   4), [summaryPopup.js],      ..cs, name: <sp>),
  node((6,   4), [joplinManager.js],     ..cs, name: <jm>),
  node((0,   5), [htmlSanitizer.js],     ..cs, name: <hs>),
  node((2,   5), [utils.js],             ..cs, name: <ut>),
  node((4,   5), [constants.js],         ..cs, name: <co>),
  node((6,   5), [TurndownService],      ..ext, name: <td>),
  node((6,   6), [marked.js],            ..ext, name: <md>),
  node((3,   7), [Background SW],        ..bg, name: <bgsw>),
  node((3,   8), [background.js],        ..bg, name: <bgjs>),
  node((0,   9), [summaryHandler.js],    ..bg, name: <sh>),
  node((2,   9), [chatHandler.js],       ..bg, name: <ch>),
  node((4,   9), [settingsManager.js],   ..bg, name: <sm>),
  node((6,   9), [chatContextManager.js], ..bg, name: <ccm>),
  node((0,  10), [pricingService.js],    ..bg, name: <ps>),
  node((2,  10), [uiActions.js],         ..bg, name: <ua>),
  node((4,  10), [backgroundUtils.js],   ..bg, name: <bu>),
  node((2,  11), [Chrome Storage],       ..stor, name: <cstore>),
  node((1,  12), [storage.sync],         ..stor, name: <ssync>),
  node((3,  12), [storage.session],      ..stor, name: <ssess>),
  node((1,  13), [OpenRouter API],       ..ext, name: <or>),
  node((3,  13), [Joplin API],           ..ext, name: <japi>),
  node((5,  13), [NewsBlur API],         ..ext, name: <nb>),

  edge(<user>,    <webpage>,  "->"), edge(<user>,    <optpage>,  "->"), edge(<user>,    <chatpage>, "->"),
  edge(<webpage>, <cslayer>,  "->"), edge(<cslayer>, <pi>,       "->"),
  edge(<pi>, <hl>, "->"), edge(<pi>, <fi>,   "->"), edge(<pi>, <sp>,   "->"), edge(<pi>, <jm>,   "->"),
  edge(<pi>, <hs>, "->"), edge(<pi>, <ut>,   "->"), edge(<pi>, <co>,   "->"), edge(<pi>, <td>,   "->"),
  edge(<pi>, <md>, "->"), edge(<pi>, <bgsw>, "->"), edge(<pi>, <nb>,   "->"),
  edge(<bgsw>,   <bgjs>,   "->"),
  edge(<bgjs>,   <sh>,     "->"), edge(<bgjs>, <ch>,     "->"), edge(<bgjs>, <sm>,  "->"), edge(<bgjs>, <ccm>, "->"),
  edge(<bgjs>,   <ps>,     "->"), edge(<bgjs>, <ua>,     "->"), edge(<bgjs>, <bu>,  "->"), edge(<bgjs>, <cstore>, "->"),
  edge(<cstore>, <ssync>,  "->"), edge(<cstore>, <ssess>, "->"),
  edge(<sh>,     <or>,     "->"), edge(<ch>,  <or>,   "->"), edge(<ps>, <or>,   "->"),
  edge(<jm>,     <japi>,   "->"),
  edge(<optpage>, <optjs>,  "->"), edge(<optjs>,   <bgsw>,   "->"), edge(<optjs>,   <cstore>, "->"),
  edge(<chatpage>,<chatjs>, "->"), edge(<chatjs>,  <bgsw>,   "->"), edge(<chatjs>,  <ut>,     "->"),
  edge(<chatjs>,  <co>,     "->"), edge(<chatjs>,  <md>,     "->"),

  edge(<hl>,   <fi>,       "-->", label: [DOM sel.],    label-size: 4pt),
  edge(<fi>,   <sp>,       "-->", label: [user action], label-size: 4pt),
  edge(<sp>,   <bgsw>,     "-->", label: [req.],        label-size: 4pt),
  edge(<bgsw>, <sp>,       "-->", label: [resp.],       label-size: 4pt),
  edge(<sp>,   <chatpage>, "-->", label: [chat req.],   label-size: 4pt),
)

#v(0.4em)
#grid(columns: 5, gutter: 0.5em,
  rect(fill: rgb("#e1f5fe"), stroke: rgb("#01579b") + 0.6pt, inset: 2pt, radius: 2pt)[User Interface],
  rect(fill: rgb("#f3e5f5"), stroke: rgb("#4a148c") + 0.6pt, inset: 2pt, radius: 2pt)[Content Scripts],
  rect(fill: rgb("#e8f5e8"), stroke: rgb("#1b5e20") + 0.6pt, inset: 2pt, radius: 2pt)[Background Services],
  rect(fill: rgb("#fff3e0"), stroke: rgb("#e65100") + 0.6pt, inset: 2pt, radius: 2pt)[External / Libraries],
  rect(fill: rgb("#fce4ec"), stroke: rgb("#880e4f") + 0.6pt, inset: 2pt, radius: 2pt)[Storage],
)
