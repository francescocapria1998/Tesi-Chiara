FLIPBOOK TESI - CHIARA CAMBARERI
===================================

CONTENUTO
---------
index.html   -> pagina del flipbook
style.css    -> grafica avorio / bordeaux / oro
app.js       -> caricamento PDF, sfoglio, navigazione e fullscreen
tesi.pdf     -> PDF originale della tesi (copiato senza modificarlo)

Il viewer mostra 1 pagina su smartphone e 2 pagine su desktop.
Le pagine PDF vengono renderizzate progressivamente per evitare di
caricare in memoria tutte le 62 pagine contemporaneamente.

COME PUBBLICARLO GRATIS CON GITHUB PAGES
----------------------------------------
1. Crea un nuovo repository GitHub, ad esempio:
   chiara-tesi

2. Carica NELLA ROOT del repository questi quattro file:
   - index.html
   - style.css
   - app.js
   - tesi.pdf

3. Su GitHub apri:
   Settings -> Pages

4. In "Build and deployment" scegli:
   Source: Deploy from a branch
   Branch: main
   Folder: / (root)
   quindi Save.

5. Dopo qualche minuto il sito sarà disponibile a un indirizzo simile a:
   https://TUO-USERNAME.github.io/chiara-tesi/

GOOGLE SITES
------------
Metodo consigliato:
Inserisci -> Incorpora -> URL
e incolla l'indirizzo GitHub Pages.

Oppure usa "Codice incorporato" con:

<iframe
  src="https://TUO-USERNAME.github.io/chiara-tesi/"
  width="100%"
  height="760"
  style="border:0;"
  allow="fullscreen"
  allowfullscreen>
</iframe>

Su Google Sites allarga il riquadro incorporato quasi a tutta pagina.
Su mobile il flipbook passa automaticamente alla pagina singola.

TEST LOCALE
-----------
Per motivi di sicurezza del browser, non aprire index.html direttamente
con doppio click (file://), perché PDF.js potrebbe non poter leggere il PDF.

Se hai Python installato:
  python -m http.server 8000

poi apri:
  http://localhost:8000

NOTE
----
- Il PDF non viene convertito né alterato dal flipbook.
- Il pulsante "Scarica PDF" distribuisce lo stesso file tesi.pdf.
- Per funzionare sono richieste connessione Internet e HTTPS, perché
  PDF.js e StPageFlip vengono caricati da CDN pubbliche.
