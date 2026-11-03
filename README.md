# Limit-Prognose

Erweiterung für OpenChamber (ab 2.6.0). Sie zeigt im Arbeitsstatus-Panel rechts, ob das 7-Tage-Limit eines Anbieters bei der aktuellen Nutzung bis zum Reset reicht.

## Was die Leiste zeigt

- **Volle Farbe:** schon verbraucht.
- **Helle Verlängerung:** was bis zum Reset noch dazukommt, wenn du im bisherigen Tempo weiterarbeitest.
- **Strich:** wie viel bei gleichmäßiger Nutzung bis jetzt dran wäre. Liegt die Füllung links davon, reicht das Limit.
- **Farbe:** Grün reicht (Prognose unter 85 %). Gelb wird knapp (85 bis 100 %). Rot reicht nicht, darunter steht, ab wann das Limit leer ist.

Das Tempo ist der Durchschnitt seit dem letzten Reset, Nächte und Pausen eingerechnet. Am ersten Tag nach einem Reset gibt es noch keine Prognose, die Leiste ist dann grau. Fährst du mit der Maus über ein Limit, erscheint ein Hinweis mit den genauen Zahlen. 🗘 im Kopf des Abschnitts lädt sofort neu.

## Installation

Voraussetzung ist OpenChamber 2.6.0 oder neuer, als Desktop-App oder im Browser. Die gebauten Dateien liegen im Repo, ein Bauschritt ist nicht nötig.

1. Das Repo in einen Ordner deiner Wahl klonen: `git clone https://github.com/langfeld/openchamber-limit-prognose.git`
2. In OpenChamber: Einstellungen → Erweiterungen. Unter „Ordner, ZIP oder URL“ den Pfad eintragen oder „Ordner durchsuchen“, dann „Hinzufügen“.
3. Bei „Limit-Prognose“ auf „Berechtigungen prüfen“ und dann „Erlauben und aktivieren“. Die Erweiterung braucht ihren lokalen Dienst.

Danach erscheint der Abschnitt „Limit-Prognose“ im Arbeitsstatus-Panel rechts.

## Einstellungen

Das Icon der Erweiterung in der rechten Leiste öffnet ihre Einstellungen. Jede Änderung gilt sofort.

- **Anbieter:** Anfangs dieselbe Auswahl wie im Abschnitt „Nutzung“. Sobald du hier etwas änderst, gilt die eigene Auswahl. „Auswahl aus ‚Nutzung‘ übernehmen“ stellt das zurück. Der Abschnitt zeigt nur Anbieter, die ein Wochenlimit melden.
- **Schriftgröße:** OpenChamber gibt die Einstellung „Schriftgröße der Benutzeroberfläche“ nicht an Erweiterungen weiter. Stell hier denselben Wert ein. Die Abstände passt der Abschnitt selbst an: Er errechnet sie aus der Breite des Panels, die mit der Einstellung „Abstände“ wächst.
- **Leistenhöhe:** 4 px entspricht der Leiste unter „Kontext“.
- **Neu laden alle:** 5 bis 60 Minuten. Nach einem Fehler und wenn eine Prognose beginnt, lädt der Abschnitt von selbst früher.

## Aufbau

| Teil | Aufgabe |
| --- | --- |
| `package.json` | Manifest für OpenChamber, Bau- und Testbefehle |
| `service/main.js` | Kleiner Dienst, den OpenChamber startet. Er liest Port und Auswahl aus `~/.config/openchamber/settings.json` und `preferences.json`, fragt die Nutzung bei OpenChamber selbst ab (`/api/quota/…`) und verwaltet die Einstellungen. |
| `service/forecast.js` | Die Rechnung |
| `service/settings.js` | Die Einstellungen und ihre erlaubten Werte |
| `src/` | Abschnitt (`status.js`) und Einstellungs-Panel (`panel.js`). `status/main.js` und `panel/main.js` werden daraus gebaut. |
| `daten/einstellungen.json` | Deine Einstellungen. Legt der Dienst an, gehört nicht ins Repo. |
| `daten/verlauf.jsonl` | Pro Limit und Stunde eine Zeile mit Verbrauch und Prognose. Daraus lässt sich später nachrechnen, wie gut die Prognose getroffen hat. Legt der Dienst an, gehört nicht ins Repo. |
| `test/` | Tests für Rechnung, Dienst, Einstellungen und Größen |
| `preview/` | Vorschau ohne OpenChamber, nur zum Entwickeln |

Zum Entwickeln einmal `npm install`. Nach einer Änderung an `src/`: `npm run build`. OpenChamber lädt Ordner-Erweiterungen danach von selbst neu. Tests: `npm test`.

## Grenzen

- Der Dienst nutzt OpenChamber-intern `/api/quota/…`, keine offizielle Schnittstelle für Erweiterungen. Ändert ein Update sie, zeigt der Abschnitt einen Fehler, bis die Erweiterung angepasst ist. Dasselbe gilt für die Maße des Panels (300 px breit), aus denen die Abstände errechnet werden.
- Im Kopf eines Abschnitts erlaubt OpenChamber Erweiterungen nur Text. Deshalb steht dort das Zeichen 🗘 statt des Icons aus „Nutzung“.
- Ist in OpenChamber ein Passwort für die Oberfläche gesetzt, verlangt OpenChamber eine Anmeldung, und der Dienst bekommt keine Werte.
- Jede Abfrage geht bis zum Anbieter durch. Der Dienst hält Antworten deshalb 5 Minuten vor und lädt auf 🗘 höchstens alle 30 Sekunden neu.
- Die Prognose rechnet linear: Verbrauch geteilt durch verstrichene Zeit. Eine ähnliche Prognose hat OpenChamber im August 2026 wegen schlechter Treffer nicht wieder aufgenommen (#2942). Der Verlauf in `daten/` soll zeigen, wie gut diese hier bei dir trifft.

## Entfernen

Einstellungen → Erweiterungen → Limit-Prognose → Entfernen. Der Ordner bleibt dabei liegen.

## Fremde Bestandteile

- `status/main.js` und `panel/main.js` enthalten gebündelt [@openchamber/sdk](https://www.npmjs.com/package/@openchamber/sdk), MIT-Lizenz, Copyright (c) 2025 Bohdan Triapitsyn.
- Das Neuladen-Icon stammt aus [Remix Icon](https://remixicon.com) (`refresh-line`), wie in OpenChamber.
- Die Anbieter-Logos sind Marken von Anthropic, OpenAI und OpenCode. Sie stehen hier nur zur Kennzeichnung, wie in OpenChamber, aus dem sie stammen (MIT-Lizenz, Copyright (c) 2025 Bohdan Triapitsyn), und von models.dev.
