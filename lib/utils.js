var breaker = {};

var ArrayProto = Array.prototype;

var nativeForEach = ArrayProto.forEach;
var slice = ArrayProto.slice;

exports.nop = function (){};

var each = exports.each = exports.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
        obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
        for (var i = 0, length = obj.length; i < length; i++) {
            if (iterator.call(context, obj[i], i, obj) === breaker) return;
        }
    } else {
        var keys = obj.keys;
        for (var i = 0, length = keys.length; i < length; i++) {
            if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
        }
    }
};


exports.extend = function (obj) {
    each(slice.call(arguments, 1), function(source) {
        if (source) {
            for (var prop in source) {
                obj[prop] = source[prop];
            }
        }
    });
    return obj;
};

exports.parallel = function (tasks, callback) {
    var results = [], count = tasks.length;
    tasks.forEach(function(task, index) {
        task(function(err, data) {
            results[index] = data;
            if(err) {
                callback(err);
                callback = null;
            }
            if(--count === 0 && callback) {
                callback(null, results);
            }
        });
    });
};

exports.makeId = function () {
    var i, possible, text;
    text = "";
    possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (i = 0; i < 5; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return 'pume-' + text;
};