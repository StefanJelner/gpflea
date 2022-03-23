/*
{{#if (or
        (eq section1 "foo")
        (ne section2 "bar"))}}
.. content
{{/if}}

{{#if (or condA condB condC)}}
.. content
{{/if}}

see https://gist.github.com/servel333/21e1eedbd70db5a7cfff327526c72bc5
*/
(function(func) {
    if (typeof window === 'object') {
        func(window.Handlebars);
    } else {
        module.exports = func;
    }
})(function(Handlebars) {
    const reduceOp = function(args, reducer){
        args = Array.from(args);
        args.pop(); // => options
        const first = args.shift();

        return args.reduce(reducer, first);
    };

    Handlebars.registerHelper({
        eq  : function() { return reduceOp(arguments, function(a, b) { return a === b; }.bind(this)); }
        , ne  : function() { return reduceOp(arguments, function(a, b) { return a !== b; }.bind(this)); }
        , lt  : function() { return reduceOp(arguments, function(a, b) { return a  <  b; }.bind(this)); }
        , gt  : function() { return reduceOp(arguments, function(a, b) { return a  >  b; }.bind(this)); }
        , lte : function() { return reduceOp(arguments, function(a, b) { return a  <= b; }.bind(this)); }
        , gte : function() { return reduceOp(arguments, function(a, b) { return a  >= b; }.bind(this)); }
        , and : function() { return reduceOp(arguments, function(a, b) { return a  && b; }.bind(this)); }
        , or  : function() { return reduceOp(arguments, function(a, b) { return a  || b; }.bind(this)); }
    });
});
