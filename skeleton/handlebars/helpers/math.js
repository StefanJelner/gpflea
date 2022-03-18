// see http://jsfiddle.net/mpetrovich/wMmHS/
module.exports = function(handlebars) {
    handlebars.registerHelper('math', (lvalue, operator, rvalue) => {
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
}
