﻿/// <reference path="../typings/typings.d.ts" />

import mongoose = require('mongoose')
import _ = require('lodash')

var typeStringToMongooseType = {
    'string': String,
    'boolean': Boolean,
    'number': Number,
    'integer': Number
}

var typeRefToMongooseType = {
    '#/definitions/objectid': mongoose.Schema.Types.ObjectId,
    '#/definitions/dateOrDatetime': Date
    
}

var subSchemaType = (parentSchema, subschema, key) =>
{
    return (parentSchema.required.indexOf(key) >= 0 && !_.isPlainObject(subschema))?
           { type: subschema, required: true }
           : subschema
}

var schemaParamsToMongoose =
{
    /**
    * default value
    */
    default: (default_: string) =>
    {
        var func = (_.last(/^\[Function=(.+)\]$/.exec(default_)) || '')
            .replace(/\\_/g, '`underscore`')
            .replace(/_/g, ' ')
            .replace(/`underscore`/g, '_')
        return {
            default: eval(func) || default_
        }
    },

    /**
    * Pattern for value to match
    */
    pattern: (pattern: string) => { return {match: RegExp(pattern)} },

    type: (type: string) => { return {type: typeStringToMongooseType[type]} },

    minLength: (min: number) => { return {minlength: min} },
    maxLength: (max: number) => { return {maxlength: max} },
    minimum: (min: number) => { return {min: min} },
    maximum: (max: number) => { return {max: max} },
    enum: (members: any[]) => { return {enum: members} }
}

var toMongooseParams = (acc, val, key) => {
    var func
    return (func = schemaParamsToMongoose[key])? _.assign(acc, func(val)): acc
}

var unsupportedRefValue = (jsonSchema) => { throw new Error("Unsupported $ref value: " + jsonSchema.$ref) }
var unsupportedJsonSchema = (jsonSchema) => { throw new Error('Unsupported JSON schema type, `' + jsonSchema.type + '`') }
var convert = (refSchemas: any, jsonSchema: any): any => {

    if (!_.isPlainObject(jsonSchema)) {
        unsupportedJsonSchema(jsonSchema)
    }

    var converted,
        result,
        format = jsonSchema.format,
        isRef = !_.isEmpty(jsonSchema.$ref),
        isTypeDate = jsonSchema.type === 'string' && (format === 'date' || format === 'date-time'),
        mongooseRef = typeRefToMongooseType[jsonSchema.$ref],
        isMongooseRef = typeof(mongooseRef) != 'undefined' ? true : false,
        subSchema = _.isEmpty(refSchemas)? false: refSchemas[jsonSchema.$ref]

    return (result =
        isRef
            ? isMongooseRef? mongooseRef
            : subSchema? convert(refSchemas, subSchema)
            : unsupportedRefValue(jsonSchema)

        : isTypeDate
            ? _.reduce (
                <any> _.omit(jsonSchema, 'type', 'format'),
                toMongooseParams,
                {type: typeRefToMongooseType['#/definitions/dateOrDatetime']} )

        : _.has(typeStringToMongooseType, jsonSchema.type)
            ? _.reduce(jsonSchema, toMongooseParams, {})

        : (jsonSchema.type === 'object')
            ? _.isEmpty(jsonSchema.properties)
                ? mongoose.Schema.Types.Mixed
            : ( converted = _.mapValues(jsonSchema.properties, convert.bind(null, refSchemas)),
                jsonSchema.required? (_.mapValues(converted, subSchemaType.bind(null, jsonSchema))): converted )

        : (jsonSchema.type === 'array')
            ? !_.isEmpty(jsonSchema.items)
                ? [convert(refSchemas, jsonSchema.items)]
            : []

        : !_.has(jsonSchema, 'type')
            ? mongoose.Schema.Types.Mixed

        : unsupportedJsonSchema(jsonSchema)
    )
}

interface CreateMongooseSchema {
    (refSchemas: any, jsonSchema: any): any
    (refSchemas: any): (jsonSchema: any) => any
}

var createMongooseSchema = <CreateMongooseSchema> _.curry(convert)

export = createMongooseSchema