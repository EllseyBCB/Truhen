# Truhen — 3D-Truhenöffnungs-Animation

Eine Truhenöffnungs-Animation im Stil von Clash Royale & Co. für die Einbindung
in eine iOS-App. Komplett self-contained: keine externen Assets, kein Build-Schritt,
kein Server nötig — einfach `index.html` im Browser öffnen.

**Vier Truhen-Stufen** (nach den Referenzbildern gestaltet), die zufällig gewichtet erscheinen:

| Truhe | Belohnung | Wahrscheinlichkeit |
|---|---|---|
| Holztruhe | Häufig | 40 % |
| Runentruhe (Silber, blaue Runen) | Selten | 30 % |
| Kristalltruhe | Episch | 20 % |
| Goldtruhe (Amethyst) | Legendär | 10 % |

## Wie die Animation funktioniert

Die Animation folgt den klassischen Game-Feel-Prinzipien großer Mobile Games:

1. **Idle** — Truhe wippt sanft, Beschläge glimmen, Hinweis pulsiert
2. **Antippen (3×)** — gedämpftes Wackeln mit *Squash & Stretch* (Vorfreude aufbauen)
3. **Anticipation** — kurzes Zusammenstauchen direkt vor dem Aufspringen
4. **Öffnen** — Deckel springt mit *easeOutBack*-Overshoot ~110° auf, dazu:
   Lichtsäule, Screen-Flash, Kamera-Shake, 150 Funken-Partikel, Münzen mit Bounce-Physik
5. **Belohnung** — Kristall steigt auf und schwebt vor rotierenden Lichtstrahlen,
   Seltenheits-Banner erscheint
6. **Reset** — Deckel schließt, die nächste zufällige Truhe wartet

Technik: [Three.js](https://threejs.org) r147 (in `vendor/` lokal eingebunden, inkl.
`GLTFLoader` und `RoomEnvironment`). Die Truhe ist das CC0-Modell **„Chest" von
Quaternius** ([poly.pizza/m/eEcIqgJzJ1](https://poly.pizza/m/eEcIqgJzJ1), Public Domain),
als Base64 in `assets/chest-glb.js` eingebettet — dadurch ist kein `fetch()` nötig und
alles läuft auch von `file://` und im WKWebView. Der Deckel hängt am Skelett-Knochen
`Chest_Top` und wird manuell mit Easing rotiert; die vier Truhen-Stufen entstehen durch
Umfärben der benannten Modell-Materialien (`Wood`, `DarkMetal` = Rahmen, `Gold` =
Schatz/Nieten, …). Dazu kommen echte Schatten, eine Environment-Map für realistische
Metall-Reflexionen, Partikel- und Lichteffekte sowie per WebAudio synthetisierte Sounds.
Die Logik ist eine kleine State-Machine in `src/chest.js`
(`idle → opening → opened → closing`). `prefers-reduced-motion` wird respektiert.

## Einbindung in deine iOS-App (Swift / Xcode)

### Weg A (empfohlen): WKWebView

Die Demo läuft unverändert in einem `WKWebView`. So gehst du vor:

1. Ziehe `index.html`, `src/`, `vendor/` und `assets/` in dein Xcode-Projekt
   (Häkchen bei „Copy items if needed", als **Folder Reference** hinzufügen).
2. Füge diese SwiftUI-View hinzu:

```swift
import SwiftUI
import WebKit

struct ChestView: UIViewRepresentable {
    /// Wird aufgerufen, wenn die Truhe geöffnet wurde.
    var onOpened: ((_ chest: String, _ rarity: String) -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator(onOpened: onOpened) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // JS→Swift-Bridge: chest.js meldet sich unter dem Namen "chest"
        config.userContentController.add(context.coordinator, name: "chest")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onOpened: ((String, String) -> Void)?
        init(onOpened: ((String, String) -> Void)?) { self.onOpened = onOpened }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "chest",
                  let body = message.body as? [String: Any],
                  let chest = body["chest"] as? String,
                  let rarity = body["rarity"] as? String else { return }
            onOpened?(chest, rarity)
        }
    }
}
```

3. Verwenden wie jede andere View:

```swift
ChestView { chest, rarity in
    print("\(chest) geöffnet – Belohnung: \(rarity)")
    // Hier z.B. die Belohnung im Spielstand gutschreiben
}
.ignoresSafeArea()
```

Die Bridge ist in `src/chest.js` bereits eingebaut (`notifyApp(...)`) und im normalen
Browser automatisch ein No-op.

### Weg B (später, voll nativ): SceneKit / RealityKit

Wenn die Truhe tiefer ins Spiel integriert werden soll (eigene Kamera, Interaktion mit
anderen 3D-Objekten), lohnt sich der native Weg:

- 3D-Modell als `.usdz` laden (`SCNScene(named:)`) — Modelle siehe Download-Quellen unten
- Deckel-Node über `SCNAction`/`CAKeyframeAnimation` mit denselben Timings animieren
  (Anticipation 0.22 s → Deckel 0.55 s mit Overshoot → Belohnung ab 0.5 s)
- Partikel über `SCNParticleSystem`, Flash/Banner als SwiftUI-Overlay

Dieser Prototyp dient dabei als Referenz für Timing, Easing und Effekt-Reihenfolge.

## Eigene Truhen-Grafiken verwenden

Die vier gelieferten Truhen-Bilder (Holz, Silber-Runen, Kristall, Gold-Amethyst) waren
die Design-Vorlage für die prozeduralen 3D-Truhen. Um die Original-PNGs direkt zu
verwenden, lege sie unter `assets/` ab (z.B. `assets/truhe-holz.png`). Dann gibt es
zwei Möglichkeiten:

- **Als Texturen:** per `THREE.TextureLoader` laden und in `TIERS` als `map` der
  Body-Materialien setzen (die Bilder sind perspektivische Renderings, als flache
  Textur wirken sie daher etwas anders als im Original)
- **Als 2.5D-Sprite:** das PNG als Billboard-Sprite anzeigen und nur mit Wackeln,
  Flash, Partikeln und Belohnung animieren — so machen es viele Mobile Games; der
  Deckel öffnet sich dann nicht als 3D-Objekt, der Burst kaschiert den Übergang

## Gibt es fertige Truhen-Animationen zum Download?

Die Original-Animationen aus Clash Royale & Co. sind urheberrechtlich geschützt und
nicht legal erhältlich. Was es stattdessen gibt:

- **3D-Modelle mit Öffnungs-Animation** (glTF/USDZ, teils animiert):
  [Sketchfab](https://sketchfab.com/search?q=treasure+chest&type=models) (Lizenzfilter auf CC stellen!),
  [CGTrader](https://www.cgtrader.com), [TurboSquid](https://www.turbosquid.com)
- **Kostenlose Game-Assets:** [Kenney.nl](https://kenney.nl) (CC0), [itch.io Assets](https://itch.io/game-assets)
- **Unity Asset Store:** viele fertige „Chest Opening"-Pakete inkl. Partikeln — aber nur
  sinnvoll, wenn das Spiel in Unity gebaut wird
- **2D-Alternativen:** [LottieFiles](https://lottiefiles.com/search?q=chest) und
  [Rive](https://rive.app/community) — Truhen-Animationen als leichtgewichtige
  Vektor-Animation, in iOS direkt per `lottie-ios`/`RiveRuntime` abspielbar

**Wichtig:** Bei allen Quellen die Lizenz prüfen (kommerzielle Nutzung, Namensnennung).

## Entwicklung

```bash
# Lokal ansehen: einfach index.html im Browser öffnen, oder:
python3 -m http.server 8000   # → http://localhost:8000
```

Debug-Hooks in der Browser-Konsole:

```js
__chest.setTier(0..3)  // Truhen-Stufe erzwingen (0=Holz … 3=Gold)
__chest.open()         // Öffnung ohne 3× Tippen starten
__chest.state()        // aktuellen Zustand abfragen
```
