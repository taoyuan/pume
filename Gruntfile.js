module.exports = function (grunt) {
    // * Read command-line switches
    // - Read in --browsers CLI option; split it on commas into an array if it's a string, otherwise ignore it
    var browsers = typeof grunt.option('browsers') == 'string' ? grunt.option('browsers').split(',') : undefined;

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        testFiles: { //unit & e2e goes here
            karmaUnit: 'config/karma.conf.js'
        },
        karma: {
            unit: {
                options: {
                    configFile: '<%= testFiles.karmaUnit %>',
                    autoWatch: false,
                    singleRun: true,
                    browsers: browsers || ['Chrome']
                }
            }
        },
        browserify: {
            dist: {
                files: {
                    'browser/<%= pkg.name %>.js': ['3rd/mqttws31.js', 'browser.js']
                }
            }
        },
        uglify: {
            build: {
                src: 'browser/<%= pkg.name %>.js',
                dest: 'browser/<%= pkg.name %>.min.js'
            }
        }
    });

    // Load grunt-karma task plugin
    grunt.loadNpmTasks('grunt-karma');

    grunt.registerTask('test', ['karma:unit']);

    grunt.loadNpmTasks('grunt-browserify');
    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('build', ['browserify', 'uglify']);

    grunt.registerTask('default', ['build']);

};