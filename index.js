#!/usr/bin/env node
/**
 * gpFlea (GitHub Pages Flea)
 * 
 * gpFlea (GitHub Pages Flea) is a superdupertiny flea size zero config static site generator for GitHub Pages.
 */
const _ = require('lodash');
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
const mila = require("markdown-it-link-attributes");
const { minify } = require('html-minifier');
const open = require('open');
const path = require('path');
const ports = {
    livereloadServer: 3001
    , webServer: 3000
};
const postcss = require('postcss');
const pressAnyKey = require('press-any-key');
const sanitizeHtml = require('sanitize-html');
const sass = require('sass');
const { debounce } = require('throttle-debounce');

md.use(mila, { attrs: { target: '_blank', rel: 'noopener'}});

function ConcurrentCalls() {
    const queue = {};

    function add(func) {
        const queueKey = func.name;

        if (!(queueKey in queue)) { queue[queueKey] = []; }

        // every call after one call already waiting is just abandoned, because it is concurring to the waiting call.
        if (queue[queueKey].length < 2) { queue[queueKey].push(func); }

        // initial call or queue was empty.
        if (queue[queueKey].length === 1) { _next(queueKey); }
    }

    function _next(queueKey) {
        const result = queue[queueKey][0]();

        if (typeof result !== 'undefined' && result instanceof Promise) {
            result.then(() => _shift(queueKey));
        } else {
            _shift(queueKey);
        }
    }

    function _shift(queueKey) {
        queue[queueKey].shift();

        if (queue[queueKey].length > 0) { _next(queueKey); }
    }

    return { add };
}

const queue = new ConcurrentCalls();

const cwd = process.cwd();
const package = require(path.resolve(__dirname, './package.json'));

if (fs.existsSync(path.resolve(cwd, './src')) === false) {
    fs.copySync(path.resolve(__dirname, './skeleton'), path.resolve(cwd, './src'));
    fancyLog(c.green('Skeleton folder copied.'));
}

let assets = require(path.resolve(cwd, './src/assets.json'));

function readFile(filename) { return fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n'); }

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
    if (typeof title === 'string') {
        return title.toLowerCase().replace(/[^a-z0-9\-]+/g, '-').replace(/-{2,}/g, '-');
    }

    // @TODO add error handling here.
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
                    $link.href = blogEntries[parsed.base].url;
                }
            }
        });
    }

    return $body;
}

function iteratePages(pagesPartial, indexes, level, urlPrefixes, titles, pages, blogEntries, header, footer, callback) {
    const pagesPartialSortedKeys = Object.keys(pagesPartial).sort((a, b) => {
        if (a === 'index' || a < b) { return - 1; }
        if (a > b) { return 1; }
        return 0;
    });

    pagesPartialSortedKeys.forEach((page, i) => {
        if (typeof pagesPartial[page] === 'object') {
            if (_.get(pagesPartial, [page, 'type'], 'folder') === 'folder') {
                const hasIndex = 'index' in pagesPartial[page]
                    && typeof pagesPartial[page].index === 'object'
                    && 'title' in pagesPartial[page].index
                ;

                if (!hasIndex) {
                    const title = `Index missing in /${urlPrefixes.concat(page).join('/')}`;

                    pagesPartial[page].index = {
                        $body: getDOMBody(`<h1>${
                            title
                        }</h1><p>Please add a index.md or index.html file with at least one h1 headline.</p>`)
                        , title
                        , type: 'file'
                        , url: getURL(`index-missing-${page}`)
                    };
                }

                iteratePages(
                    pagesPartial[page]
                    , indexes.concat('pages', i - (level === 0 ? 0 : 1))
                    , level + 1
                    , urlPrefixes.concat(pagesPartial[page].index.url)
                    , titles.concat(pagesPartial[page].index.title)
                    , pages
                    , blogEntries
                    , header
                    , footer
                    , callback
                );
            } else {
                callback(
                    pagesPartial[page]
                    , (
                        page === 'index'
                            ? indexes
                            : indexes.concat('pages', i - (indexes.length === 0 ? 0 : 1))
                    ).slice(1)
                    , urlPrefixes
                    , titles
                    , pages
                    , blogEntries
                    , header
                    , footer
                );
            }
        }
    });
}

function writePages(pagesPartial, urlPrefixes, titles, pages, blogEntries, header, footer, navigation) {
    iteratePages(pagesPartial, [], 0, urlPrefixes, titles, pages, blogEntries, header, footer, (
        page
        , indexes
        , urlPrefixes2
        , titles2
        , pages2
        , blogEntries2
        , header2
        , footer2
    ) => {
        const tplVars = {
            navigation
            , titles: titles2.concat(
                titles2[titles2.length - 1] !== page.title
                    ? page.title
                    : []
            )
        };
        writeFile(path.resolve(cwd, `./docs/${
            urlPrefixes2.concat(
                urlPrefixes2[urlPrefixes2.length - 1] !== page.url
                    ? page.url
                    : []
            ).join('-')
        }.html`), header2, footer2, tplVars, findLinks(page.$body, pages2, blogEntries2).innerHTML);
    });
}

function getPagesNavigation(pages, urlPrefixes, titles, pages, blogEntries, header, footer) {
    const navigation = [];

    iteratePages(pages, [], 0, urlPrefixes, titles, pages, blogEntries, header, footer, (
        page
        , indexes
        , urlPrefixes2
        , titles2
    ) => {
        const titles3 = titles2.concat(
            titles2[titles2.length - 1] !== page.title
                ? page.title
                : []
        );
        const urlPrefixes3 = urlPrefixes2.concat(
            urlPrefixes2[urlPrefixes2.length - 1] !== page.url
                ? page.url
                : []
        );

        _.set(
            navigation
            , indexes
            , {
                titles: titles3
                , url: `/${urlPrefixes3.join('-')}.html`
            }
        );
    });

    return navigation;
}

function build() {
    fancyLog('Build started.');

    const docsTarget = path.resolve(cwd, './docs');
    fs.emptyDirSync(docsTarget);
    fancyLog(c.green(`${docsTarget} folder emtpied.`));

    glob.sync('./src/handlebars/helpers/**/*.js', { cwd }).forEach(filename => {
        require(path.resolve(cwd, filename))(handlebars);
    });
    glob.sync('./src/handlebars/partials/**/*.hbs', { cwd }).forEach(filename => {
        handlebars.registerPartial(path.parse(filename).name, readFile(path.resolve(cwd, filename)));
    });
    fancyLog(c.green('Handlebars set up.'));
    
    assets = require(path.resolve(cwd, './src/assets.json'));

    const pages = {};
    const blogEntries = {};

    glob.sync('./src/pages/**/*.@(html|md)', { cwd }).forEach(filename => {
        const parsed = path.parse(filename);
        const objPath = parsed.dir.split(/\//g).slice(3);
        const content = readFile(filename);
        const $body = getDOMBody(parsed.ext === '.md' ? getSanitizedHTML(content) : content);
        const title = getTitle($body);
        const pageValues = {
            $body: BEMify($body)
            , title
            , type: 'file'
            , url: getURL(title)
        };

        if (title !== null) {
            if (objPath.length === 0) {
                pages[parsed.name] = pageValues;
            } else {
                _.set(pages, objPath, {
                    ..._.get(pages, objPath, {})
                    , type: 'folder'
                    , [parsed.name]: pageValues
                });
            }
        }
    });

    glob.sync('./src/blog/**/*.@(html|md)', { cwd }).forEach(filename => {
        const parsed = path.parse(filename);
        const content = readFile(filename);
        const $body = getDOMBody(parsed.ext === '.md' ? getSanitizedHTML(content) : content);
        const title = getTitle($body);
        const datetime = getDatetime($body);
        const anchor = getURL(`${datetime}-${title}`);

        if (datetime !== null) {
            blogEntries[parsed.base] = {
                $body: BEMify($body)
                , anchor
                , datetime: new Date(datetime)
                , title
                , url: `/index.html#${anchor}`
            };
        }
    });

    const blogEntriesValues = Object.values(blogEntries);

    if (Object.keys(pages).length > 0 || blogEntriesValues.length > 0) {
        const assetsSource = path.resolve(cwd, './src/assets');
        const assetsTarget = path.resolve(cwd, './docs/assets');
        fs.copySync(assetsSource, assetsTarget);
        fancyLog(c.green(`${assetsSource} copied to ${assetsTarget}.`));

        Object.keys(assets).forEach(source => {
            const target = path.resolve(cwd, './docs/assets', assets[source]);
            source = path.resolve(cwd, source);

            fs.copySync(source, target);
            fancyLog(c.green(`${source} copied to ${target}.`));
        });

        fs.ensureDirSync(path.resolve(cwd, './docs/assets/css'));

        const { css } = sass.compile(path.resolve(cwd, './src/scss/styles.scss'), {
            loadPaths: [path.resolve(cwd, './node_modules'), path.resolve(cwd, './src/scss')]
            , style: 'compressed'
        });
        const sassTarget = path.resolve(cwd, './docs/assets/css/styles.css');
        fs.writeFileSync(
            sassTarget
            , postcss([autoprefixer]).process(css).css
            , 'utf8'
        );
        fancyLog(c.green(`${sassTarget} written.`));

        const header = handlebars.compile(readFile(path.resolve(cwd, './src/global/header.hbs')));
        const footer = handlebars.compile(readFile(path.resolve(cwd, './src/global/footer.hbs')));

        const blogEntriesValuesSort = blogEntriesValues.sort((a, b) => b.datetime - a.datetime);
        const navigation = {
            blog: blogEntriesValuesSort.map(blogEntry => ({
                title: blogEntry.title
                , url: blogEntry.url
            }))
            , pages: getPagesNavigation(pages, [], [], pages, blogEntries, header, footer)
        };

        const blogIndex = handlebars.compile(readFile(path.resolve(cwd, './src/pages/index.hbs')));
        const tplVars = { navigation, titles: [`Blog (${blogEntriesValues.length} entries)`] };
        writeFile(
            path.resolve(cwd, './docs/index.html')
            , header
            , footer
            , tplVars
            , blogIndex({
                ...tplVars
                , entries: blogEntriesValuesSort.map(blogEntry => ({
                    ...blogEntry
                    , html: `<a name="${
                        blogEntry.anchor
                    }"></a>${
                        findLinks(blogEntry.$body, pages, blogEntries).innerHTML
                    }`
                }))
            })
        );

        writePages(pages, [], [], pages, blogEntries, header, footer, navigation);
    }

    fancyLog(c.green('Build finished.'));
}

queue.add(build);

const app = express();
app.use('/', express.static(path.resolve(cwd, './docs')));
app.get('/', (_, res) => { res.sendFile(path.resolve(path.resolve(cwd, './index.html'))); });
app.listen(ports.webServer, () => {
    livereload.createServer({ port: ports.livereloadServer }).watch(path.resolve(cwd, './docs'));

    // when folders become unlinked the watcher can fire very quickly.
    // this is why the calls to build() are debounced here by 1 second.
    const buildDebounced = debounce(1000, () => queue.add(build));
    const watcher = chokidar.watch([path.resolve(cwd, './src')].concat(Object.keys(assets))).on(
        'all',
        (event, path2) => {
            if (['change', 'unlink', 'unlinkDir'].indexOf(event) !== -1) {
                fancyLog(`${c.magenta(event)} event on ${c.magenta(path2)}`);

                if (event === 'change' && path2 === path.resolve(cwd, './src/assets.json')) {
                    watcher.unwatch(Object.keys(assets)).then(() => {
                        buildDebounced();
                        watcher.add(Object.keys(assets));
                    });
                } else {
                    buildDebounced();
                }
            }
        }
    );

    const url = `http://localhost:${ports.webServer}`;

    fancyLog(`Open ${c.magenta(url)} in your browser to browse your static pages.`);

    pressAnyKey(c.red('Or press any key to open it automatically.\n')).then(() => {
        open(url);
    });
});
