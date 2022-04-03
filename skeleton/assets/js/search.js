function Search() {
    // --- public methods ---

    /**
     * Marks search terms from the query string in the text nodes of the body.
     */
    function mark() {
        var m = _getPartial('m');

        if (m !== null) {
            var parsedM = null;

            try { parsedM = JSON.parse(m); } catch(ex) {}

            if (parsedM !== null) {
                var $main = document.querySelector('.main');

                if ($main !== null) {
                    var regexp = new RegExp('(' + parsedM.join('|') + ')', 'gi');
                    var textNodes = [];
                    var treeWalker = document.createTreeWalker(
                        $main
                        , NodeFilter.SHOW_TEXT
                        , { acceptNode: function() { return NodeFilter.FILTER_ACCEPT; } }
                        , false
                    );
                
                    while (treeWalker.nextNode()) { textNodes.push(treeWalker.currentNode); }

                    textNodes.forEach(function(textNode) {
                        // create an empty div element
                        var $tmp = document.createElement('div');
                
                        // try to replace the terms in the pure text node with HTML and and put the resulting HTML into
                        // the empty div
                        $tmp.innerHTML = textNode.wholeText.replace(regexp, '<span class="search-mark">$1</span>');
                
                        // if the div element contains more then one node, at least one term was found
                        if (Array.from($tmp.childNodes).some(function(child) { return child instanceof Element; })) {
                            // replace the node with the new nodes
                            textNode.replaceWith(document.createRange().createContextualFragment($tmp.innerHTML));
                        }
                    });
                }
            }
        }
    }

    /**
     * Searches for given terms in the q query string in the index JSON with extended patterns like OR, AND and NOT.
     * It also is capable of fuzzy and lteral search in quotes.
     * 
     * @param {Function} tpl precompiled handlebars template
     * @param {Element} $search DOM element which should contain the generated template results
     */
    function search(tpl, $search) {
        new Promise(function(resolve) {
            // get literal query string
            var q = _getPartial('q');

            if (q !== null) {
                _setSearchInputs(q);

                // load search index with AJAX
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '/search.json');

                xhr.onreadystatechange = function() {
                    // DONE
                    if (xhr.readyState === 4) {
                        // OK
                        if (xhr.status === 200) {
                            // parse search index
                            var index = null;

                            try { index = JSON.parse(xhr.responseText); } catch(ex) {}

                            if (index !== null) {
                                // parse query string
                                // test with:
                                // foo "bar" +baz +"qux" -waldo -"thud" + corge" - +"grault -"xyzzy +1234 -1234
                                var parsedQ = _parseQ(q);

                                // get result for all terms
                                var results = _getResults(parsedQ, index);

                                resolve({ results: results, q: q });
                            } else { resolve({ results: [], q: q }); }
                        } else { resolve({ results: [], q: q }); }
                    }
                };

                xhr.send(null);
            } else { resolve({ results: [], q: q }); }
        }).then(function(results) {
            // show results with precompiled Handlebars template
            $search.innerHTML = tpl(results);
        });
    }

    // --- private methods ---

    /**
     * Gets a partial from the query string by a given key.
     * 
     * @param {string} key the key of the query string partial
     * @returns the partial from the query string
     */
    function _getPartial(key) {
        if (typeof URLSearchParams !== 'undefined') {
            var value = new URLSearchParams(location.search.slice(1)).get(key);

            if (value !== null) { return value.trim().toLowerCase(); }
        }
        
        return null;
    }

    /**
     * Generates the m query string for marking text in the body text nodes of search result blog entries and pages.
     * 
     * @param {Array<string>} terms the terms to mark
     * @returns the m query string
     */
    function _getQueryString(terms) {
        return typeof URLSearchParams !== 'undefined'
            ? '?' + new URLSearchParams({ m: JSON.stringify(terms) }).toString()
            : ''
        ;
    }

    /**
     * Retrieves the search results from the parsed q query string and the index JSON.
     * 
     * @param {Record<'and' | 'not' | 'or', Array<{ fuzzy: boolean; term: string; }>>} parsedQ the parsed q query string
     * @param {{
     *     b: Array<{ anchor: string; datetime: string; subtitle: string; title: string; url: string; }>;
     *     c: number;
     *     p: Array<{ titles: Array<string>; url: string; }>;
     *     t: Record<string, { b: Record<number, number>; c: number; p: Record<number, number>; }>;
     * }} index the index JSON
     * @returns search results
     */
    function _getResults(parsedQ, index) {
        var terms = Object.keys(index.t);

        var hits = Object.keys(parsedQ).reduce(function(hits, key) {
            var tmp = {};

            // we store the original term in the shorthand ot, because the fuzzy search results might contain
            // a different term, because "bass" also fuzzy matches "bash".
            tmp[key] = parsedQ[key].reduce(function(hits2, data) {
                var hits3 = (
                    data.fuzzy === true
                        // the fuzzy matching lacks matching whether the term literally exists somewhere in
                        // the terms. this is why both methods get mixed up here and then the result array
                        // has to be uniqued.
                        ? didYouMean.default(data.term, terms, {
                            returnType: didYouMean.ReturnTypeEnums.ALL_CLOSEST_MATCHES
                        }).concat(
                            terms.filter(function(term) { return term.indexOf(data.term) !== -1; })
                        ).filter(function(term, i, arr) { return arr.indexOf(term) === i; })
                        : terms.filter(function(term) { return term.indexOf(data.term) !== -1; })
                ).map(function(term) { return Object.assign({}, index.t[term], { ot: data.term, t: term }); });

                return hits2.concat(hits3.length > 0 ? hits3 : { b: {}, c: 0, ot: data.term, p: {}, t: data.term });
            }, []);

            return Object.assign({}, hits, tmp);
        }, {});

        // AND is a quite hard thing, because if one AND condition is not met, the whole result is empty.
        // this is why we test for this here first to safe us time and energy.
        if (hits.and.some(function(hit) { return hit.c === 0; })) { return []; }

        var cummulated = ['and', 'not', 'or'].reduce(function(result, key) {
            var tmp = {};

            tmp[key] = ['b', 'p'].reduce(function(result2, key2) {
                var tmp2 = {};

                tmp2[key2] = hits[key].reduce(function(result3, values) {
                    return Object.assign({}, result3, Object.keys(values[key2]).reduce(function(result4, key3) {
                        var tmp3 = {};
                        var terms = {};
                        terms[values.t] = values[key2][key3];

                        tmp3[key3] = (
                            key3 in result3
                                ? Object.assign(
                                    {}
                                    , result3[key3]
                                    , {
                                        count: result3[key3].count + values[key2][key3]
                                        , originalTerms: result3[key3].originalTerms.concat(
                                            result3[key3].originalTerms.indexOf(values.ot) === -1 ? values.ot : []
                                        )
                                        , terms: Object.assign({}, result3[key3].terms, terms)
                                    }
                                )
                                : Object.assign(
                                    {}
                                    , index[key2][key3]
                                    , {
                                        count: values[key2][key3]
                                        , originalTerms: [values.ot]
                                        , terms: terms
                                    }
                                )
                        );

                        return Object.assign({}, result4, tmp3);
                    }, {}));
                }, {});

                return Object.assign({}, result2, tmp2);
            }, {});

            return Object.assign({}, result, tmp);
        }, {});

        var andQLength = parsedQ.and.map(function(value) { return value.term; }).length;
        var filtered = ['b', 'p'].reduce(function(result, key) {
            var tmp = {};
            var andKeys = Object.keys(cummulated.and[key]);
            var notKeys = Object.keys(cummulated.not[key]);

            tmp[key] = Object.keys(cummulated.or[key]).reduce(function(result2, key2) {
                if (
                    (
                        andKeys.length === 0
                        || (
                            andKeys.indexOf(key2) !== -1
                            && cummulated.and[key][key2].originalTerms.length === andQLength
                        )
                    )
                    && (notKeys.length === 0 || notKeys.indexOf(key2) === -1)
                ) {
                    var tmp2 = {};

                    tmp2[key2] = andKeys.length > 0 ? Object.assign(
                        {}
                        , cummulated.or[key][key2]
                        , {
                            count: cummulated.or[key][key2].count + cummulated.and[key][key2].count
                            , originalTerms: cummulated.or[key][key2].originalTerms.concat(
                                cummulated.and[key][key2].originalTerms
                            )
                            , terms: Object.assign(
                                {}
                                , cummulated.or[key][key2].terms
                                , cummulated.and[key][key2].terms
                            )
                        }
                    ) : cummulated.or[key][key2];

                    return Object.assign({}, result2, tmp2);
                }

                return result2;
            }, {});

            return Object.assign({}, result, tmp);
        }, {});

        var mixedSorted = ['b', 'p'].reduce(function(result, key) {
            return result.concat(Object.keys(filtered[key]).map(function(key2) {
                return Object.assign({}, filtered[key][key2], {
                    queryString: _getQueryString(Object.keys(filtered[key][key2].terms))
                    , type: key === 'b' ? 'blogEntry' : 'page'
                });
            }));
        }, []).sort(function(a, b) {
            if (b.count < a.count) { return -1; }
            if (b.count > a.count) { return 1; }
            if (a.type === 'blogEntry' && b.type === 'page') { return -1; }
            if (a.type === 'page' && b.type === 'blogEntry') { return 1; }
            return 0;
        });

        return mixedSorted;
    }

    /**
     * Parses the q query string into an object of logical OR, AND, NOT and determines whether the term should be
     * used for a fuzzy or literal search.
     * 
     * @param {string} q 
     * @returns the parsed q query string
     */
    function _parseQ(q) {
        var already = {};

        return q.split(/\s+/g).reduce(function(parsedQ, term) {
            var key = 'or';
            var fuzzy = true;
            var tmp = {};

            if (term.slice(0, 1) === '+') {
                key = 'and';
                term = term.slice(1);
            }
            else if (term.slice(0, 1) === '-') {
                key = 'not';
                term = term.slice(1);
            }

            if (term.slice(0, 1) === '"' && term.slice(-1) === '"') {
                fuzzy = false;
                term = term.slice(1, -1);
            }

            if (!(term in already) && /^[a-z]+$/.test(term)) {
                already[term] = true;

                tmp[key] = parsedQ[key].concat({ fuzzy: fuzzy, term: term });

                return Object.assign({}, parsedQ, tmp);
            }

            return parsedQ;
        }, { and: [], not: [], or: [] });
    }

    /**
     * Sets the search term on any search form input in the DOM.
     * 
     * @param {string} q the q query string 
     */
    function _setSearchInputs(q) {
        // set search forms in the rest of the DOM to the query string
        var $qs = document.querySelectorAll('.search-form__q');

        if ($qs !== null) { Array.from($qs).forEach(function($q) { $q.value = q; }); }
    }

    // return public methods
    return { mark: mark, search: search };
}

var searchInstance = new Search();

document.addEventListener('DOMContentLoaded', function() {
    if ('searchInstance' in window) {
        searchInstance.mark();
    }
});