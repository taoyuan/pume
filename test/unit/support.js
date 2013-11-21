var chai = require('chai');
chai.Assertion.includeStack = true;
var t = chai.assert;
var Pume = require('../../');

exports.t = t;

t.plan = function (count, done) {
    var c = count;
    return {
        done: function () {
            if (--c === 0) done();
        }
    }
};

exports.getPume = function (settings) {
    return new Pume('mqtt', settings);
};