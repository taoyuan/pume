var EventEmitter = require('events').EventEmitter;
var Channels = require('./channels').Channels;
var utils = require('./utils');
var util = require('util');

module.exports = Pume;

function Pume(name, settings) {
    var pume = this;
    // just save everything we get
    this.name = name;
    this.settings = settings || {};

    // and initialize pume using adapter
    // this is only one initialization entry point of adapter
    // this module should define `adapter` member of `this` (pume)
    var adapter;
    if (typeof name === 'object') {
        adapter = name;
        this.name = adapter.name;
    } else if (name.match(/^\//)) {
        // try absolute path
        adapter = require(name);
    } else {
        // try built-in adapter
        try {
            adapter = require('./adapters/' + name);
        } catch (e) {
            // try foreign adapter
            try {
                adapter = require('pume-' + name);
            } catch (e) {
                return console.log('\nWARNING: Pume adapter "' + name + '" is not installed,\nso your models would not work, to fix run:\n\n    npm install pume-' + name, '\n');
            }
        }
    }

    adapter.initialize(pume);

    // we have an adapter now?
    if (!pume.adapter) {
        throw new Error('Adapter is not defined correctly: it should create `adapter` member of pume');
    }

    pume.channels = new Channels(pume.adapter);

    return this;
}

util.inherits(Pume, EventEmitter);

Pume.prototype._connected = function () {
    this.connected = true;
    this.subscribeAll();
    this.emit('connected');
};

Pume.prototype._disconnected = function () {
    this.connected = false;
    this.emit('disconnected');
};

Pume.prototype._message = function (cname, message) {
    var c = this.channel(cname);
    if (c) c.__handleMessage(message);
};

Pume.prototype.close = function () {
    this.adapter.close();
};

Pume.prototype.channel = function (cname) {
    return this.channels.channel(cname);
};

Pume.prototype.subscribeAll = function() {
    for (var cname in this.channels._channels) {
        if (this.channels._channels.hasOwnProperty(cname)) {
            this.channels._channels[cname].subscribe();
        }
    }
};

Pume.prototype.subscribe = function (cname, options, cb) {
    var channel = this.channels.add(cname, options);
    if (channel.connected) {
        channel.subscribe(cb);
    } else if (cb) {
        channel.__callback__ = cb;
    }
    return channel;
};

Pume.prototype.unsubscribe = function (cname, cb) {
    cb = cb || utils.nop;
    var channel = this.channels.remove(cname, cb);
    if (channel.connected) {
        channel.unsubscribe(cb);
    } else {
        cb();
    }
    return this;
};

Pume.prototype.publish = function (cname, event, data) {
    var self = this;
    if (!self.connected) {
        console.warn('publish delayed.');
        self.once('connected', function () {
            self._publish(cname, event, data);
        });
    } else {
        self._publish(cname, event, data);
    }

    return this;
};

Pume.prototype._publish = function (cname, event, data) {
    var message = JSON.stringify({__event__: event, __data__: data});
    this.adapter.publish(cname, message);
};