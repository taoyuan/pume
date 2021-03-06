/**
 * http://git.eclipse.org/c/paho/org.eclipse.paho.mqtt.javascript.git/tree/src/mqttws31.js
 */

var utils = require('../utils');

exports.initialize = function (pume) {
    var settings = utils.extend({}, pume.settings);

    var port = Number(settings.port || 1883);
    var host = settings.host || '127.0.0.1';
    var clientId = settings.clientId || utils.makeId();
    delete settings.port;
    delete settings.host;
    delete settings.clientId;

    var client = pume.client = new Messaging.Client(host, port, clientId);

    client.onConnectionLost = function () {
        pume._disconnected();
    };
    client.onMessageArrived = function (message) {
        pume._message(message.destinationName, message.payloadString);
    };

    client.connect(utils.extend({onSuccess: function () {
        pume._connected();
    }}, settings));

    pume.adapter = new Paho(client);
};

function Paho(client) {
    this.client = client;
}

Paho.prototype.subscribe = function (cname, options, cb) {
    var opts = utils.extend({
        onSuccess: cb
    }, options);
    return this.client.subscribe(cname, opts);
};

Paho.prototype.unsubscribe = function (cname, options, cb) {
    var opts = utils.extend({
        onSuccess: cb
    }, options);
    return this.client.unsubscribe(cname, opts);
};

Paho.prototype.publish = function (cname, message) {
    var m = new Messaging.Message(message);
    m.destinationName = cname;
    return this.client.send(m);
};

Paho.prototype.close = function () {
    return this.client.disconnect();
};