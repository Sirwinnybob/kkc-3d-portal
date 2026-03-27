const fs = require('fs');
let css = fs.readFileSync('public/css/viewer.css', 'utf8');

const badCatCSS = `#qp-views-container.show-textures #qp-categories-view {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 10px;
    overscroll-behavior: contain;
    transform: translateX(0);
    opacity: 1;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}`;

const goodCatCSS = `#qp-views-container.show-textures #qp-categories-view {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 10px;
    overscroll-behavior: contain;
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}`;

const badTexCSS = `#qp-views-container.show-textures #qp-textures-view {
    position: absolute;
    inset: 0;
    padding: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}`;

const goodTexCSS = `#qp-views-container.show-textures #qp-textures-view {
    position: absolute;
    inset: 0;
    padding: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
    transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
    will-change: transform;
}`;

css = css.replace(badCatCSS, goodCatCSS).replace(badTexCSS, goodTexCSS);
fs.writeFileSync('public/css/viewer.css', css);
