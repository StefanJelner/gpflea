// see http://jsfiddle.net/mpetrovich/wMmHS/
(function(func) {
    if (typeof window === 'object') {
        func(window.Handlebars);
    } else {
        module.exports = func;
    }
})(function(Handlebars) {
    Handlebars.registerHelper('math', function(lvalue, operator, rvalue) {
        lvalue = parseFloat(lvalue);
        rvalue = parseFloat(rvalue);
        return {
            '+': lvalue + rvalue,
            '-': lvalue - rvalue,
            '*': lvalue * rvalue,
            '/': lvalue / rvalue,
            '%': lvalue % rvalue,
            '&': lvalue & rvalue,
            '|': lvalue | rvalue,
            '^': lvalue ^ rvalue,
            '~': ~ lvalue,
            '<<': lvalue << rvalue,
            '>>': lvalue >> rvalue,
            '>>>': lvalue >>> rvalue
        }[operator];
    });
});
