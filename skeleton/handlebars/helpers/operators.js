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
module.exports = function(handlebars) {
    const reduceOp = function(args, reducer){
        args = Array.from(args);
        args.pop(); // => options
        const first = args.shift();

        return args.reduce(reducer, first);
    };

    handlebars.registerHelper({
        // IMPORTANT! THIS DOES NOT WORK WITH ARROW FUNCTIONS!
        eq  : function() { return reduceOp(arguments, (a, b) => a === b); }
        , ne  : function() { return reduceOp(arguments, (a, b) => a !== b); }
        , lt  : function() { return reduceOp(arguments, (a, b) => a  <  b); }
        , gt  : function() { return reduceOp(arguments, (a, b) => a  >  b); }
        , lte : function() { return reduceOp(arguments, (a, b) => a  <= b); }
        , gte : function() { return reduceOp(arguments, (a, b) => a  >= b); }
        , and : function() { return reduceOp(arguments, (a, b) => a  && b); }
        , or  : function() { return reduceOp(arguments, (a, b) => a  || b); }
    });
}
