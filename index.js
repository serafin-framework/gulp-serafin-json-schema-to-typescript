var jsonSchemaToTypescript = require('json-schema-to-typescript');
var path = require('path')
var _ = require('lodash')
var through = require('through2');
var gulp = require('gulp');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;

const PLUGIN_NAME = 'gulp-serafin-json-schema-to-typescript';

// plugin function
function gulpSchemaToTypescript(opt) {
    opt = opt || {};
    // we need reference to be activated for local path to work
    opt.declareExternallyReferenced = true;
    // change default banner comment
    opt.bannerComment = `/**
 * This file was automatically generated. DO NOT MODIFY.
 */
`

    // hold converted contents of all input json schemas
    var contents = [];

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
        var _this = this;
        var schema = JSON.parse(file.contents);
        var id = schema.id;
        var modelName = _.upperFirst(_.camelCase((id ? id : file.path).split("/").slice(-1).join(" ").replace(".json", "")));
        
        // create a schema that forces reference to all definitions to ensure they are generated
        // it will be nice if it's added as an option of json-schema-to-typescript library
        var fullSchema = {
            definitions: _.clone(schema.definitions || {}),
            allOf: [`#/definitions/${modelName}`, ...Object.keys(schema.definitions || {}).map(n => `#/definitions/${n}`)].map(p => { return { $ref: p } })
        }
        fullSchema.definitions[modelName] = schema;
        jsonSchemaToTypescript.compile(fullSchema, "_", opt).then(function (ts) {
            var newFile = file.clone({ contents: false });
            newFile.path = path.join(file.base, `${modelName}.ts`);
            newFile.contents = new Buffer(ts);
    
            callback(null, newFile);
        }).catch((err) => {
            callback(err);
        });
    }


    return through.obj(convertContents);
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