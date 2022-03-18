/**
 * gpFlea (GitHub Pages Flea)
 * 
 * gpFlea (GitHub Pages Flea) is a superdupertiny flea size zero config static site generator for GitHub Pages.
 */
 const _ = require('lodash');
 const assets = require('./src/assets.json');
 const autoprefixer = require('autoprefixer');
 const c = require('ansi-colors');
 const chokidar = require('chokidar');
 const express = require('express');
 const fancyLog = require('fancy-log');
 const fs = require('fs-extra');
 const glob = require('glob');
 const handlebars = require("handlebars");
 const hljs = require('highlight.js');
 const { JSDOM } = require('jsdom');
 const livereload = require('livereload');
 const md = require('markdown-it')({
     highlight: (code, language) => {
         if (typeof language !== 'undefined' && hljs.getLanguage(language) === true) {
           try {
             return `<pre><code>${hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`;
           } catch (err) {}
         }
     
         return `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`;
     }
     , html: true
 });
 const { minify } = require('html-minifier');
 const open = require('open');
 const package = require('./package.json');
 const path = require('path');
 const ports = {
     livereloadServer: 3001
     , webServer: 3000
 };
 const postcss = require('postcss');
 const pressAnyKey = require('press-any-key');
 const sanitizeHtml = require('sanitize-html');
 const sass = require('sass');
 
 function readFile(filename) {
     return fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
 }
 
 function getSanitizedHTML(markdown) {
     return md.render(sanitizeHtml(markdown, {
         allowedAttributes: { 'time': ['datetime'] }
         , allowedTags: ['time']
         , disallowedTagsMode: 'escape'
     }));
 }
 
 function getDOMBody(html) {
     return new JSDOM(
         `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /></head><body>${html}</body></html>`
     ).window.document.body;
 }
 
 function getTitle($body) {
     const $h1 = $body.querySelector('h1');
 
     if ($h1 !== null) { return $h1.innerHTML; }
 
     return null;
 }
 
 function getURL(title) {
     return title.toLowerCase().replace(/[^a-z0-9\-]+/g, '-').replace(/-{2,}/g, '-');
 }
 
 function getDatetime($body) {
     const $datetime = $body.querySelector('time[datetime]');
 
     if ($datetime !== null) { return $datetime.getAttribute('datetime'); }
 
     return null;
 }
 
 function BEMify($body) {
     const mapping = {
         a: 'link'
         , 'b, strong': 'bold'
         , blockquote: 'blockquote'
         , code: 'code'
         , 'h1, h2, h3, h4, h5, h6': $el => ['headline', `headline--level${$el.tagName.slice(1)}`]
         , hr: 'line'
         , 'i, em': 'italic'
         , img: 'image'
         , li: ['list__item']
         , ol: ['list', 'list--ordered']
         , p: 'paragraph'
         , pre: 'preformatted'
         , ul: ['list', 'list--unordered']
     };
 
     Object.keys(mapping).forEach(selector => {
         const $els = $body.querySelectorAll(selector);
 
         if ($els !== null) {
             Array.from($els).forEach($el => {
                 let classes = mapping[selector];
                 if (typeof classes === 'function') { classes = classes($el); }
                 if (!Array.isArray(classes)) { classes = [classes]; }
 
                 $el.classList.add.apply($el.classList, classes);
             });
         }
     });
 
     return $body;
 }
 
 function getLivereloadHTML() {
     return `<script type="text/javascript">
         location.hostname==='localhost'&&document.write('<script src="http://localhost:${
             ports.livereloadServer
         }/livereload.js?snipver=1"></' + 'script>');
     </script>`.replace(/\r?\n\s+/g, '');
 }
 
 function addGenerator() {
     return `<meta name="generator" content="gpFlea (GitHub Pages Flea) ${package.version}" />`;
 }
 
 function writeFile(filename, header, footer, tplVars, content) {
     fs.writeFileSync(
         filename
         , minify(
             header(tplVars) + content + footer(tplVars)
             , {
                 collapseWhitespace: true
                 , minifyCSS: true
                 , minifyJS: true
                 , removeComments: true
             }
         ).replace(/(<\/head>)/i, `${getLivereloadHTML()}${addGenerator()}$1`)
         , 'utf8'
     );
     fancyLog(c.green(`${filename} written.`));
 }
 
 function findLinks($body, pages, blogEntries) {
     const $links = $body.querySelectorAll('a[href^="/pages/"],a[href^="/blog/"]');
 
     if ($links !== null) {
         Array.from($links).forEach($link => {
             const parsed = path.parse($link.href);
 
             if ($link.href.slice(0, 7) === '/pages/') {
                 const objPath = parsed.dir.split(/\//g).slice(2);
 
                 $link.href = `${
                         Array.from({ length: objPath.length }).reduce((result, empty, i) => {
                         const url = _.get(pages, objPath.slice(0, i + 1).concat('index', 'url'), null);
 
                         if (url !== null) { return result.concat(url); }
 
                         return result;
                     }, []).join('-')
                 }.html`;
             }
 
             if ($link.href.slice(0, 6) === '/blog/') {
                 if (parsed.base in blogEntries) {
                     $link.href = `/index.html#${blogEntries[parsed.base].anchor}`;
                 }
             }
         });
     }
 
     return $body;
 }
 
 function writePages(pagesPartial, urlPrefixes, titles, pages, blogEntries, header, footer) {
     Object.keys(pagesPartial).forEach(page => {
         if (
             typeof pagesPartial[page] === 'object'
             && 'type' in pagesPartial[page]
         ) {
             if (pagesPartial[page].type === 'folder') {
                 if (
                     'index' in pagesPartial[page]
                     && typeof pagesPartial[page].index === 'object'
                     && 'title' in pagesPartial[page].index
                 ) {
                     writePages(
                         pagesPartial[page]
                         , urlPrefixes.concat(pagesPartial[page].index.url)
                         , titles.concat(pagesPartial[page].index.title)
                         , pages
                         , blogEntries
                         , header
                         , footer
                     );
                 } else {
                     writePages(
                         pagesPartial[page]
                         , urlPrefix
                         , titles
                         , pages
                         , blogEntries
                         , header
                         , footer
                     );
                 }
             } else {
                 const tplVars = {
                     titles: titles.concat(
                         titles[titles.length - 1] !== pagesPartial[page].title
                             ? pagesPartial[page].title
                             : []
                     )
                 };
                 writeFile(`./docs/${
                     urlPrefixes.concat(
                         urlPrefixes[urlPrefixes.length - 1] !== pagesPartial[page].url
                             ? pagesPartial[page].url
                             : []
                     ).join('-')
                 }.html`, header, footer, tplVars, findLinks(pagesPartial[page].$body, pages, blogEntries).innerHTML);
             }
         }
     });
 }
 
 function build() {
     fancyLog('Build started.');
 
     fs.emptyDirSync('./docs');
     fancyLog(c.green('/docs folder deleted.'));
 
     const pages = {};
     const blogEntries = {};
 
     glob.sync('./src/pages/**/*.@(html|md)').forEach(filename => {
         const parsed = path.parse(filename);
         const objPath = parsed.dir.split(/\//g).slice(3);
         const content = readFile(filename);
         const $body = getDOMBody(parsed.ext === '.md' ? getSanitizedHTML(content) : content);
         const title = getTitle($body);
 
         if (title !== null) {
             _.set(pages, objPath, {
                 ..._.get(pages, objPath, {})
                 , type: 'folder'
                 , [parsed.name]: {
                     $body: BEMify($body)
                     , title
                     , type: 'file'
                     , url: getURL(title)
                 }
             });
         }
     });
 
     glob.sync('./src/blog/**/*.@(html|md)').forEach(filename => {
         const parsed = path.parse(filename);
         const content = readFile(filename);
         const $body = getDOMBody(parsed.ext === '.md' ? getSanitizedHTML(content) : content);
         const title = getTitle($body);
         const datetime = getDatetime($body);
 
         if (datetime !== null) {
             blogEntries[parsed.base] = {
                 $body: BEMify($body)
                 , anchor: getURL(`${datetime}-${title}`)
                 , datetime: new Date(datetime)
             };
         }
     });
 
     const blogEntriesValues = Object.values(blogEntries);
 
     if (Object.keys(pages).length > 0 || blogEntriesValues.length > 0) {
         fs.copySync('./src/assets', './docs/assets');
         fancyLog(c.green('Assets folder copied.'));
 
         Object.keys(assets).forEach(source => {
             const target = assets[source];
 
             fs.copySync(source, target);
             fancyLog(c.green(`${source} copied.`));
         });
 
         fs.ensureDirSync('./docs/assets/css');
 
         const { css } = sass.compile('./src/scss/styles.scss', {
             loadPaths: ['./node_modules', './src/scss']
             , style: 'compressed'
         });
         fs.writeFileSync('./docs/assets/css/styles.css', postcss([autoprefixer]).process(css).css, 'utf8');
         fancyLog(c.green(`./docs/assets/css/styles.css written.`));
 
         const header = handlebars.compile(readFile('./src/global/header.hbs'));
         const footer = handlebars.compile(readFile('./src/global/footer.hbs'));
 
         const tplVars = { titles: [`Blog (${blogEntriesValues.length} entries)`] };
         writeFile(
             './docs/index.html'
             , header
             , footer
             , tplVars
             , blogEntriesValues.sort((a, b) => b.datetime - a.datetime).map(
                 blogEntry => `<a name="${
                     blogEntry.anchor
                 }"></a>${
                     findLinks(blogEntry.$body, pages, blogEntries).innerHTML
                 }`
             ).join('')
         );
 
         writePages(pages, [], [], pages, blogEntries, header, footer);
     }
 
     fancyLog(c.green('Build finished.'));
 }
 
 build();
 
 const app = express();
 app.use('/', express.static('./docs'));
 app.get('/', (_, res) => { res.sendFile(path.resolve('./index.html')); });
 app.listen(ports.webServer, () => {
     livereload.createServer({ port: ports.livereloadServer }).watch('./docs');
 
     chokidar.watch(['./src'].concat(Object.keys(assets))).on('all', (event, path) => {
         if (['change', 'unlink', 'unlinkDir'].indexOf(event) !== -1) {
             console.log(`${event} event on ${path}`);
 
             build();
         }
     });
 
     const url = `http://localhost:${ports.webServer}`;
 
     fancyLog(`Open ${c.magenta(url)} in your browser to browse your static pages.`);
 
     pressAnyKey(c.red('Or press any key to open it automatically.')).then(() => {
         open(url);
     });
 });
 