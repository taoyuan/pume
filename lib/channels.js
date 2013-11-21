var EventEmitter = require('events').EventEmitter;
var utils = require('./utils');
var util = require('util');

exports.Channels = Channels;

/**
 * Channel
 * @param channels
 * @param name
 * @returns {Channel}
 * @constructor
 */
function Channel(channels, name, options) {
    if (!(this instanceof Channel)) {
        return new Channel(channels, name, options);
    }
    this.channels = channels;
    this.adapter = channels.adapter;
    this.name = name;
    this.options = options;

    return this;
}

util.inherits(Channel, require('events').EventEmitter);

Channel.prototype.bind = Channel.prototype.on;

Channel.prototype.subscribe = function (cb) {
    var self = this;
    cb = cb || this.__callback__;
    if (this.__callback__) delete this.__callback__;
    this.adapter.subscribe(this.name, this.options, function (err) {
        if (cb) cb.call(self, err, self);
    });
    return this;
};

/**
 * unsubscribe - unsubscribe from channel
 *
 * @param {Function} [cb] - callback fired on unsuback
 * @returns {Channel} this - for chaining
 * @example channel.unsubscribe('topic');
 * @example channel.unsubscribe('topic', console.log);
 */
Channel.prototype.unsubscribe = function (cb) {
    this.adapter.unsubscribe(this.name, {}, cb);
    return this;
};

Channel.prototype.publish = function (event, data) {
    var message = JSON.stringify({__event__: event, __data__: data});
    this.adapter.publish(this.name, message);
    return this;
};

Channel.prototype.__handleMessage = function (message) {
    message = JSON.parse(message);
    if (message.__event__ && message.__data__) {
        this.emit(message.__event__, message.__data__);
    }
};

/**
 * Channels
 *
 * @param adapter
 * @constructor
 */
function Channels(adapter) {
    this.adapter = adapter;
    this._channels = {};
}

Channels.prototype.add = function (cname, options) {
    var c = this._channels[cname];
    if (!c) {
        c = new Channel(this, cname, options);
        this._channels[cname] = c;
    }
    return c;
};

Channels.prototype.remove = function (cname) {
    var channel = this._channels[cname];
    delete this._channels[cname];
    return channel;
};

Channels.prototype.channel = function (cname) {
    return this._channels[cname];
};

Channels.prototype.unsubscribeAll = function (cb) {
    if (!this.channels) return cb();
    var invokers = [];
    utils.forEach(this.channels, function (channel) {
        invokers.push(channel.unsubscribe.bind(channel));
    });
    return utils.parallel(invokers, cb);
};