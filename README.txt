BASKETBALL STATS — MINIMAL MERGE

Starting points:
- All PC files retained unchanged except Dashboard.js: added one Analytics click handler.
- Laptop stats.html/stats.js retained unchanged except for the stats.html stylesheet link and one Back button handler added to stats.js.
- PC style.css kept byte-for-byte intact.
- Laptop style.css copied byte-for-byte to stats.css; no CSS rules combined.
- Original PC blank player.html retained.

Pages:
index.html = PC dashboard; game.html = PC shot tracker;
roster.html = PC roster; stats.html = laptop analytics (demo data).

To run: EXTRACT THE WHOLE ZIP, then open index.html in a browser.
All HTML/JS/CSS files must remain in the same folder.

Known limitations from original projects:
- Game History dashboard button is not yet implemented.
- Season tab in stats does not have switching code.
- Analytics uses hard-coded sample players/game labels rather than live game data.
- Players and shots are stored only in memory and reset on page refresh.
- The PC roster.js has an unused addplayerbutton variable referencing an older ID; the actual click listener uses the correct ID and works.

Back up both original ZIPs. This version is a separate copy; it does not overwrite either.
