var mqtt = require('mqtt');
var utils = require('../utils');

exports.initialize = function (pume) {
    var settings = utils.extend({
        port: 1883,
        host: 'localhost'
    }, pume.settings);

    var client;
    if (settings.useSSL) {
        client = mqtt.createSecureClient(settings.port, settings.host, settings.options);
    } else {
        client = mqtt.createClient(settings.port, settings.host, settings.options);
    }
    client.on('error', pume.emit.bind(pume, 'error'));
    client.on('connect', function () {
        pume._connected();
    });
    client.on('close', function () {
        pume._disconnected();
    });
    client.on('message', function (cname, message, packet) {
        pume._message(cname, message);
    });

    pume.client = client;
    pume.adapter = new Mqtt(client);
};

function Mqtt(client) {
    this.client = client;
}

Mqtt.prototype.subscribe = function (cname, options, callback) {
    return this.client.subscribe(cname, options, callback);
};

Mqtt.prototype.unsubscribe = function (cname, options, cb) {
    return this.client.unsubscribe(cname, cb);
};

Mqtt.prototype.publish = function (cname, message) {
    this.client.publish(cname, message);
};

Mqtt.prototype.close = function () {
    return this.client.end();
};