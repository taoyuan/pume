var adapter = require('./lib/adapters/paho');
(function (global) {
    var Pume = require('./lib/pume');
    global.Pume = function (settings) {
        return new Pume(adapter, settings);
    }
})(window);