var s = require('./support');
var t = s.t;


describe('Pume', function () {

    var pume;

    beforeEach(function () {
        pume = s.getPume();
    });

    afterEach(function () {
        pume.close();
    });


    it('should initiate pume', function () {
        t.ok(pume);
        t.ok(pume.adapter);
    });

    it('should subscribe', function (done) {
        var data = {boo: 'foo'};
        var channel = pume.subscribe('tom');
        channel.on('data', function (message) {
            t.deepEqual(data, message);
            done();
        });
        pume.on('connected', function () {
            pume.publish('tom', 'data', data);
        });
    });

    it('should not received data when unsubscribe', function (done) {
        var data = {boo: 'foo'};
        var channel = pume.subscribe('tom');
        channel.on('data', function (message) {
            t.deepEqual(data, message);

            channel.unsubscribe(function () {
                pume.publish('tom', 'data', data);
                setTimeout(done, 200);
            });
        });
        pume.on('connected', function () {
            pume.publish('tom', 'data', data);
        });
    });

    it.only('should sub and pub with different pume', function (done) {
        var pume2 = s.getPume();
        var data = {boo: 'foo'};
        var channel = pume.subscribe('tom');
        channel.on('data', function (message) {
            t.deepEqual(data, message);
            done();
        });
        pume2.on('connected', function () {
            pume2.publish('tom', 'data', data);
        });
    });

});