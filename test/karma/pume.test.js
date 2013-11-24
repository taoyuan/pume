var t = assert;

describe('Pume', function () {

    var pume;

    beforeEach(function () {
        pume = new Pume({port: 4000});
    });

    afterEach(function () {
        pume.close();
    });


    it('should initiate pume', function (done) {
        t.ok(pume);
        pume.on('connected', done);
    });

    it('should subscribe', function (done) {
        var data = {boo: 'foo'};
        var channel = pume.subscribe('tom');
        channel.on('data', function (message) {
            t.deepEqual(data, message);
            done();
        });
        pume.publish('tom', 'data', data);

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
        pume.publish('tom', 'data', data);
    });
});