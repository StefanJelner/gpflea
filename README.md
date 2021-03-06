# ![gpFlea logo](assets/gpflea.png) gpFlea (GitHub Pages Flea)

gpFlea (GitHub Pages Flea) is a superdupertiny flea size zero config static site generator for GitHub Pages.

---

## Table of contents

- [Introduction](#introduction)
- [Features](#features)
- [Todos/Work In Progress](#todos)
- [Installation](#installation)
- [Skeleton/Project structure](#skeleton)
- [Howto/Step by step instructions](#howto)
  1. [Adding Assets](#adding-assets)
  2. [Page header and footer](#global-html)
  3. [Providing CSS and JavaScript](#css-javascript)
  4. [Editing pages](#editing-pages)
  5. [Editing blog entries](#editing-blog-entries)
  6. [Linking to pages or blog entries](#editing-linking)
  7. [Using hashtags](#using-hashtags)
  8. [Using emojis](#using-emojis)
  9. [Adding syntax highlighting](#syntax-highlighting)
  10. [Blog pagination or lazy loading](#blog-pagination-lazy-loading)
  11. [Handlebars partials and helpers](#handlebars-partials-helpers)
  12. [Advanced Sass Techniques (BEM)](#sass-bem)
- [Technologies](#technologies)
- [License](#license)

---

## <a name="introduction"></a> Introduction

The purpose of gpFlea is, to provide the ability to create a GitHub Pages page with a minimum of boilerplate, setup, learning, practice and technically speaking also configuration and code.

All the user needs to know is how to install a node module, create folders and files, write Markdown or HTML, add CSS styling and publish the result to GitHub.

Of course gpFlea can be used with any other hosting service. You can take the result in the `docs` folder and upload it anywhere you like (with FTP, SSH, SFTP, WebDAV or any other transfer method) or you can zip the folder content and send it somewhere.

---

## <a name="features"></a> Features

- Zero config - **really zero!**
- Everything is done by convention. (See [Convention over configuration](https://en.wikipedia.org/wiki/Convention_over_configuration).)
- Provides a blog on the homepage and unlimited nested pages.
- Pages and blog entries can be written in Markdown or - if more sophisticated things like custom CSS or JS are needed - also in HTML.
- The blog is paginated by 10 and numbered JSON files - each containing 10 entries - are provided for lazy loading.
- Blog entries can optionally contain a short version for the list and a long version for the details view.
- Finds hashtags and generates pages which show in which articles a hashtag is used.
- Finds emojis by unicode or GitHub notation and replaces them with images.
- Does syntax highlighting in code blocks.
- Generates a search index in JSON and provides an AJAX and Javacript based fuzzy search ([Levenshtein distance algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance)) with extended search patterns like `OR`, `AND` and `NOT`. A page or blog entry which becomes accessed by clicking on a search result has the search terms marked in it, so they can be highlighted by CSS.
- No login required.
- No backend needed.
- Everything is done on the file level.
- Creates a nice skeleton on the first run.
- Starts up an [express](https://github.com/expressjs/express) webserver.
- Watches on file changes, then reloads the page in the browser.
- Generates static pages with SEO friendly file names.
- Header, footer, navigation, pagination and blog entries, pages, hashtag pages and search results are generated from [Handlebars](https://handlebarsjs.com/) templates.
- All language specific data of gpFlea is in the [Handlebars](https://handlebarsjs.com/) templates.
- Uses [Sass](https://sass-lang.com/) for providing CSS. (In the [Sass](https://sass-lang.com/) file pure CSS can be used, if someone is not familiar with [Sass](https://sass-lang.com/).)
- HTML, CSS and JSON are prettified so they work better with git diffing and do not bloat the git history.
- CSS from [Sass](https://sass-lang.com/) compilation contains autoprefixing for the recent 2 browser generations.
- [BEM](http://getbem.com/introduction/) classes are automatically added to the HTML.
- Resolution of links in the final static pages is done automatically.
- [Handlebars](https://handlebarsjs.com/) partials and helpers can be added (`math` and operators helpers are already provided).

---

## <a name="todos"></a> Todos/Work In Progress

- Complete `README.md`.
- [JSDoc](https://jsdoc.app/) comments.
- Unit tests with [Jest](https://jestjs.io/).
- Examples with [Disqus](https://disqus.com/pricing/) integration (and similar services) into the blog.

---

## <a name="installation"></a> Installation

If you wanna use it globally then do the following:

```sh
npm install gpflea -g
cd my/github/pages/root/folder/
npx gpflea
```

This copies the skeleton into the folder, builds the initial static page and starts the webserver and watcher.

Alternatively, if you are working in a node project anyway, you can install gpflea as a local dependency:

```sh
cd my/github/pages/root/folder/
npm install gpflea --save
npx gpflea
```

---

## <a name="skeleton"></a> Skeleton/Project structure

On the first run, the skeleton becomes copied into the `./src` folder. The initial structure of the folder should look like this:

```
+ assets
  + js
    - scripts.js
    - search.js
+ blog
  - 2022-03-17-first-post.md
  - 2022-03-18-second-post.html
+ global
  - footer.hbs
  - header.hbs
+ handlebars
  + helpers
    - math.js
    - operators.js
  + partials
    - navigation.hbs
    - pagination.hbs
+ pages
  + 03-projects
    - index.md
  - 01-about.md
  - 02-contact.html
+ scss
  - styles.scss
- assets.json
- blog.hbs
- hashtag.hbs
- page.hbs
- search.hbs
- search-results.hbs
```

This is not a lot of biolerplate!

Be aware of the fact, that there is no styling at all. If you look at the initial data in the browser it is totally unstyled.

---

## <a name="howto"></a> Howto/Step by step instructions

---

## <a name="technologies"></a> Technologies

- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown to HTML conversion
- [jsdom](https://github.com/jsdom/jsdom) - HTML parsing and DOM manipulation
- [handlebars](https://github.com/handlebars-lang/handlebars.js/) - Templating
- [highlight.js](https://github.com/highlightjs/highlight.js/) - Syntax highlighting for code blocks
- [express](https://github.com/expressjs/express) - Serving webpages with a minimum of boilerplate
- [chokidar](https://github.com/paulmillr/chokidar) - Watching for changes in the file system
- [livereload](https://github.com/napcs/node-livereload) - Reloading the webpage after changes/rebulding
- [sass](https://github.com/sass/sass) - Modularizing and nesting CSS
- [didyoumean2](https://github.com/foray1010/didyoumean2) - Matching with [Levenshtein distance algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance)
- [prettier](https://github.com/prettier/prettier) - Prettifying HTML and CSS so it works better with git Diffing
- [node-emoji](https://github.com/omnidan/node-emoji) - Changing emojis in Unicode or GitHub notation to PNG images

---

## <a name="license"></a> License

This software is brought to you with :heart: **love** :heart: from Dortmund and offered and distributed under the ISC license. See `LICENSE.txt` and [Wikipedia](https://en.wikipedia.org/wiki/ISC_license) for more information.
