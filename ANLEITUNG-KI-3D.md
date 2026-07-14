# Anleitung: Aus einem Bild ein 3D-Modell machen (KI, No-Code)

So bekommst du per Prompting genau die Truhe, die dir gefällt — ohne eine Zeile Code.
Das Projekt ist bereits so vorbereitet, dass dein fertiges Modell direkt eingebaut
werden kann (siehe Schritt 4).

## Schritt 0 (optional, aber empfohlen): Erst das BILD perfektionieren

Das Aussehen steuerst du am besten, solange es noch ein Bild ist — Bild-KIs lassen
sich viel feiner prompten als 3D-KIs. Nutze z.B. Midjourney, DALL-E (ChatGPT) oder
den Bing Image Creator und iteriere, bis der Stil exakt passt.

**Wichtig fürs spätere 3D:** Das Bild sollte so aussehen:

- Truhe **geschlossen**, mit klar sichtbarer Deckelfuge
- Leicht schräge Frontansicht (¾-Perspektive), nicht frontal platt
- **Neutraler, einfarbiger Hintergrund** (das Freistellen klappt dann automatisch)
- Keine abgeschnittenen Teile, ein einzelnes Objekt

**Prompt-Vorlage (anpassen und iterieren):**

> A stylized fantasy treasure chest for a mobile game, closed lid with a visible
> seam, ornate gold trim, [DEIN STIL: dark wood / ice crystal / royal purple...],
> three-quarter view, single object, centered, plain dark background, game asset,
> high detail, Clash Royale style

## Schritt 1: Bild → 3D

Empfehlung: **[Meshy.ai](https://www.meshy.ai)** — beste Texturqualität, Retexture
per Prompt, exportiert GLB **und USDZ** (praktisch für iOS später). Alternative:
**[Tripo3d.ai](https://www.tripo3d.ai)** — sehr schnell, spielefokussiert.
Beide: kostenloser Einstieg, kein Code nötig.

1. Konto anlegen → **„Image to 3D"** wählen
2. Dein Bild hochladen → generieren lassen (meist 4 Varianten)
3. Beste Variante wählen

## Schritt 2: Per Prompt verfeinern

- **Retexture** (Meshy): neuen Text-Prompt auf das fertige Modell anwenden
  („more golden ornaments", „darker wood", „glowing blue runes")
- Gefällt die *Form* nicht → zurück zu Schritt 0 und das Bild ändern;
  die Form kommt fast vollständig aus dem Bild
- Mehrere Varianten generieren und vergleichen kostet nur Credits, keine Zeit

## Schritt 3: Exportieren

- Format: **GLB** (fürs Web/die Demo) — bei Meshy zusätzlich **USDZ** mitnehmen
  (falls die App später nativ mit SceneKit/RealityKit arbeiten soll)
- Wenn es die Option gibt: **Low-Poly / Remesh** aktivieren, Ziel **unter 50.000
  Dreiecke** — sonst ruckelt es auf dem Handy

**Lizenz beachten:** Im Free-Tier sind die Modelle meist öffentlich und nur
eingeschränkt kommerziell nutzbar (z.B. CC-BY). Für eine veröffentlichte App den
Bezahlplan des Dienstes prüfen — dort bekommst du private Modelle mit vollen
kommerziellen Rechten.

## Schritt 4: Modell abgeben — den Rest übernimmt die Pipeline

Lege die Datei als **`assets/chest.glb`** ins Repository (GitHub → „Add file →
Upload files" auf dem Branch) — oder schicke einen Downloadlink in den Chat.

Die Demo ist vorbereitet:

- Liegt ein `assets/chest.glb` vor (oder ein eingebettetes Modell), wird es
  automatisch geladen; sonst läuft die eingebaute Truhe als Fallback weiter
- KI-Modelle bestehen aus **einem** Stück — die Pipeline **schneidet den Deckel
  automatisch an der Fugenhöhe ab** (`LID_SEAM` in `src/chest.js`, Standard: 55 %
  der Modellhöhe), damit die Öffnungs-Animation funktioniert
- Die Texturen deines Modells bleiben unangetastet; die vier Seltenheits-Stufen
  wechseln dann nur noch die Effektfarben (Kristall, Partikel, Banner)

Feintuning (Fugenhöhe, Größe, Licht) mache ich nach Abgabe des Modells.
