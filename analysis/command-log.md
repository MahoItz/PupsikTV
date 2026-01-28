# Command log

Commands run while investigating FPS slowdown:

- `ls`
- `find .. -name AGENTS.md -print`
- `ls script`
- `sed -n '1,200p' script/core.js`
- `rg -n "setInterval|requestAnimationFrame|scroll|animation|fps" script style index.html`
- `sed -n '4500,5060p' script/media-fortune.js`
- `sed -n '930,1030p' script/media-fortune.js`
- `sed -n '1,120p' script/users.js`
- `sed -n '1,200p' script/copy-scheduled.js`
- `sed -n '1,140p' style/layout.css`
- `sed -n '1,200p' index.html`
- `rg -n "isCanvasInView|IntersectionObserver" script/media-fortune.js`
- `sed -n '5080,5165p' script/media-fortune.js`
- `rg -n "rats-video|video" script`
- `sed -n '1,120p' script/media-fortune.js`
- `nl -ba index.html | sed -n '30,90p'`
- `nl -ba script/media-fortune.js | sed -n '1,80p'`
- `nl -ba script/media-fortune.js | sed -n '4560,4680p'`
- `nl -ba style/layout.css | sed -n '24,120p'`
