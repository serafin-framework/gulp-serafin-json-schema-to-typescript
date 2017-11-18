var schemaToTypescript = require('../');
var gulp = require('gulp');
var fs = require('fs');
var expect = require('chai').expect;
var assert = require('stream-assert');
var path = require('path');
var del = require('del');
var File = require('vinyl');

var testFilesPath = path.join(__dirname, "_test_files");

describe('SchemaToTypescript', function () {

    // prepare files and data
    before(function (done) {
        done();
    });

    // delete all temp files when we are done
    after(function (done) {
        del([
            path.join(testFilesPath, "/*"),
            testFilesPath
        ]).then(() => done());
    });

    describe('plugin', function () {
        it('should ignore null files', function (done) {
            var stream = schemaToTypescript();
            stream
                .pipe(assert.length(0))
                .pipe(assert.end(done));
            stream.write(new File());
            stream.end();
        });

        it('should emit error on streamed file', function (done) {
            gulp.src(path.join(__dirname, 'fixtures', '/*'), { buffer: false })
                .pipe(schemaToTypescript())
                .once('error', function (err) {
                    expect(err.message).to.equal('gulp-serafin-json-schema-to-typescript: Streaming not supported');
                    done();
                });
        });


        it('should convert one file', function (done) {
            gulp.src(path.join(__dirname, 'fixtures', '/user.json'))
                .pipe(schemaToTypescript())
                .pipe(assert.length(1))
                .pipe(assert.end(done));
        });


        it('should convert multiple files', function (done) {
            gulp.src(path.join(__dirname, 'fixtures', '/*'))
                .pipe(schemaToTypescript({
                    cwd: path.join(__dirname, 'fixtures')
                }))
                .pipe(assert.length(2))
                .pipe(assert.end(done));
        });


        it('should convert and write multiple files', function (done) {
            gulp.src(path.join(__dirname, 'fixtures', '/*'))
                .pipe(schemaToTypescript({
                    cwd: path.join(__dirname, 'fixtures')
                }))
                .pipe(assert.length(2))
                .pipe(gulp.dest(testFilesPath))
                .pipe(assert.end(done));
        });
    });
});