var jsonSchemaToTypescript = require('json-schema-to-typescript');
var path = require('path')
var _ = require('lodash')
var through = require('through2');
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
    // default value for generateModelSchema
    opt.generateModelSchema = opt.hasOwnProperty("generateModelSchema") ? opt.generateModelSchema : true
    // default value for modelSchemaPath
    opt.modelSchemaPath = opt.modelSchemaPath || "@serafin/api"
    // default value for modelSchemaClass
    opt.modelSchemaClass = opt.modelSchemaClass || "PipelineSchemaModel"
    // default banner comment
    opt.bannerComment = opt.bannerComment || `/**
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
        // it will be nice if it's added as an option of json-schema-to-typescript library...
        var fullSchema = {
            definitions: _.clone(schema.definitions || {}),
            allOf: [`#/definitions/${modelName}`, ...Object.keys(schema.definitions || {}).map(n => `#/definitions/${n}`)].map(p => { return { $ref: p } })
        }
        fullSchema.definitions[modelName] = schema;
        jsonSchemaToTypescript.compile(fullSchema, "_", jsonSchemaToTypescriptOpt).then(function (ts) {
            // generate import statement for Model Schema class
            if (opt.generateModelSchema) {
                ts = `import { ${opt.modelSchemaClass} } from "${opt.modelSchemaPath}";\n\n${ts}`
            }
            // add a banner at the top
            ts = opt.bannerComment + ts;
            // add model schema declaration at the end
            if (opt.generateModelSchema) {
                let genericTypesDeclaration = modelName + ["createValues", "readQuery", "updateValues", "patchQuery", "patchValues", "deleteQuery"].map(d => {
                    if (d in fullSchema.definitions) {
                        return ", " + d
                    } else {
                        return ", any"
                    }
                }).join("");
                ts = `${ts}\n\nexport var ${_.lowerFirst(modelName)}Schema = new ${opt.modelSchemaClass}<${genericTypesDeclaration}>();\n`
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

module.exports = gulpSchemaToTypescript;