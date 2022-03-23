#!/usr/bin/env node
/**
 * gpFlea (GitHub Pages Flea)
 * 
 * gpFlea (GitHub Pages Flea) is a superdupertiny flea size zero config static site generator for GitHub Pages.
 */
const _ = require('lodash');
const autoprefixer = require('autoprefixer');
const blogEntriesPerPage = 10;
// it has to be an odd number, otherwise there is no middle
const blogPaginationWindow = 9;
const c = require('ansi-colors');
const chokidar = require('chokidar');
const express = require('express');
const fancyLog = require('fancy-log');
const fs = require('fs-extra');
const glob = require('glob');
const Handlebars = require('handlebars');
const hljs = require('highlight.js');
const { JSDOM } = require('jsdom');
const linkify = require('linkifyjs');
const linkifyHtml = require('linkify-html');
require('linkify-plugin-hashtag');
const livereload = require('livereload');
const md = require('markdown-it')({
    highlight: (code, language) => `<pre><code class="language-${language}">${md.utils.escapeHtml(code)}</code></pre>`
    , html: true
    // the default is false, but because we use another linkify system we have to make sure for future versions
    // that is explicitely false.
    , linkify: false
});
const mila = require("markdown-it-link-attributes");
const open = require('open');
const path = require('path');
const ports = { livereloadServer: 3001, webServer: 3000 };
const postcss = require('postcss');
const pressAnyKey = require('press-any-key');
const prettier = require('prettier');
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

    function reset() { Object.keys(queue).forEach(key => delete queue[key]); }

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

    return { add, reset };
}

const queue = new ConcurrentCalls();

// Even it is not recommended, but here we try to handle uncaught exceptions as smoothly as possible to prevent
// the whole process from crashing in an ugly way. 
process.on('uncaughtException', error => {
    fancyLog(c.red(error));
    queue.reset();
});

const cwd = process.cwd();
const package = require(path.resolve(__dirname, './package.json'));

if (fs.existsSync(path.resolve(cwd, './src')) === false) {
    // copying the skeleton folder into the src folder
    fs.copySync(path.resolve(__dirname, './skeleton'), path.resolve(cwd, './src'));
    fancyLog(c.green('Skeleton folder copied.'));

    // copying the files from the skeleton.json into the src folder
    const skeleton = require(path.resolve(__dirname, './skeleton.json'));
    Object.keys(skeleton).forEach(source => {
        const target = path.resolve(cwd, './src/assets', skeleton[source]);
        source = path.resolve(__dirname, source);

        fs.copySync(source, target);
        fancyLog(c.green(`${source} copied to ${target}.`));
    });
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

function getDOM(html) {
    return new JSDOM(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /></head><body>${html}</body></html>`);
}

function getTitle($body) {
    const $h1 = $body.querySelector('h1');

    if ($h1 !== null) { return $h1.innerHTML; }

    return null;
}

function getURL(title) { return title.toLowerCase().replace(/[^a-z0-9\-]+/g, '-').replace(/-{2,}/g, '-'); }

function getDatetime($body) {
    const $datetime = $body.querySelector('time[datetime]');

    if ($datetime !== null) { return { machine: $datetime.getAttribute('datetime'), human: $datetime.innerHTML }; }

    return null;
}

function highlight($body) {
    const $codes = $body.querySelectorAll('code[class^="language-"]');

    if ($codes !== null) { Array.from($codes).forEach($code => hljs.highlightElement($code)); }

    return $body;
}

function BEMify($body) {
    const mapping = {
        a: 'link'
        , 'a[href^="/hashtag-"]': 'link--hashtag'
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
        , prettier.format(
            (header(tplVars) + content + footer(tplVars)).replace(
                /(<\/head>)/i
                , `${getLivereloadHTML()}${addGenerator()}$1`
            )
            , {
                parser: 'html'
            }
        )
        , 'utf8'
    );
    fancyLog(c.green(`${filename} written.`));
}

function pageJoin(objPath) { return objPath.join('-'); }

function findLinks($body, pages, blogEntries) {
    const $links = $body.querySelectorAll('a[href^="/pages/"],a[href^="/blog/"]');

    if ($links !== null) {
        Array.from($links).forEach($link => {
            const parsed = path.parse($link.href);

            if ($link.href.slice(0, 7) === '/pages/') {
                const objPath = parsed.dir.split(/\//g).slice(2);

                $link.href = `${
                    pageJoin(Array.from({ length: objPath.length }).reduce((result, empty, i) => {
                        const url = _.get(pages, objPath.slice(0, i + 1).concat('index', 'url'), null);

                        if (url !== null) { return result.concat(url); }

                        return result;
                    }, []))
                }.html`;
            }

            if ($link.href.slice(0, 6) === '/blog/') {
                if (parsed.base in blogEntries) { $link.href = blogEntries[parsed.base].url; }
            }
        });
    }

    return $body;
}

function iteratePages(
    pagesPartial
    , indexes
    , level
    , objPath
    , urlPrefixes
    , titles
    , pages
    , blogEntries
    , header
    , footer
    , callback
) {
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
                        $body: getDOM(
                            `<h1>${
                                title
                            }</h1><p>Please add a index.md or index.html file with at least one h1 headline.</p>`
                        ).window.document.body
                        , title
                        , type: 'file'
                        , url: getURL(`index-missing-${page}`)
                    };
                }

                iteratePages(
                    pagesPartial[page]
                    , indexes.concat('pages', i - (level === 0 ? 0 : 1))
                    , level + 1
                    , objPath.concat(page)
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
                        page === 'index' ? indexes : indexes.concat('pages', i - (indexes.length === 0 ? 0 : 1))
                    ).slice(1)
                    , objPath.concat(page)
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

function writePages(pagesPartial, urlPrefixes, titles, pages, blogEntries, header, footer, pageIndex, navigation) {
    let i = 0;

    iteratePages(pagesPartial, [], 0, [], urlPrefixes, titles, pages, blogEntries, header, footer, (
        page
        , indexes
        , objPath
        , urlPrefixes2
        , titles2
        , pages2
        , blogEntries2
        , header2
        , footer2
    ) => {
        const tplVarsPage = {
            navigation
            , titles: titles2.concat(titles2[titles2.length - 1] !== page.title ? page.title : [])
            , type: 'page'
        };

        writeFile(
            path.resolve(cwd, `./docs/${
                pageJoin(urlPrefixes2.concat(urlPrefixes2[urlPrefixes2.length - 1] !== page.url ? page.url : []))
            }.html`)
            , header2
            , footer2
            , tplVarsPage
            , pageIndex({
                ..._.omit(tplVarsPage, ['type'])
                , html: findLinks(page.$body, pages2, blogEntries2).innerHTML
                , previousPage: i > 0 ? navigation.pages.flattened[i - 1] : false
                , nextPage: i < navigation.pages.flattened.length - 1 ? navigation.pages.flattened[i + 1] : false
            })
        );

        i++;
    });
}

function getPagesNavigation(pages, urlPrefixes, titles, pages, blogEntries, header, footer, search) {
    const nested = [];
    const flattened = [];

    iteratePages(pages, [], 0, [], urlPrefixes, titles, pages, blogEntries, header, footer, (
        page
        , indexes
        , objPath
        , urlPrefixes2
        , titles2
    ) => {
        const titles3 = titles2.concat(titles2[titles2.length - 1] !== page.title ? page.title : []);
        const urlPrefixes3 = urlPrefixes2.concat(urlPrefixes2[urlPrefixes2.length - 1] !== page.url ? page.url : []);
        const url = `/${pageJoin(urlPrefixes3)}.html`;

        _.set(nested, indexes, { titles: titles3 , url });
        flattened.push({ titles: titles3, url });

        const objPath2 = JSON.stringify(objPath);
        const i = search.p.indexOf(objPath2);
        if (i !== -1) { search.p[i] = { titles: titles3, url }; }
    });

    return { flattened, nested };
}

function getBlogIndex(prefix, i, anchor) {
    return `${prefix}${(i > 0 ? `blog-${i + 1}` : 'index')}.html${typeof anchor !== 'undefined' ? `#${anchor}` : ''}`;
}

function getHTML($body) {
    const $h1s = $body.querySelectorAll('h1');

    if ($h1s !== null && Array.from($h1s).length > 1) {
        // create a deep clone, so we leave the original element untouched
        const $clone = $body.cloneNode(true);
        const $h1 = Array.from($clone.querySelectorAll('h1'))[1];

        while ($h1.previousSibling !== null) { $h1.parentNode.removeChild($h1.previousSibling); }

        return $clone;
    }

    return $body;
}

function getShort($body) {
    const $h1s = $body.querySelectorAll('h1');

    if ($h1s !== null && Array.from($h1s).length > 1) {
        // create a deep clone, so we leave the original element untouched
        const $clone = $body.cloneNode(true);
        const $previous = Array.from($clone.querySelectorAll('h1'))[1].previousSibling;

        while ($previous.nextSibling !== null) { $previous.parentNode.removeChild($previous.nextSibling); }

        return $clone;
    }

    return $body;
}

function getHashtagURL(hashtag, i) {
    return `/hashtag-${getURL(hashtag)}${i > 0 ? `-${i}` : ''}.html`;
}

function transformHashtags(hashtags, objPath, html) {
    return linkifyHtml(html, {
        formatHref: {
            hashtag: (href, type) => {
                if (type === 'hashtag') { return getHashtagURL(href.slice(1), 0); }
              
                return href;
            }
        }
        , validate: {
            email: false
            , hashtag: href => {
                const hashtag = href.slice(1);
                const objPathFlattened = objPath.join('/');

                if (!(hashtag in hashtags)) {
                    hashtags[hashtag] = { count: 0, pagesEntries: {}, url: getHashtagURL(hashtag, 0) };
                }

                if (!(objPathFlattened in hashtags[hashtag].pagesEntries)) {
                    hashtags[hashtag].pagesEntries[objPathFlattened] = { count: 0, objPath };
                }

                hashtags[hashtag].count++;
                hashtags[hashtag].pagesEntries[objPathFlattened].count++;

                return true;
            }
            , mention: false
            , ticket: false
            , url: false
        }
    });
}

function getSearchTerms(search, dom, $body, objPath) {
    const treeWalker = dom.window.document.createTreeWalker(
        $body
        , dom.window.NodeFilter.SHOW_TEXT
        , { acceptNode: () => dom.window.NodeFilter.FILTER_ACCEPT }
        , false
    );

    while (treeWalker.nextNode()) {
        const trimmed = treeWalker.currentNode.wholeText.trim();

        if (trimmed !== '') {
            const ts = trimmed.toLowerCase().split(/\W+/g).filter(word => /^[a-z]{3,}$/.test(word));

            ts.forEach(t => {
                if (!(t in search.t)) { search.t[t] = { c: 0, b: {}, p: {} }; }
                const bp = objPath[0] === 'blogEntries' ? 'b' : 'p';
                const objPath2 = JSON.stringify(objPath.slice(1));
                let i = search[bp].indexOf(objPath2);

                if (i === -1) {
                    search[bp].push(objPath2);
                    i = search[bp].length - 1;
                }

                if (!(String(i) in search.t[t][bp])) { search.t[t][bp][i] = 0; }

                search.c++;
                search.t[t].c++;
                search.t[t][bp][i]++;
            });
        }
    }
}

Handlebars.registerHelper('getIndex', (type, i) => {
    if (type === 'blog') { return getBlogIndex('/', i); }
    if (type === 'hashtag') { return getHashtagURL(i); }

    return '/';
});

function build() {
    fancyLog('Build started.');

    const docsTarget = path.resolve(cwd, './docs');
    fs.emptyDirSync(docsTarget);
    fancyLog(c.green(`${docsTarget} folder emtpied.`));

    let handlebarsHelpers = '';
    glob.sync('./src/handlebars/helpers/**/*.js', { cwd }).forEach(filename => {
        const helperFilename = path.resolve(cwd, filename);

        require(helperFilename)(Handlebars);
        handlebarsHelpers += readFile(helperFilename);
    });
    glob.sync('./src/handlebars/partials/**/*.hbs', { cwd }).forEach(filename => {
        Handlebars.registerPartial(path.parse(filename).name, readFile(path.resolve(cwd, filename)));
    });
    fancyLog(c.green('Handlebars set up.'));
    
    assets = require(path.resolve(cwd, './src/assets.json'));

    const pages = {};
    const blogEntries = {};
    const hashtags = {};
    const search = { c: 0, b: [], p: [], t: {} };

    glob.sync('./src/pages/**/*.@(html|md)', { cwd }).forEach(filename => {
        const parsed = path.parse(filename);
        const objPath = parsed.dir.split(/\//g).slice(3);
        const extendedObjPath = ['pages'].concat(objPath, parsed.name);
        const content = readFile(filename);
        const dom = getDOM(
            transformHashtags(
                hashtags
                , extendedObjPath
                , parsed.ext === '.md' ? getSanitizedHTML(content) : content
            )
        );
        const $body = dom.window.document.body;
        const title = getTitle($body);
        const pageValues = { $body: BEMify(highlight($body)), title, type: 'file', url: getURL(title) };

        if (title !== null) {
            getSearchTerms(search, dom, $body, extendedObjPath);

            if (objPath.length === 0) {
                pages[parsed.name] = pageValues;
            } else {
                _.set(pages, objPath, { ..._.get(pages, objPath, {}), type: 'folder', [parsed.name]: pageValues });
            }
        }
    });

    glob.sync('./src/blog/**/*.@(html|md)', { cwd }).forEach((filename, i) => {
        const parsed = path.parse(filename);
        const content = readFile(filename);
        const extendedObjPath = ['blogEntries'].concat(parsed.base);
        const dom = getDOM(
            transformHashtags(
                hashtags
                , extendedObjPath
                , parsed.ext === '.md' ? getSanitizedHTML(content) : content
            )
        );
        const $body = dom.window.document.body;
        const title = getTitle($body);
        const datetime = getDatetime($body);
        const anchor = getURL(`${datetime.machine}-${title}`);

        if (datetime !== null) {
            getSearchTerms(search, dom, $body, extendedObjPath);

            blogEntries[parsed.base] = {
                $body: BEMify(highlight($body))
                , anchor
                , datetime: new Date(datetime.machine)
                , subtitle: datetime.human
                , title
                , url: `/${anchor}.html`
            };
        }
    });

    const blogEntriesValues = Object.values(blogEntries);

    if (Object.keys(pages).length > 0 || blogEntriesValues.length > 0 || Object.keys(hashtags).length > 0) {
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
            , style: 'expanded'
        });
        const sassTarget = path.resolve(cwd, './docs/assets/css/styles.css');
        fs.writeFileSync(
            sassTarget
            , prettier.format(postcss([autoprefixer]).process(css).css, { parser: 'css' })
            , 'utf8'
        );
        fancyLog(c.green(`${sassTarget} written.`));

        const header = Handlebars.compile(readFile(path.resolve(cwd, './src/global/header.hbs')));
        const footer = Handlebars.compile(readFile(path.resolve(cwd, './src/global/footer.hbs')));

        const blogEntriesValuesSort = blogEntriesValues.sort((a, b) => b.datetime - a.datetime).map(
            (blogEntry, i) => ({
                ..._.omit(blogEntry, ['$body'])
                , html: findLinks(getHTML(blogEntry.$body), pages, blogEntries).innerHTML
                , indexUrl: getBlogIndex('/', Math.floor(i / blogEntriesPerPage), blogEntry.anchor)
                , short: findLinks(getShort(blogEntry.$body), pages, blogEntries).innerHTML
            })
        );
        const hashtagsSorted = Object.keys(hashtags).sort((a, b) => {
            // first sort by overall count descending
            if (hashtags[b].count < hashtags[a].count) { return -1; }
            if (hashtags[b].count > hashtags[a].count) { return 1; }
            // then sort alphabetically ascending
            if (a < b) { return -1; }
            if (a > b) { return 1; }
            return 0;
        });
        const navigation = {
            blog: blogEntriesValuesSort.map(blogEntry => _.omit(blogEntry, ['$body', 'html', 'short']))
            , hashtags: hashtagsSorted.map(hashtag => ({ ..._.omit(hashtags[hashtag], ['pagesEntries']), hashtag }))
            , pages: getPagesNavigation(pages, [], [], pages, blogEntries, header, footer, search)
        };

        const blogIndex = Handlebars.compile(readFile(path.resolve(cwd, './src/blog.hbs')));
        const tplVarsBlog = {
            entriesPerPage: blogEntriesPerPage
            , navigation
            , totalEntries: blogEntriesValuesSort.length
            , totalPages: Math.ceil(blogEntriesValuesSort.length / blogEntriesPerPage)
            , type: 'blog'
        };
        blogEntriesValuesSort.forEach((blogEntry, i) => {
            const tplVarsBlogEntry = {
                ...tplVarsBlog
                , blogType: 'entry'
                , entry: blogEntry
                , nextEntry: i < tplVarsBlog.totalEntries ? blogEntriesValuesSort[i + 1] : false
                , previousEntry: i > 0 ? blogEntriesValuesSort[i - 1] : false
            };

            writeFile(
                path.resolve(cwd,  `./docs${blogEntry.url}`)
                , header
                , footer
                , tplVarsBlogEntry
                , blogIndex(tplVarsBlogEntry)
            );
        });

        const windowMiddle = Math.ceil(blogPaginationWindow / 2);
        for (let i = 0; i < tplVarsBlog.totalPages; i++) {
            const firstIndex = i * tplVarsBlog.entriesPerPage;
            const lastIndex = Math.min(firstIndex + tplVarsBlog.entriesPerPage, tplVarsBlog.totalEntries) - 1;
            const windowStart = Math.max(windowMiddle, Math.min(tplVarsBlog.totalPages - windowMiddle + 1, i + 1));
            const tplVarsBlogList = {
                ...tplVarsBlog
                , blogType: 'list'
                , currentPage: i
                , entries: blogEntriesValuesSort
                , firstIndex
                , lastIndex
                , window: Array.from({ length: blogPaginationWindow }).reduce((result, empty, j) => {
                    const k = windowStart - windowMiddle + j;

                    if (k < tplVarsBlog.totalPages) { return result.concat(k); }

                    return result;
                }, [])
            };

            writeFile(
                path.resolve(cwd, getBlogIndex('./docs/', i))
                , header
                , footer
                , tplVarsBlogList
                , blogIndex(tplVarsBlogList)
            );

            fs.writeFileSync(
                path.resolve(cwd, `./docs/blog-lazy-loading-${i + 1}.json`)
                , prettier.format(JSON.stringify({
                    currentPage: i + 1
                    , entriesPerPage: tplVarsBlog.entriesPerPage
                    , totalEntries: tplVarsBlog.totalEntries
                    , totalPages: tplVarsBlog.totalPages
                    , entriesPerPage: tplVarsBlog.entriesPerPage
                    , entries: blogEntriesValuesSort.slice(firstIndex, lastIndex + 1)
                }), { parser: 'json' })
                , 'utf8'
            );
        }

        const pageIndex = Handlebars.compile(readFile(path.resolve(cwd, './src/page.hbs')));
        writePages(pages, [], [], pages, blogEntries, header, footer, pageIndex, navigation);

        const searchIndex = Handlebars.compile(readFile(path.resolve(cwd, './src/search.hbs')));
        const precompiledSearchResults = Handlebars.precompile(readFile(path.resolve(cwd, './src/search-results.hbs')));

        const tplVarsSearch = { navigation, type: 'search' }
        writeFile(
            path.resolve(cwd, './docs/search.html')
            , header
            , footer
            , tplVarsSearch
            , searchIndex({
                ...tplVarsSearch
                , handlebarsHelpers
                , precompiledSearchResultsTemplate: precompiledSearchResults
            })
        );

        fs.writeFileSync(
            path.resolve(cwd, `./docs/search.json`)
            , prettier.format(JSON.stringify({
                ...search
                , b: search.b.map(objPath => _.omit(_.get(blogEntries, JSON.parse(objPath), {}), ['$body']))
            }), { parser: 'json' })
            , 'utf8'
        );
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
                } else { buildDebounced(); }
            }
        }
    );

    const url = `http://localhost:${ports.webServer}`;

    fancyLog(`Open ${c.magenta(url)} in your browser to browse your static pages.`);

    pressAnyKey(c.red('Or press any key to open it automatically.\n')).then(() => open(url));
});
