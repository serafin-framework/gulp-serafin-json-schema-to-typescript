var jsonSchemaToTypescript = require('json-schema-to-typescript');
var path = require('path')
var _ = require('lodash')
var through = require('through2');
var gulp = require('gulp');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;

const PLUGIN_NAME = 'gulp-serafin-json-schema-to-typescript';

// plugin function
function gulpSchemaToTypescript(fileName, opt) {
    opt = opt || {};
    // externally referenced is desactivated because we combine results at the end 
    opt.declareExternallyReferenced = false;
    // remove default banner comment
    opt.bannerComment = ""

    // check if fileName was provided
    if (!fileName) {
        throw new Error(PLUGIN_NAME + ': fileName parameter is mandatory');
    }

    // hold converted contents of all input json schemas
    var contents = [];
    // a ref to the latest converted file
    var latestFile;

    function convertContents(file, encoding, callback) {
        // if file is null, nothing needs to be done
        if (file.isNull()) {
            return callback();
        }

        // we don't support stream
        if (file.isStream()) {
            return callback(new Error(PLUGIN_NAME + ': Streaming not supported'));
        }

        // convert the schema to typescript with json-schema-to-typescript
        latestFile = file
        var _this = this;
        var schema = JSON.parse(file.contents);
        var id = schema.id;
        var modelName = _.upperFirst(_.camelCase(id.split("/").slice(-1).join(" ").replace(".json", "")))
        jsonSchemaToTypescript.compile(schema, modelName, opt).then(function (ts) {
            contents.push(ts);
            callback();
        });
    }

    function combineContents(callback) {
        if (contents.length === 0) {
            callback();
            return;
        }

        var modelFile = latestFile.clone({ contents: false });
        modelFile.path = path.join(latestFile.base, fileName);
        contents.unshift(`/**
 * This file was automatically generated. DO NOT MODIFY.
 */
`)
        modelFile.contents = new Buffer(contents.join("\n"));
        this.push(modelFile);
        callback();
    }

    return through.obj(convertContents, combineContents);
}

/**
 * Provides the Gulp tasks watch-model and build-model
 * 
 * @param gulp Gulp object
 * @param sourcePath Path(s) of the files containing JSON-Schema models 
 * @param modelDirectory Model file directory
 * @param taskSuffix Optional task suffix allow to create multiple tasks for differents model files, in case of sub-projects
 */
function gulpTasksModel(gulp, sourcePath, modelDirectory, taskSuffix = null) {
    if (typeof taskSuffix == 'string') {
        taskSuffix = '-' + taskSuffix;
    } else {
        taskSuffix = '';
    }

    if (typeof sourcePath == 'String') {
        sourcePath = [sourcePath];
    }

    if (!typeof sourcePath == 'Array') {
        throw Error("Source directory: Array or String expected");
    }

    gulp.task('watch-model' + taskSuffix, function () {
        return gulp.watch(sourcePath, { usePolling: true, awaitWriteFinish: true, alwaysStat: true },
            function () {
                return gulp.start('build-model' + taskSuffix);
            });
    });

    gulp.task('build-model' + taskSuffix, function () {
        return gulp.src(sourcePath)
            .pipe(gulpSchemaToTypescript(modelDirectory + "/model.ts"))
            .pipe(gulp.dest(modelPath))
    });
}

module.exports = { gulpSchemaToTypescript, gulpTasksModel };