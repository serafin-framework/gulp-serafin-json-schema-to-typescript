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
    var jsonSchemaToTypescriptOpt = opt.jsonSchemaToTypescriptOpt || {}
    // we need reference to be activated for local path to work
    jsonSchemaToTypescriptOpt.declareExternallyReferenced = true;
    // force empty banner comment for jsonSchemaToTypescript
    jsonSchemaToTypescriptOpt.bannerComment = "";
    // force unreachableDefinitions to true
    jsonSchemaToTypescriptOpt.unreachableDefinitions = true;
    // default value for generateModelSchema
    opt.generateModelSchema = opt.hasOwnProperty("generateModelSchema") ? opt.generateModelSchema : true
    // default value for modelSchemaPath
    opt.modelSchemaPath = opt.modelSchemaPath || "@serafin/api"
    // default value for modelSchemaClass
    opt.modelSchemaClass = opt.modelSchemaClass || "PipelineSchemaBuilderModel"
    // default banner comment
    opt.banner = opt.banner || `/**
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
        var modelName = _.upperFirst(_.camelCase((schema.title || file.path).split("/").slice(-1).join(" ").replace(".json", "")));
        if (!schema.definitions) {
            schema.definitions = {
                "createValues": toDefinitionSchema(schema, SCHEMA_FILTER_ALL, SCHEMA_FILTER_NO_ID),
                "updateValues": toDefinitionSchema(schema, SCHEMA_FILTER_ALL, SCHEMA_FILTER_NO_ID),
                "readQuery": toDefinitionSchema(schema, SCHEMA_FILTER_ALL, SCHEMA_FILTER_NONE, true),
                "patchQuery": toDefinitionSchema(schema, SCHEMA_FILTER_ALL, SCHEMA_FILTER_ONLY_ID, true),
                "patchValues": toDefinitionSchema(schema, SCHEMA_FILTER_NO_ID, SCHEMA_FILTER_NONE),
                "deleteQuery": toDefinitionSchema(schema, SCHEMA_FILTER_ONLY_ID, SCHEMA_FILTER_ONLY_ID, true)
            }
        }

        jsonSchemaToTypescript.compile(schema, "_", jsonSchemaToTypescriptOpt).then((ts) => {
            if (opt.generateModelSchema) {
                ts = `import { ${opt.modelSchemaClass} } from "${opt.modelSchemaPath}";\n\n${ts}`
            }
            // add a banner at the top
            ts = opt.banner + ts;
            // add model schema declaration at the end
            if (opt.generateModelSchema) {
                let genericTypesDeclaration = modelName + ["readQuery", "createValues", "updateValues", "patchQuery", "patchValues", "deleteQuery"].map(d => {
                    if (d in schema.definitions) {
                        return ", " + _.upperFirst(d)
                    } else {
                        return ", any"
                    }
                }).join("");
                ts = `${ts}\n\nexport var ${_.lowerFirst(modelName)}Schema = new ${opt.modelSchemaClass}<${genericTypesDeclaration}>(${JSON.stringify(schema)}, "${schema.$id ? schema.$id : modelName}");\n`
            }

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

const SCHEMA_FILTER_NONE = 0;
const SCHEMA_FILTER_ALL = 1;
const SCHEMA_FILTER_NO_ID = 2;
const SCHEMA_FILTER_ONLY_ID = 3;

function toDefinitionSchema(schemaObject, propertiesFilter, requiredFilter, toArray = false) {
    let schema = {
        type: 'object',
        properties: _.clone(schemaObject.properties),
        additionalProperties: false
    };

    if (typeof schemaObject.required === 'object') {
        schema.required = _.clone(schemaObject.required);
        requiredFilter === SCHEMA_FILTER_ALL ||
            (requiredFilter === SCHEMA_FILTER_ONLY_ID && (schema.required = _.filter(schema.required, (value) => value == 'id'))) ||
            (requiredFilter === SCHEMA_FILTER_NO_ID && (schema.required = _.reject(schema.required, (value) => value == 'id'))) ||
            delete schema.required;
    }

    propertiesFilter === SCHEMA_FILTER_ALL ||
        (propertiesFilter === SCHEMA_FILTER_ONLY_ID && (schema.properties = _.pick(schema.properties, 'id'))) ||
        (propertiesFilter === SCHEMA_FILTER_NO_ID && (schema.properties = _.omit(schema.properties, 'id'))) ||
        (schema.properties = {});

    if (toArray === true) {
        for (let key in schema.properties) {
            let description = schema.properties[key].description;
            delete schema.properties[key].description;
            if (schema.properties[key].type === 'array' && schema.properties[key].items) {
                schema.properties[key] = { oneOf: [schema.properties[key].items, schema.properties[key]], description: description };
            } else {
                schema.properties[key] = { oneOf: [schema.properties[key], { type: 'array', items: schema.properties[key] }], description: description };
            }
        }
    }

    return schema;
}

/**
 * Provides the Gulp tasks watch-model and build-model
 * 
 * @param gulp Gulp object
 * @param sourcePath Path(s) of the files containing JSON-Schema models 
 * @param modelDirectory Model file directory
 * @param taskSuffix Optional task suffix allow to create multiple tasks for differents model files, in case of sub-projects
 */
function gulpTasksModel(gulp, sourcePath, modelDirectory, taskSuffix = null, gulpSchemaToTypescriptOpt = {}) {
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
            .pipe(gulpSchemaToTypescript(gulpSchemaToTypescriptOpt))
            .pipe(gulp.dest(modelDirectory))
    });
}

module.exports = { gulpSchemaToTypescript, gulpTasksModel };