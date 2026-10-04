"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const require$$2$2 = require("node:path");
const node_fs = require("node:fs");
const node_child_process = require("node:child_process");
const require$$0$5 = require("node:os");
const require$$0$4 = require("node:events");
const require$$0$3 = require("node:diagnostics_channel");
const require$$0$1 = require("fs");
const require$$1 = require("events");
const require$$2 = require("util");
const require$$3 = require("path");
const require$$5 = require("assert");
const require$$2$1 = require("worker_threads");
const require$$0$2 = require("module");
const require$$4 = require("url");
const require$$7 = require("buffer");
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
const ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
const getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
const ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
class ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
const errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
let overrideErrorMap = errorMap;
function getErrorMap() {
  return overrideErrorMap;
}
const makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === errorMap ? void 0 : errorMap
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
const INVALID = Object.freeze({
  status: "aborted"
});
const DIRTY = (value) => ({ status: "dirty", value });
const OK = (value) => ({ status: "valid", value });
const isAborted = (x) => x.status === "aborted";
const isDirty = (x) => x.status === "dirty";
const isValid = (x) => x.status === "valid";
const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));
class ParseInputLazyPath {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
const handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err2) {
        if (err2?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const cuidRegex = /^c[^\s-]{8,}$/i;
const cuid2Regex = /^[0-9a-z]+$/;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const nanoidRegex = /^[a-z0-9_-]{21}$/i;
const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
let emojiRegex;
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
class ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
class ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
class ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
class ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
class ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
class ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
class ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
class ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
class ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
class ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
class ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") ;
      else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
}
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
class ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
class ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
class ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest
    });
  }
}
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
class ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
}
class ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
class ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
class ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
class ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
}
ZodEnum.create = createZodEnum;
class ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
class ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
class ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
}
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
class ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
class ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
class ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
class ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
class ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
class ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
}
class ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
}
class ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
const stringType = ZodString.create;
const numberType = ZodNumber.create;
const booleanType = ZodBoolean.create;
const nullType = ZodNull.create;
const unknownType = ZodUnknown.create;
ZodNever.create;
const arrayType = ZodArray.create;
const objectType = ZodObject.create;
const unionType = ZodUnion.create;
ZodIntersection.create;
ZodTuple.create;
const recordType = ZodRecord.create;
const literalType = ZodLiteral.create;
const enumType = ZodEnum.create;
const nativeEnumType = ZodNativeEnum.create;
ZodPromise.create;
ZodOptional.create;
ZodNullable.create;
objectType({
  jsonrpc: literalType("2.0"),
  id: unionType([stringType(), numberType(), nullType()]),
  method: stringType(),
  params: recordType(unknownType()).optional()
});
objectType({
  jsonrpc: literalType("2.0"),
  id: unionType([stringType(), numberType(), nullType()]),
  result: unknownType().optional(),
  error: objectType({
    code: numberType(),
    message: stringType(),
    data: unknownType().optional()
  }).optional()
});
objectType({
  jsonrpc: literalType("2.0"),
  method: stringType(),
  params: recordType(unknownType()).optional()
});
objectType({
  protocolVersion: stringType(),
  capabilities: recordType(unknownType()).optional(),
  clientInfo: objectType({
    name: stringType(),
    version: stringType()
  })
});
objectType({
  protocolVersion: stringType(),
  capabilities: recordType(unknownType()),
  serverInfo: objectType({
    name: stringType(),
    version: stringType()
  })
});
const ToolSchema = objectType({
  name: stringType(),
  description: stringType().optional(),
  inputSchema: objectType({
    type: literalType("object"),
    properties: recordType(unknownType()),
    required: arrayType(stringType()).optional()
  })
});
objectType({
  tools: arrayType(ToolSchema)
});
objectType({
  name: stringType(),
  arguments: recordType(unknownType()).optional()
});
objectType({
  content: arrayType(
    objectType({
      type: enumType(["text", "image", "resource"]),
      text: stringType().optional(),
      data: stringType().optional(),
      mimeType: stringType().optional(),
      resource: objectType({
        uri: stringType(),
        mimeType: stringType().optional(),
        text: stringType().optional()
      }).optional()
    })
  ),
  isError: booleanType().optional()
});
const ResourceSchema = objectType({
  uri: stringType(),
  name: stringType(),
  description: stringType().optional(),
  mimeType: stringType().optional()
});
objectType({
  resources: arrayType(ResourceSchema)
});
objectType({
  uri: stringType()
});
objectType({
  contents: arrayType(
    objectType({
      uri: stringType(),
      mimeType: stringType().optional(),
      text: stringType().optional(),
      blob: stringType().optional()
    })
  )
});
const PromptSchema = objectType({
  name: stringType(),
  description: stringType().optional(),
  arguments: arrayType(
    objectType({
      name: stringType(),
      description: stringType().optional(),
      required: booleanType().optional()
    })
  ).optional()
});
objectType({
  prompts: arrayType(PromptSchema)
});
objectType({
  name: stringType(),
  arguments: recordType(stringType()).optional()
});
objectType({
  description: stringType().optional(),
  messages: arrayType(
    objectType({
      role: enumType(["user", "assistant"]),
      content: unionType([
        objectType({ type: literalType("text"), text: stringType() }),
        objectType({ type: literalType("image"), data: stringType(), mimeType: stringType() }),
        objectType({ type: literalType("resource"), resource: objectType({ uri: stringType(), mimeType: stringType().optional(), text: stringType().optional() }) })
      ])
    })
  )
});
objectType({
  tools: objectType({ listChanged: booleanType().optional() }).optional(),
  resources: objectType({ subscribe: booleanType().optional(), listChanged: booleanType().optional() }).optional(),
  prompts: objectType({ listChanged: booleanType().optional() }).optional(),
  logging: objectType({}).optional(),
  completions: objectType({}).optional()
});
var TransportType = /* @__PURE__ */ ((TransportType2) => {
  TransportType2["Stdio"] = "stdio";
  TransportType2["StreamableHttp"] = "streamable-http";
  TransportType2["Sse"] = "sse";
  return TransportType2;
})(TransportType || {});
const ServerConfigSchema = objectType({
  id: stringType(),
  name: stringType(),
  transport: nativeEnumType(TransportType),
  // For stdio
  command: stringType().optional(),
  args: arrayType(stringType()).optional(),
  env: recordType(stringType()).optional(),
  cwd: stringType().optional(),
  // For HTTP
  url: stringType().optional(),
  headers: recordType(stringType()).optional(),
  // Metadata
  enabled: booleanType().default(true),
  description: stringType().optional(),
  createdAt: numberType(),
  updatedAt: numberType()
});
const IdentitySchema = objectType({
  // Tailscale device/user identity
  user: stringType().default(""),
  // e.g., "alice@example.com"
  device: stringType().default(""),
  // e.g., "alice-laptop"
  deviceId: stringType().default(""),
  // Tailscale stable device ID
  tailnet: stringType().default("")
  // e.g., "example.ts.net"
});
const PolicyRuleSchema = objectType({
  // Unique rule ID
  id: stringType(),
  // Human-readable name
  name: stringType(),
  // Identity matchers (all must match for rule to apply)
  identities: arrayType(IdentitySchema).optional(),
  // Empty = match all authenticated
  // Server access
  servers: arrayType(stringType()).optional(),
  // Server IDs, empty = all servers
  // Tool access (namespaced: serverId__toolName)
  tools: arrayType(stringType()).optional(),
  // Empty = all tools on matched servers
  // Effect
  effect: enumType(["allow", "deny"]),
  // Priority: higher wins (default 0)
  priority: numberType().int().default(0),
  // Optional description
  description: stringType().optional()
});
const PolicyDocumentSchema = objectType({
  version: numberType().int().default(1),
  // Default effect when no rule matches
  defaultEffect: enumType(["allow", "deny"]).default("deny"),
  // Rules evaluated in priority order (highest first), then by order
  rules: arrayType(PolicyRuleSchema),
  updatedAt: numberType(),
  updatedBy: stringType()
  // Identity who last updated
});
objectType({
  sub: stringType(),
  // Identity (user@tailnet)
  deviceId: stringType(),
  iat: numberType(),
  exp: numberType(),
  // Scoped permissions for this session
  permissions: objectType({
    servers: arrayType(stringType()),
    tools: arrayType(stringType())
  })
});
objectType({
  success: booleanType(),
  identity: IdentitySchema.optional(),
  token: stringType().optional(),
  error: stringType().optional()
});
objectType({
  allowed: booleanType(),
  matchedRule: PolicyRuleSchema.optional(),
  reason: stringType()
});
const GatewayConfigSchema = objectType({
  // Network
  port: numberType().int().min(1).max(65535).default(8788),
  bindAddr: stringType().default("127.0.0.1"),
  // Tailscale
  tailscaleCli: stringType().optional(),
  // Security
  redactToolPayloads: booleanType().default(true),
  // Session
  sessionTtlMs: numberType().int().positive().default(24 * 60 * 60 * 1e3),
  // 24 hours
  // Database
  dbPath: stringType().default("gateway.db"),
  // Logging
  logLevel: enumType(["trace", "debug", "info", "warn", "error", "fatal"]).default("info")
});
const AppConfigSchema = objectType({
  gateway: GatewayConfigSchema.default(() => GatewayConfigSchema.parse({})),
  // UI
  window: objectType({
    width: numberType().int().positive().default(1200),
    height: numberType().int().positive().default(800),
    minWidth: numberType().int().positive().default(800),
    minHeight: numberType().int().positive().default(600)
  }).default({}),
  // Auto-start gateway on app launch
  autoStartGateway: booleanType().default(false),
  // Check for updates
  checkUpdates: booleanType().default(true)
});
objectType({
  version: numberType().int().default(1),
  servers: arrayType(ServerConfigSchema),
  policy: PolicyDocumentSchema,
  config: GatewayConfigSchema
});
function loadConfigFromEnv() {
  const config = {};
  if (process.env.GATEWAY_PORT) {
    config.port = parseInt(process.env.GATEWAY_PORT, 10);
  }
  if (process.env.GATEWAY_BIND_ADDR) {
    config.bindAddr = process.env.GATEWAY_BIND_ADDR;
  }
  if (process.env.GATEWAY_DB_PATH) {
    config.dbPath = process.env.GATEWAY_DB_PATH;
  }
  if (process.env.TAILSCALE_CLI) {
    config.tailscaleCli = process.env.TAILSCALE_CLI;
  }
  if (process.env.REDACT_TOOL_PAYLOADS) {
    config.redactToolPayloads = process.env.REDACT_TOOL_PAYLOADS === "true";
  }
  if (process.env.LOG_LEVEL) {
    config.logLevel = process.env.LOG_LEVEL;
  }
  return config;
}
function mergeConfig(defaults, fileConfig, envConfig) {
  return GatewayConfigSchema.parse({
    ...defaults,
    ...fileConfig,
    ...envConfig
  });
}
const DEFAULT_GATEWAY_CONFIG = GatewayConfigSchema.parse({});
const DEFAULT_APP_CONFIG = AppConfigSchema.parse({});
const IPC_CHANNELS = {
  GATEWAY_START: "gateway:start",
  GATEWAY_STOP: "gateway:stop",
  GATEWAY_STATUS: "gateway:status",
  GATEWAY_LOG: "gateway:log",
  GATEWAY_EXPOSE: "gateway:expose",
  SERVERS_GET: "servers:get",
  SERVERS_CREATE: "servers:create",
  SERVERS_UPDATE: "servers:update",
  SERVERS_DELETE: "servers:delete",
  SERVERS_CONNECT: "servers:connect",
  SERVERS_DISCONNECT: "servers:disconnect",
  SERVERS_REFRESH: "servers:refresh",
  POLICY_GET: "policy:get",
  POLICY_UPDATE: "policy:update",
  POLICY_ADD_RULE: "policy:addRule",
  POLICY_REMOVE_RULE: "policy:removeRule",
  ACTIVITY_QUERY: "activity:query",
  ACTIVITY_STATS: "activity:stats",
  ACTIVITY_PRUNE: "activity:prune",
  HEALTH_GET: "health:get",
  HOST_STATS: "host:stats",
  CONFIG_GET: "config:get",
  CONFIG_UPDATE: "config:update",
  TAILSCALE_STATUS: "tailscale:status",
  TAILSCALE_WHOIS: "tailscale:whois",
  TAILSCALE_DEVICES: "tailscale:devices",
  SHARE_GET: "share:get",
  PEERS_ADD: "peers:add",
  PEERS_REMOVE: "peers:remove",
  SESSIONS_DISCONNECT: "sessions:disconnect",
  APPROVALS_LIST: "approvals:list",
  APPROVALS_APPROVE: "approvals:approve",
  APPROVALS_REVOKE: "approvals:revoke",
  EVENT_ACTIVITY: "event:activity",
  EVENT_SERVER_HEALTH: "event:serverHealth",
  EVENT_GATEWAY_STATUS: "event:gatewayStatus",
  EVENT_TOOLS_CHANGED: "event:toolsChanged",
  PROTOCOL_URL: "protocol:url",
  SHELL_OPEN_EXTERNAL: "shell:openExternal"
};
function registerServerIpcHandlers({
  gatewayFetch: gatewayFetch2,
  gatewayFetchOr: gatewayFetchOr2,
  ensureGatewayRunning: ensureGatewayRunning2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.SERVERS_GET, async () => {
    return gatewayFetchOr2("/api/servers", null);
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.SERVERS_CREATE,
    async (_event, server) => {
      await ensureGatewayRunning2();
      const created = await gatewayFetch2("/api/servers", {
        method: "POST",
        body: JSON.stringify(server)
      });
      return { success: true, server: created };
    }
  );
  electron.ipcMain.handle(
    IPC_CHANNELS.SERVERS_UPDATE,
    async (_event, id, updates) => {
      await ensureGatewayRunning2();
      const updated = await gatewayFetch2(`/api/servers/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      return { success: true, server: updated };
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.SERVERS_DELETE, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/servers/${id}`, {
      method: "DELETE"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.SERVERS_CONNECT, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/servers/${id}/connect`, {
      method: "POST"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.SERVERS_DISCONNECT, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/servers/${id}/disconnect`, {
      method: "POST"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.SERVERS_REFRESH, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/servers/${id}/refresh`, {
      method: "POST"
    });
  });
}
const EMPTY_ACTIVITY_STATS = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  uniqueUsers: 0,
  uniqueServers: 0,
  avgDurationMs: 0,
  byMethod: {},
  byServer: {},
  byTool: {},
  byIdentity: {},
  errorsByCode: {}
};
function registerPolicyActivityIpcHandlers({
  gatewayFetch: gatewayFetch2,
  gatewayFetchOr: gatewayFetchOr2,
  ensureGatewayRunning: ensureGatewayRunning2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.POLICY_GET, async () => {
    return gatewayFetchOr2("/api/policy", null);
  });
  electron.ipcMain.handle(IPC_CHANNELS.POLICY_UPDATE, async (_event, policy) => {
    await ensureGatewayRunning2();
    return gatewayFetch2("/api/policy", {
      method: "PUT",
      body: JSON.stringify(policy)
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.POLICY_ADD_RULE, async (_event, rule) => {
    await ensureGatewayRunning2();
    await gatewayFetch2("/api/policy/rules", {
      method: "POST",
      body: JSON.stringify(rule)
    });
    return { success: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.POLICY_REMOVE_RULE, async (_event, ruleId) => {
    await ensureGatewayRunning2();
    await gatewayFetch2(`/api/policy/rules/${encodeURIComponent(ruleId)}`, {
      method: "DELETE"
    });
    return { success: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.ACTIVITY_QUERY, async (_event, query) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== void 0 && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    return gatewayFetchOr2(`/api/activity?${params.toString()}`, []);
  });
  electron.ipcMain.handle(IPC_CHANNELS.ACTIVITY_STATS, async () => {
    return gatewayFetchOr2("/api/activity/stats", EMPTY_ACTIVITY_STATS);
  });
  electron.ipcMain.handle(IPC_CHANNELS.ACTIVITY_PRUNE, async (_event, olderThanMs) => {
    await ensureGatewayRunning2();
    return gatewayFetch2("/api/activity/prune", {
      method: "POST",
      body: JSON.stringify({ olderThanMs })
    });
  });
}
function registerGatewayLifecycleIpcHandlers({
  startGateway: startGateway2,
  stopGateway: stopGateway2,
  getGatewayStatus: getGatewayStatus2,
  gatewayFetch: gatewayFetch2,
  isGatewayRunning: isGatewayRunning2,
  getGatewayProcess,
  getGatewayConfig,
  setGatewayConfig,
  getLocalTailnet: getLocalTailnet2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.GATEWAY_START, async () => {
    await startGateway2();
    return { success: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.GATEWAY_STOP, async () => {
    await stopGateway2();
    return { success: true };
  });
  electron.ipcMain.handle(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    if (!isGatewayRunning2()) return getGatewayStatus2();
    try {
      return await gatewayFetch2("/api/status");
    } catch {
      return getGatewayStatus2();
    }
  });
  electron.ipcMain.handle(IPC_CHANNELS.GATEWAY_EXPOSE, async () => {
    const tailnet = await getLocalTailnet2();
    if (!tailnet.available || !tailnet.ip) {
      throw new Error(
        `Tailscale is not connected (state: ${tailnet.state ?? "unavailable"}). Connect Tailscale, then try again.`
      );
    }
    if (getGatewayProcess()) await stopGateway2();
    const config = GatewayConfigSchema.parse({
      ...getGatewayConfig(),
      bindAddr: tailnet.ip
    });
    setGatewayConfig(config);
    await startGateway2();
    return { success: true, bindAddr: config.bindAddr, tailnet };
  });
}
function registerSystemIpcHandlers({
  hostStats: hostStats2,
  gatewayFetchOr: gatewayFetchOr2,
  getGatewayConfig,
  updateGatewaySettings: updateGatewaySettings2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.HOST_STATS, hostStats2);
  electron.ipcMain.handle(IPC_CHANNELS.HEALTH_GET, async () => {
    return gatewayFetchOr2("/api/health", []);
  });
  electron.ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return { gateway: getGatewayConfig() };
  });
  electron.ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, updates) => {
    const gateway = await updateGatewaySettings2(updates);
    return { success: true, gateway };
  });
}
function registerNetworkIpcHandlers({
  gatewayFetch: gatewayFetch2,
  ensureGatewayRunning: ensureGatewayRunning2,
  isGatewayRunning: isGatewayRunning2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.TAILSCALE_STATUS, async () => {
    if (!isGatewayRunning2()) {
      return { available: false, ip: null, hostname: null, dnsName: null };
    }
    return gatewayFetch2("/api/tailscale");
  });
  electron.ipcMain.handle(IPC_CHANNELS.TAILSCALE_WHOIS, async (_event, ip) => {
    return gatewayFetch2(`/api/tailscale/whois?ip=${encodeURIComponent(ip)}`);
  });
  electron.ipcMain.handle(IPC_CHANNELS.TAILSCALE_DEVICES, async () => {
    if (!isGatewayRunning2()) {
      return { available: false, self: null, devices: [] };
    }
    return gatewayFetch2("/api/tailscale/devices");
  });
  electron.ipcMain.handle(IPC_CHANNELS.SHARE_GET, async () => {
    return gatewayFetch2("/api/share");
  });
  electron.ipcMain.handle(
    IPC_CHANNELS.PEERS_ADD,
    async (_event, address, probe) => {
      await ensureGatewayRunning2();
      return gatewayFetch2("/api/peers", {
        method: "POST",
        body: JSON.stringify({ address, probe: probe === true })
      });
    }
  );
  electron.ipcMain.handle(IPC_CHANNELS.PEERS_REMOVE, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/peers/${id}`, {
      method: "DELETE"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.SESSIONS_DISCONNECT, async (_event, deviceId) => {
    return gatewayFetch2(
      `/api/sessions/${encodeURIComponent(deviceId)}`,
      { method: "DELETE" }
    );
  });
}
function registerApprovalIpcHandlers({
  gatewayFetch: gatewayFetch2,
  ensureGatewayRunning: ensureGatewayRunning2
}) {
  electron.ipcMain.handle(IPC_CHANNELS.APPROVALS_LIST, async () => {
    await ensureGatewayRunning2();
    return gatewayFetch2("/api/approvals");
  });
  electron.ipcMain.handle(IPC_CHANNELS.APPROVALS_APPROVE, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/approvals/${encodeURIComponent(id)}/approve`, {
      method: "POST"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.APPROVALS_REVOKE, async (_event, id) => {
    await ensureGatewayRunning2();
    return gatewayFetch2(`/api/approvals/${encodeURIComponent(id)}/revoke`, {
      method: "POST"
    });
  });
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var pino$2 = { exports: {} };
const isErrorLike$2 = (err2) => {
  return err2 && typeof err2.message === "string";
};
const getErrorCause = (err2) => {
  if (!err2) return;
  const cause = err2.cause;
  if (typeof cause === "function") {
    const causeResult = err2.cause();
    return isErrorLike$2(causeResult) ? causeResult : void 0;
  } else {
    return isErrorLike$2(cause) ? cause : void 0;
  }
};
const _stackWithCauses = (err2, seen2) => {
  if (!isErrorLike$2(err2)) return "";
  const stack = err2.stack || "";
  if (seen2.has(err2)) {
    return stack + "\ncauses have become circular...";
  }
  const cause = getErrorCause(err2);
  if (cause) {
    seen2.add(err2);
    return stack + "\ncaused by: " + _stackWithCauses(cause, seen2);
  } else {
    return stack;
  }
};
const stackWithCauses$1 = (err2) => _stackWithCauses(err2, /* @__PURE__ */ new Set());
const _messageWithCauses = (err2, seen2, skip) => {
  if (!isErrorLike$2(err2)) return "";
  const message = skip ? "" : err2.message || "";
  if (seen2.has(err2)) {
    return message + ": ...";
  }
  const cause = getErrorCause(err2);
  if (cause) {
    seen2.add(err2);
    const skipIfVErrorStyleCause = typeof err2.cause === "function";
    return message + (skipIfVErrorStyleCause ? "" : ": ") + _messageWithCauses(cause, seen2, skipIfVErrorStyleCause);
  } else {
    return message;
  }
};
const messageWithCauses$1 = (err2) => _messageWithCauses(err2, /* @__PURE__ */ new Set());
var errHelpers = {
  isErrorLike: isErrorLike$2,
  stackWithCauses: stackWithCauses$1,
  messageWithCauses: messageWithCauses$1
};
const seen$2 = Symbol("circular-ref-tag");
const rawSymbol$2 = Symbol("pino-raw-err-ref");
const pinoErrProto$2 = Object.create({}, {
  type: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  message: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  stack: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  aggregateErrors: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol$2];
    },
    set: function(val) {
      this[rawSymbol$2] = val;
    }
  }
});
Object.defineProperty(pinoErrProto$2, rawSymbol$2, {
  writable: true,
  value: {}
});
var errProto = {
  pinoErrProto: pinoErrProto$2,
  pinoErrorSymbols: {
    seen: seen$2
  }
};
var err = errSerializer$1;
const { messageWithCauses, stackWithCauses, isErrorLike: isErrorLike$1 } = errHelpers;
const { pinoErrProto: pinoErrProto$1, pinoErrorSymbols: pinoErrorSymbols$1 } = errProto;
const { seen: seen$1 } = pinoErrorSymbols$1;
const { toString: toString$1 } = Object.prototype;
function errSerializer$1(err2) {
  if (!isErrorLike$1(err2)) {
    return err2;
  }
  err2[seen$1] = void 0;
  const _err = Object.create(pinoErrProto$1);
  _err.type = toString$1.call(err2.constructor) === "[object Function]" ? err2.constructor.name : err2.name;
  _err.message = messageWithCauses(err2);
  _err.stack = stackWithCauses(err2);
  if (Array.isArray(err2.errors)) {
    _err.aggregateErrors = err2.errors.map((err3) => errSerializer$1(err3));
  }
  for (const key in err2) {
    if (_err[key] === void 0) {
      const val = err2[key];
      if (isErrorLike$1(val)) {
        if (key !== "cause" && !Object.prototype.hasOwnProperty.call(val, seen$1)) {
          _err[key] = errSerializer$1(val);
        }
      } else {
        _err[key] = val;
      }
    }
  }
  delete err2[seen$1];
  _err.raw = err2;
  return _err;
}
var errWithCause = errWithCauseSerializer$1;
const { isErrorLike } = errHelpers;
const { pinoErrProto, pinoErrorSymbols } = errProto;
const { seen } = pinoErrorSymbols;
const { toString } = Object.prototype;
function errWithCauseSerializer$1(err2) {
  if (!isErrorLike(err2)) {
    return err2;
  }
  err2[seen] = void 0;
  const _err = Object.create(pinoErrProto);
  _err.type = toString.call(err2.constructor) === "[object Function]" ? err2.constructor.name : err2.name;
  _err.message = err2.message;
  _err.stack = err2.stack;
  if (Array.isArray(err2.errors)) {
    _err.aggregateErrors = err2.errors.map((err3) => errWithCauseSerializer$1(err3));
  }
  if (isErrorLike(err2.cause) && !Object.prototype.hasOwnProperty.call(err2.cause, seen)) {
    _err.cause = errWithCauseSerializer$1(err2.cause);
  }
  for (const key in err2) {
    if (_err[key] === void 0) {
      const val = err2[key];
      if (isErrorLike(val)) {
        if (!Object.prototype.hasOwnProperty.call(val, seen)) {
          _err[key] = errWithCauseSerializer$1(val);
        }
      } else {
        _err[key] = val;
      }
    }
  }
  delete err2[seen];
  _err.raw = err2;
  return _err;
}
var req = {
  mapHttpRequest: mapHttpRequest$1,
  reqSerializer
};
const rawSymbol$1 = Symbol("pino-raw-req-ref");
const pinoReqProto = Object.create({}, {
  id: {
    enumerable: true,
    writable: true,
    value: ""
  },
  method: {
    enumerable: true,
    writable: true,
    value: ""
  },
  url: {
    enumerable: true,
    writable: true,
    value: ""
  },
  query: {
    enumerable: true,
    writable: true,
    value: ""
  },
  params: {
    enumerable: true,
    writable: true,
    value: ""
  },
  headers: {
    enumerable: true,
    writable: true,
    value: {}
  },
  remoteAddress: {
    enumerable: true,
    writable: true,
    value: ""
  },
  remotePort: {
    enumerable: true,
    writable: true,
    value: ""
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol$1];
    },
    set: function(val) {
      this[rawSymbol$1] = val;
    }
  }
});
Object.defineProperty(pinoReqProto, rawSymbol$1, {
  writable: true,
  value: {}
});
function reqSerializer(req2) {
  const connection = req2.info || req2.socket;
  const _req = Object.create(pinoReqProto);
  _req.id = typeof req2.id === "function" ? req2.id() : req2.id || (req2.info ? req2.info.id : void 0);
  _req.method = req2.method;
  if (req2.originalUrl) {
    _req.url = req2.originalUrl;
  } else {
    const path2 = req2.path;
    _req.url = typeof path2 === "string" ? path2 : req2.url ? req2.url.path || req2.url : void 0;
  }
  if (req2.query) {
    _req.query = req2.query;
  }
  if (req2.params) {
    _req.params = req2.params;
  }
  _req.headers = req2.headers;
  _req.remoteAddress = connection && connection.remoteAddress;
  _req.remotePort = connection && connection.remotePort;
  _req.raw = req2.raw || req2;
  return _req;
}
function mapHttpRequest$1(req2) {
  return {
    req: reqSerializer(req2)
  };
}
var res = {
  mapHttpResponse: mapHttpResponse$1,
  resSerializer
};
const rawSymbol = Symbol("pino-raw-res-ref");
const pinoResProto = Object.create({}, {
  statusCode: {
    enumerable: true,
    writable: true,
    value: 0
  },
  headers: {
    enumerable: true,
    writable: true,
    value: ""
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol];
    },
    set: function(val) {
      this[rawSymbol] = val;
    }
  }
});
Object.defineProperty(pinoResProto, rawSymbol, {
  writable: true,
  value: {}
});
function resSerializer(res2) {
  const _res = Object.create(pinoResProto);
  _res.statusCode = res2.headersSent ? res2.statusCode : null;
  _res.headers = res2.getHeaders ? res2.getHeaders() : res2._headers;
  _res.raw = res2;
  return _res;
}
function mapHttpResponse$1(res2) {
  return {
    res: resSerializer(res2)
  };
}
const errSerializer = err;
const errWithCauseSerializer = errWithCause;
const reqSerializers = req;
const resSerializers = res;
var pinoStdSerializers = {
  err: errSerializer,
  errWithCause: errWithCauseSerializer,
  mapHttpRequest: reqSerializers.mapHttpRequest,
  mapHttpResponse: resSerializers.mapHttpResponse,
  req: reqSerializers.reqSerializer,
  res: resSerializers.resSerializer,
  wrapErrorSerializer: function wrapErrorSerializer(customSerializer) {
    if (customSerializer === errSerializer) return customSerializer;
    return function wrapErrSerializer(err2) {
      return customSerializer(errSerializer(err2));
    };
  },
  wrapRequestSerializer: function wrapRequestSerializer(customSerializer) {
    if (customSerializer === reqSerializers.reqSerializer) return customSerializer;
    return function wrappedReqSerializer(req2) {
      return customSerializer(reqSerializers.reqSerializer(req2));
    };
  },
  wrapResponseSerializer: function wrapResponseSerializer(customSerializer) {
    if (customSerializer === resSerializers.resSerializer) return customSerializer;
    return function wrappedResSerializer(res2) {
      return customSerializer(resSerializers.resSerializer(res2));
    };
  }
};
function noOpPrepareStackTrace(_, stack) {
  return stack;
}
var caller$1 = function getCallers() {
  const originalPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace = noOpPrepareStackTrace;
  const stack = new Error().stack;
  Error.prepareStackTrace = originalPrepare;
  if (!Array.isArray(stack)) {
    return void 0;
  }
  const entries = stack.slice(2);
  const fileNames = [];
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    fileNames.push(entry.getFileName());
  }
  return fileNames;
};
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof Array) {
    const cloned = [];
    for (let i = 0; i < obj.length; i++) {
      cloned[i] = deepClone(obj[i]);
    }
    return cloned;
  }
  if (typeof obj === "object") {
    const cloned = Object.create(Object.getPrototypeOf(obj));
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}
function parsePath(path2) {
  const parts = [];
  let current = "";
  let inBrackets = false;
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < path2.length; i++) {
    const char = path2[i];
    if (!inBrackets && char === ".") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBrackets = true;
    } else if (char === "]" && inBrackets) {
      parts.push(current);
      current = "";
      inBrackets = false;
      inQuotes = false;
    } else if ((char === '"' || char === "'") && inBrackets) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = "";
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
function setValue(obj, parts, value) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current !== "object" || current === null || !(key in current)) {
      return false;
    }
    if (typeof current[key] !== "object" || current[key] === null) {
      return false;
    }
    current = current[key];
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey === "*") {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        current[i] = value;
      }
    } else if (typeof current === "object" && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          current[key] = value;
        }
      }
    }
  } else {
    if (typeof current === "object" && current !== null && lastKey in current && Object.prototype.hasOwnProperty.call(current, lastKey)) {
      current[lastKey] = value;
    }
  }
  return true;
}
function removeKey(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current !== "object" || current === null || !(key in current)) {
      return false;
    }
    if (typeof current[key] !== "object" || current[key] === null) {
      return false;
    }
    current = current[key];
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey === "*") {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        current[i] = void 0;
      }
    } else if (typeof current === "object" && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          delete current[key];
        }
      }
    }
  } else {
    if (typeof current === "object" && current !== null && lastKey in current && Object.prototype.hasOwnProperty.call(current, lastKey)) {
      delete current[lastKey];
    }
  }
  return true;
}
const PATH_NOT_FOUND = Symbol("PATH_NOT_FOUND");
function getValueIfExists(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return PATH_NOT_FOUND;
    }
    if (typeof current !== "object" || current === null) {
      return PATH_NOT_FOUND;
    }
    if (!(part in current)) {
      return PATH_NOT_FOUND;
    }
    current = current[part];
  }
  return current;
}
function getValue(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current !== "object" || current === null) {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function redactPaths(obj, paths, censor, remove = false) {
  for (const path2 of paths) {
    const parts = parsePath(path2);
    if (parts.includes("*")) {
      redactWildcardPath(obj, parts, censor, path2, remove);
    } else {
      if (remove) {
        removeKey(obj, parts);
      } else {
        const value = getValueIfExists(obj, parts);
        if (value === PATH_NOT_FOUND) {
          continue;
        }
        const actualCensor = typeof censor === "function" ? censor(value, parts) : censor;
        setValue(obj, parts, actualCensor);
      }
    }
  }
}
function redactWildcardPath(obj, parts, censor, originalPath, remove = false) {
  const wildcardIndex = parts.indexOf("*");
  if (wildcardIndex === parts.length - 1) {
    const parentParts = parts.slice(0, -1);
    let current = obj;
    for (const part of parentParts) {
      if (current === null || current === void 0) return;
      if (typeof current !== "object" || current === null) return;
      current = current[part];
    }
    if (Array.isArray(current)) {
      if (remove) {
        for (let i = 0; i < current.length; i++) {
          current[i] = void 0;
        }
      } else {
        for (let i = 0; i < current.length; i++) {
          const indexPath = [...parentParts, i.toString()];
          const actualCensor = typeof censor === "function" ? censor(current[i], indexPath) : censor;
          current[i] = actualCensor;
        }
      }
    } else if (typeof current === "object" && current !== null) {
      if (remove) {
        const keysToDelete = [];
        for (const key in current) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          delete current[key];
        }
      } else {
        for (const key in current) {
          const keyPath = [...parentParts, key];
          const actualCensor = typeof censor === "function" ? censor(current[key], keyPath) : censor;
          current[key] = actualCensor;
        }
      }
    }
  } else {
    redactIntermediateWildcard(obj, parts, censor, wildcardIndex, originalPath, remove);
  }
}
function redactIntermediateWildcard(obj, parts, censor, wildcardIndex, originalPath, remove = false) {
  const beforeWildcard = parts.slice(0, wildcardIndex);
  const afterWildcard = parts.slice(wildcardIndex + 1);
  const pathArray = [];
  function traverse(current, pathLength) {
    if (pathLength === beforeWildcard.length) {
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          pathArray[pathLength] = i.toString();
          traverse(current[i], pathLength + 1);
        }
      } else if (typeof current === "object" && current !== null) {
        for (const key in current) {
          pathArray[pathLength] = key;
          traverse(current[key], pathLength + 1);
        }
      }
    } else if (pathLength < beforeWildcard.length) {
      const nextKey = beforeWildcard[pathLength];
      if (current && typeof current === "object" && current !== null && nextKey in current) {
        pathArray[pathLength] = nextKey;
        traverse(current[nextKey], pathLength + 1);
      }
    } else {
      if (afterWildcard.includes("*")) {
        const wrappedCensor = typeof censor === "function" ? (value, path2) => {
          const fullPath = [...pathArray.slice(0, pathLength), ...path2];
          return censor(value, fullPath);
        } : censor;
        redactWildcardPath(current, afterWildcard, wrappedCensor, originalPath, remove);
      } else {
        if (remove) {
          removeKey(current, afterWildcard);
        } else {
          const actualCensor = typeof censor === "function" ? censor(getValue(current, afterWildcard), [...pathArray.slice(0, pathLength), ...afterWildcard]) : censor;
          setValue(current, afterWildcard, actualCensor);
        }
      }
    }
  }
  if (beforeWildcard.length === 0) {
    traverse(obj, 0);
  } else {
    let current = obj;
    for (let i = 0; i < beforeWildcard.length; i++) {
      const part = beforeWildcard[i];
      if (current === null || current === void 0) return;
      if (typeof current !== "object" || current === null) return;
      current = current[part];
      pathArray[i] = part;
    }
    if (current !== null && current !== void 0) {
      traverse(current, beforeWildcard.length);
    }
  }
}
function buildPathStructure(pathsToClone) {
  if (pathsToClone.length === 0) {
    return null;
  }
  const pathStructure = /* @__PURE__ */ new Map();
  for (const path2 of pathsToClone) {
    const parts = parsePath(path2);
    let current = pathStructure;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.has(part)) {
        current.set(part, /* @__PURE__ */ new Map());
      }
      current = current.get(part);
    }
  }
  return pathStructure;
}
function selectiveClone(obj, pathStructure) {
  if (!pathStructure) {
    return obj;
  }
  function cloneSelectively(source, pathMap, depth = 0) {
    if (!pathMap || pathMap.size === 0) {
      return source;
    }
    if (source === null || typeof source !== "object") {
      return source;
    }
    if (source instanceof Date) {
      return new Date(source.getTime());
    }
    if (Array.isArray(source)) {
      const cloned2 = [];
      for (let i = 0; i < source.length; i++) {
        const indexStr = i.toString();
        if (pathMap.has(indexStr) || pathMap.has("*")) {
          cloned2[i] = cloneSelectively(source[i], pathMap.get(indexStr) || pathMap.get("*"));
        } else {
          cloned2[i] = source[i];
        }
      }
      return cloned2;
    }
    const cloned = Object.create(Object.getPrototypeOf(source));
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (pathMap.has(key) || pathMap.has("*")) {
          cloned[key] = cloneSelectively(source[key], pathMap.get(key) || pathMap.get("*"));
        } else {
          cloned[key] = source[key];
        }
      }
    }
    return cloned;
  }
  return cloneSelectively(obj, pathStructure);
}
function validatePath(path2) {
  if (typeof path2 !== "string") {
    throw new Error("Paths must be (non-empty) strings");
  }
  if (path2 === "") {
    throw new Error("Invalid redaction path ()");
  }
  if (path2.includes("..")) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
  if (path2.includes(",")) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
  let bracketCount = 0;
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < path2.length; i++) {
    const char = path2[i];
    if ((char === '"' || char === "'") && bracketCount > 0) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = "";
      }
    } else if (char === "[" && !inQuotes) {
      bracketCount++;
    } else if (char === "]" && !inQuotes) {
      bracketCount--;
      if (bracketCount < 0) {
        throw new Error(`Invalid redaction path (${path2})`);
      }
    }
  }
  if (bracketCount !== 0) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
}
function validatePaths(paths) {
  if (!Array.isArray(paths)) {
    throw new TypeError("paths must be an array");
  }
  for (const path2 of paths) {
    validatePath(path2);
  }
}
function slowRedact(options = {}) {
  const {
    paths = [],
    censor = "[REDACTED]",
    serialize = JSON.stringify,
    strict: strict2 = true,
    remove = false
  } = options;
  validatePaths(paths);
  const pathStructure = buildPathStructure(paths);
  return function redact2(obj) {
    if (strict2 && (obj === null || typeof obj !== "object")) {
      if (obj === null || obj === void 0) {
        return serialize ? serialize(obj) : obj;
      }
      if (typeof obj !== "object") {
        return serialize ? serialize(obj) : obj;
      }
    }
    const cloned = selectiveClone(obj, pathStructure);
    const original = obj;
    let actualCensor = censor;
    if (typeof censor === "function") {
      actualCensor = censor;
    }
    redactPaths(cloned, paths, actualCensor, remove);
    if (serialize === false) {
      cloned.restore = function() {
        return deepClone(original);
      };
      return cloned;
    }
    if (typeof serialize === "function") {
      return serialize(cloned);
    }
    return JSON.stringify(cloned);
  };
}
var redact = slowRedact;
const setLevelSym$2 = Symbol("pino.setLevel");
const getLevelSym$1 = Symbol("pino.getLevel");
const levelValSym$2 = Symbol("pino.levelVal");
const levelCompSym$2 = Symbol("pino.levelComp");
const useLevelLabelsSym = Symbol("pino.useLevelLabels");
const useOnlyCustomLevelsSym$3 = Symbol("pino.useOnlyCustomLevels");
const mixinSym$2 = Symbol("pino.mixin");
const lsCacheSym$3 = Symbol("pino.lsCache");
const chindingsSym$3 = Symbol("pino.chindings");
const asJsonSym$1 = Symbol("pino.asJson");
const writeSym$2 = Symbol("pino.write");
const redactFmtSym$3 = Symbol("pino.redactFmt");
const timeSym$2 = Symbol("pino.time");
const timeSliceIndexSym$2 = Symbol("pino.timeSliceIndex");
const streamSym$3 = Symbol("pino.stream");
const stringifySym$3 = Symbol("pino.stringify");
const stringifySafeSym$2 = Symbol("pino.stringifySafe");
const stringifiersSym$3 = Symbol("pino.stringifiers");
const endSym$2 = Symbol("pino.end");
const formatOptsSym$3 = Symbol("pino.formatOpts");
const messageKeySym$3 = Symbol("pino.messageKey");
const errorKeySym$3 = Symbol("pino.errorKey");
const nestedKeySym$2 = Symbol("pino.nestedKey");
const nestedKeyStrSym$2 = Symbol("pino.nestedKeyStr");
const mixinMergeStrategySym$2 = Symbol("pino.mixinMergeStrategy");
const msgPrefixSym$3 = Symbol("pino.msgPrefix");
const wildcardFirstSym$2 = Symbol("pino.wildcardFirst");
const serializersSym$3 = Symbol.for("pino.serializers");
const formattersSym$4 = Symbol.for("pino.formatters");
const hooksSym$3 = Symbol.for("pino.hooks");
const needsMetadataGsym$1 = Symbol.for("pino.metadata");
var symbols$1 = {
  setLevelSym: setLevelSym$2,
  getLevelSym: getLevelSym$1,
  levelValSym: levelValSym$2,
  levelCompSym: levelCompSym$2,
  useLevelLabelsSym,
  mixinSym: mixinSym$2,
  lsCacheSym: lsCacheSym$3,
  chindingsSym: chindingsSym$3,
  asJsonSym: asJsonSym$1,
  writeSym: writeSym$2,
  serializersSym: serializersSym$3,
  redactFmtSym: redactFmtSym$3,
  timeSym: timeSym$2,
  timeSliceIndexSym: timeSliceIndexSym$2,
  streamSym: streamSym$3,
  stringifySym: stringifySym$3,
  stringifySafeSym: stringifySafeSym$2,
  stringifiersSym: stringifiersSym$3,
  endSym: endSym$2,
  formatOptsSym: formatOptsSym$3,
  messageKeySym: messageKeySym$3,
  errorKeySym: errorKeySym$3,
  nestedKeySym: nestedKeySym$2,
  wildcardFirstSym: wildcardFirstSym$2,
  needsMetadataGsym: needsMetadataGsym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$3,
  formattersSym: formattersSym$4,
  hooksSym: hooksSym$3,
  nestedKeyStrSym: nestedKeyStrSym$2,
  mixinMergeStrategySym: mixinMergeStrategySym$2,
  msgPrefixSym: msgPrefixSym$3
};
const Redact = redact;
const { redactFmtSym: redactFmtSym$2, wildcardFirstSym: wildcardFirstSym$1 } = symbols$1;
const rx = /[^.[\]]+|\[([^[\]]*?)\]/g;
const CENSOR = "[Redacted]";
const strict = false;
function redaction$2(opts, serialize) {
  const { paths, censor, remove } = handle(opts);
  const shape = paths.reduce((o, str) => {
    rx.lastIndex = 0;
    const first = rx.exec(str);
    const next = rx.exec(str);
    let ns = first[1] !== void 0 ? first[1].replace(/^(?:"|'|`)(.*)(?:"|'|`)$/, "$1") : first[0];
    if (ns === "*") {
      ns = wildcardFirstSym$1;
    }
    if (next === null) {
      o[ns] = null;
      return o;
    }
    if (o[ns] === null) {
      return o;
    }
    const { index } = next;
    const nextPath = `${str.substr(index, str.length - 1)}`;
    o[ns] = o[ns] || [];
    if (ns !== wildcardFirstSym$1 && o[ns].length === 0) {
      o[ns].push(...o[wildcardFirstSym$1] || []);
    }
    if (ns === wildcardFirstSym$1) {
      Object.keys(o).forEach(function(k) {
        if (o[k]) {
          o[k].push(nextPath);
        }
      });
    }
    o[ns].push(nextPath);
    return o;
  }, {});
  const result = {
    [redactFmtSym$2]: Redact({ paths, censor, serialize, strict, remove })
  };
  const topCensor = (...args) => {
    return typeof censor === "function" ? serialize(censor(...args)) : serialize(censor);
  };
  return [...Object.keys(shape), ...Object.getOwnPropertySymbols(shape)].reduce((o, k) => {
    if (shape[k] === null) {
      o[k] = (value) => topCensor(value, [k]);
    } else {
      const wrappedCensor = typeof censor === "function" ? (value, path2) => {
        return censor(value, [k, ...path2]);
      } : censor;
      o[k] = Redact({
        paths: shape[k],
        censor: wrappedCensor,
        serialize,
        strict,
        remove
      });
    }
    return o;
  }, result);
}
function handle(opts) {
  if (Array.isArray(opts)) {
    opts = { paths: opts, censor: CENSOR };
    return opts;
  }
  let { paths, censor = CENSOR, remove } = opts;
  if (Array.isArray(paths) === false) {
    throw Error("pino – redact must contain an array of strings");
  }
  if (remove === true) censor = void 0;
  return { paths, censor, remove };
}
var redaction_1 = redaction$2;
const nullTime$1 = () => "";
const epochTime$1 = () => `,"time":${Date.now()}`;
const unixTime = () => `,"time":${Math.round(Date.now() / 1e3)}`;
const isoTime = () => `,"time":"${new Date(Date.now()).toISOString()}"`;
const NS_PER_MS = 1000000n;
const NS_PER_SEC = 1000000000n;
const startWallTimeNs = BigInt(Date.now()) * NS_PER_MS;
const startHrTime = process.hrtime.bigint();
const isoTimeNano = () => {
  const elapsedNs = process.hrtime.bigint() - startHrTime;
  const currentTimeNs = startWallTimeNs + elapsedNs;
  const secondsSinceEpoch = currentTimeNs / NS_PER_SEC;
  const nanosWithinSecond = currentTimeNs % NS_PER_SEC;
  const msSinceEpoch = Number(secondsSinceEpoch * 1000n + nanosWithinSecond / 1000000n);
  const date = new Date(msSinceEpoch);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `,"time":"${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${nanosWithinSecond.toString().padStart(9, "0")}Z"`;
};
var time$1 = { nullTime: nullTime$1, epochTime: epochTime$1, unixTime, isoTime, isoTimeNano };
function tryStringify(o) {
  try {
    return JSON.stringify(o);
  } catch (e) {
    return '"[Circular]"';
  }
}
var quickFormatUnescaped = format$1;
function format$1(f, args, opts) {
  var ss = opts && opts.stringify || tryStringify;
  var offset = 1;
  if (typeof f === "object" && f !== null) {
    var len = args.length + offset;
    if (len === 1) return f;
    var objects = new Array(len);
    objects[0] = ss(f);
    for (var index = 1; index < len; index++) {
      objects[index] = ss(args[index]);
    }
    return objects.join(" ");
  }
  if (typeof f !== "string") {
    return f;
  }
  var argLen = args.length;
  if (argLen === 0) return f;
  var str = "";
  var a = 1 - offset;
  var lastPos = -1;
  var flen = f && f.length || 0;
  for (var i = 0; i < flen; ) {
    if (f.charCodeAt(i) === 37 && i + 1 < flen) {
      lastPos = lastPos > -1 ? lastPos : 0;
      switch (f.charCodeAt(i + 1)) {
        case 100:
        case 102:
          if (a >= argLen)
            break;
          if (args[a] == null) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += Number(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 105:
          if (a >= argLen)
            break;
          if (args[a] == null) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += Math.floor(Number(args[a]));
          lastPos = i + 2;
          i++;
          break;
        case 79:
        case 111:
        case 106:
          if (a >= argLen)
            break;
          if (args[a] === void 0) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          var type = typeof args[a];
          if (type === "string") {
            str += "'" + args[a] + "'";
            lastPos = i + 2;
            i++;
            break;
          }
          if (type === "function") {
            str += args[a].name || "<anonymous>";
            lastPos = i + 2;
            i++;
            break;
          }
          str += ss(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 115:
          if (a >= argLen)
            break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += String(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 37:
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += "%";
          lastPos = i + 2;
          i++;
          a--;
          break;
      }
      ++a;
    }
    ++i;
  }
  if (lastPos === -1)
    return f;
  else if (lastPos < flen) {
    str += f.slice(lastPos);
  }
  return str;
}
var atomicSleep = { exports: {} };
var hasRequiredAtomicSleep;
function requireAtomicSleep() {
  if (hasRequiredAtomicSleep) return atomicSleep.exports;
  hasRequiredAtomicSleep = 1;
  if (typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined") {
    let sleep2 = function(ms) {
      const valid = ms > 0 && ms < Infinity;
      if (valid === false) {
        if (typeof ms !== "number" && typeof ms !== "bigint") {
          throw TypeError("sleep: ms must be a number");
        }
        throw RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
      }
      Atomics.wait(nil, 0, 0, Number(ms));
    };
    const nil = new Int32Array(new SharedArrayBuffer(4));
    atomicSleep.exports = sleep2;
  } else {
    let sleep2 = function(ms) {
      const valid = ms > 0 && ms < Infinity;
      if (valid === false) {
        if (typeof ms !== "number" && typeof ms !== "bigint") {
          throw TypeError("sleep: ms must be a number");
        }
        throw RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
      }
    };
    atomicSleep.exports = sleep2;
  }
  return atomicSleep.exports;
}
const fs = require$$0$1;
const EventEmitter$1 = require$$1;
const inherits = require$$2.inherits;
const path = require$$3;
const sleep = requireAtomicSleep();
const assert = require$$5;
const BUSY_WRITE_TIMEOUT = 100;
const kEmptyBuffer = Buffer.allocUnsafe(0);
const MAX_WRITE = 16 * 1024;
const kContentModeBuffer = "buffer";
const kContentModeUtf8 = "utf8";
const [major, minor] = (process.versions.node || "0.0").split(".").map(Number);
const kCopyBuffer = major >= 22 && minor >= 7;
function openFile(file, sonic) {
  sonic._opening = true;
  sonic._writing = true;
  sonic._asyncDrainScheduled = false;
  function fileOpened(err2, fd) {
    if (err2) {
      sonic._reopening = false;
      sonic._writing = false;
      sonic._opening = false;
      if (sonic.sync) {
        process.nextTick(() => {
          if (sonic.listenerCount("error") > 0) {
            sonic.emit("error", err2);
          }
        });
      } else {
        sonic.emit("error", err2);
      }
      return;
    }
    const reopening = sonic._reopening;
    sonic.fd = fd;
    sonic.file = file;
    sonic._reopening = false;
    sonic._opening = false;
    sonic._writing = false;
    if (sonic.sync) {
      process.nextTick(() => sonic.emit("ready"));
    } else {
      sonic.emit("ready");
    }
    if (sonic.destroyed) {
      return;
    }
    if (!sonic._writing && sonic._len > sonic.minLength || sonic._flushPending) {
      sonic._actualWrite();
    } else if (reopening) {
      process.nextTick(() => sonic.emit("drain"));
    }
  }
  const flags = sonic.append ? "a" : "w";
  const mode = sonic.mode;
  if (sonic.sync) {
    try {
      if (sonic.mkdir) fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(file, flags, mode);
      fileOpened(null, fd);
    } catch (err2) {
      fileOpened(err2);
      throw err2;
    }
  } else if (sonic.mkdir) {
    fs.mkdir(path.dirname(file), { recursive: true }, (err2) => {
      if (err2) return fileOpened(err2);
      fs.open(file, flags, mode, fileOpened);
    });
  } else {
    fs.open(file, flags, mode, fileOpened);
  }
}
function SonicBoom$1(opts) {
  if (!(this instanceof SonicBoom$1)) {
    return new SonicBoom$1(opts);
  }
  let { fd, dest, minLength, maxLength, maxWrite, periodicFlush, sync, append = true, mkdir, retryEAGAIN, fsync, contentMode, mode } = opts || {};
  fd = fd || dest;
  this._len = 0;
  this.fd = -1;
  this._bufs = [];
  this._lens = [];
  this._writing = false;
  this._ending = false;
  this._reopening = false;
  this._asyncDrainScheduled = false;
  this._flushPending = false;
  this._hwm = Math.max(minLength || 0, 16387);
  this.file = null;
  this.destroyed = false;
  this.minLength = minLength || 0;
  this.maxLength = maxLength || 0;
  this.maxWrite = maxWrite || MAX_WRITE;
  this._periodicFlush = periodicFlush || 0;
  this._periodicFlushTimer = void 0;
  this.sync = sync || false;
  this.writable = true;
  this._fsync = fsync || false;
  this.append = append || false;
  this.mode = mode;
  this.retryEAGAIN = retryEAGAIN || (() => true);
  this.mkdir = mkdir || false;
  let fsWriteSync;
  let fsWrite;
  if (contentMode === kContentModeBuffer) {
    this._writingBuf = kEmptyBuffer;
    this.write = writeBuffer;
    this.flush = flushBuffer;
    this.flushSync = flushBufferSync;
    this._actualWrite = actualWriteBuffer;
    fsWriteSync = () => fs.writeSync(this.fd, this._writingBuf);
    fsWrite = () => fs.write(this.fd, this._writingBuf, this.release);
  } else if (contentMode === void 0 || contentMode === kContentModeUtf8) {
    this._writingBuf = "";
    this.write = write$1;
    this.flush = flush$1;
    this.flushSync = flushSync;
    this._actualWrite = actualWrite;
    fsWriteSync = () => {
      if (Buffer.isBuffer(this._writingBuf)) {
        return fs.writeSync(this.fd, this._writingBuf);
      }
      return fs.writeSync(this.fd, this._writingBuf, "utf8");
    };
    fsWrite = () => {
      if (Buffer.isBuffer(this._writingBuf)) {
        return fs.write(this.fd, this._writingBuf, this.release);
      }
      return fs.write(this.fd, this._writingBuf, "utf8", this.release);
    };
  } else {
    throw new Error(`SonicBoom supports "${kContentModeUtf8}" and "${kContentModeBuffer}", but passed ${contentMode}`);
  }
  if (typeof fd === "number") {
    this.fd = fd;
    process.nextTick(() => this.emit("ready"));
  } else if (typeof fd === "string") {
    openFile(fd, this);
  } else {
    throw new Error("SonicBoom supports only file descriptors and files");
  }
  if (this.minLength >= this.maxWrite) {
    throw new Error(`minLength should be smaller than maxWrite (${this.maxWrite})`);
  }
  this.release = (err2, n) => {
    if (err2) {
      if ((err2.code === "EAGAIN" || err2.code === "EBUSY") && this.retryEAGAIN(err2, this._writingBuf.length, this._len - this._writingBuf.length)) {
        if (this.sync) {
          try {
            sleep(BUSY_WRITE_TIMEOUT);
            this.release(void 0, 0);
          } catch (err3) {
            this.release(err3);
          }
        } else {
          setTimeout(fsWrite, BUSY_WRITE_TIMEOUT);
        }
      } else {
        this._writing = false;
        this.emit("error", err2);
      }
      return;
    }
    this.emit("write", n);
    const releasedBufObj = releaseWritingBuf(this._writingBuf, this._len, n);
    this._len = releasedBufObj.len;
    this._writingBuf = releasedBufObj.writingBuf;
    if (this._writingBuf.length) {
      if (!this.sync) {
        fsWrite();
        return;
      }
      try {
        do {
          const n2 = fsWriteSync();
          const releasedBufObj2 = releaseWritingBuf(this._writingBuf, this._len, n2);
          this._len = releasedBufObj2.len;
          this._writingBuf = releasedBufObj2.writingBuf;
        } while (this._writingBuf.length);
      } catch (err3) {
        this.release(err3);
        return;
      }
    }
    if (this._fsync) {
      fs.fsyncSync(this.fd);
    }
    const len = this._len;
    if (this._reopening) {
      this._writing = false;
      this._reopening = false;
      this.reopen();
    } else if (len > this.minLength) {
      this._actualWrite();
    } else if (this._ending) {
      if (len > 0) {
        this._actualWrite();
      } else {
        this._writing = false;
        actualClose(this);
      }
    } else {
      this._writing = false;
      if (this.sync) {
        if (!this._asyncDrainScheduled) {
          this._asyncDrainScheduled = true;
          process.nextTick(emitDrain, this);
        }
      } else {
        this.emit("drain");
      }
    }
  };
  this.on("newListener", function(name) {
    if (name === "drain") {
      this._asyncDrainScheduled = false;
    }
  });
  if (this._periodicFlush !== 0) {
    this._periodicFlushTimer = setInterval(() => this.flush(null), this._periodicFlush);
    this._periodicFlushTimer.unref();
  }
}
function releaseWritingBuf(writingBuf, len, n) {
  if (typeof writingBuf === "string") {
    writingBuf = Buffer.from(writingBuf);
  }
  len = Math.max(len - n, 0);
  writingBuf = writingBuf.subarray(n);
  return { writingBuf, len };
}
function emitDrain(sonic) {
  const hasListeners = sonic.listenerCount("drain") > 0;
  if (!hasListeners) return;
  sonic._asyncDrainScheduled = false;
  sonic.emit("drain");
}
inherits(SonicBoom$1, EventEmitter$1);
function mergeBuf(bufs, len) {
  if (bufs.length === 0) {
    return kEmptyBuffer;
  }
  if (bufs.length === 1) {
    return bufs[0];
  }
  return Buffer.concat(bufs, len);
}
function write$1(data) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  data = "" + data;
  const dataLen = Buffer.byteLength(data);
  const len = this._len + dataLen;
  const bufs = this._bufs;
  if (this.maxLength && len > this.maxLength) {
    this.emit("drop", data);
    return this._len < this._hwm;
  }
  if (bufs.length === 0 || Buffer.byteLength(bufs[bufs.length - 1]) + dataLen > this.maxWrite) {
    bufs.push(data);
  } else {
    bufs[bufs.length - 1] += data;
  }
  this._len = len;
  if (!this._writing && this._len >= this.minLength) {
    this._actualWrite();
  }
  return this._len < this._hwm;
}
function writeBuffer(data) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  const len = this._len + data.length;
  const bufs = this._bufs;
  const lens = this._lens;
  if (this.maxLength && len > this.maxLength) {
    this.emit("drop", data);
    return this._len < this._hwm;
  }
  if (bufs.length === 0 || lens[lens.length - 1] + data.length > this.maxWrite) {
    bufs.push([data]);
    lens.push(data.length);
  } else {
    bufs[bufs.length - 1].push(data);
    lens[lens.length - 1] += data.length;
  }
  this._len = len;
  if (!this._writing && this._len >= this.minLength) {
    this._actualWrite();
  }
  return this._len < this._hwm;
}
function callFlushCallbackOnDrain(cb) {
  this._flushPending = true;
  const onDrain = () => {
    if (!this._fsync) {
      try {
        fs.fsync(this.fd, (err2) => {
          this._flushPending = false;
          cb(err2);
        });
      } catch (err2) {
        cb(err2);
      }
    } else {
      this._flushPending = false;
      cb();
    }
    this.off("error", onError);
  };
  const onError = (err2) => {
    this._flushPending = false;
    cb(err2);
    this.off("drain", onDrain);
  };
  this.once("drain", onDrain);
  this.once("error", onError);
}
function flush$1(cb) {
  if (cb != null && typeof cb !== "function") {
    throw new Error("flush cb must be a function");
  }
  if (this.destroyed) {
    const error = new Error("SonicBoom destroyed");
    if (cb) {
      cb(error);
      return;
    }
    throw error;
  }
  if (this.minLength <= 0) {
    cb?.();
    return;
  }
  if (cb) {
    callFlushCallbackOnDrain.call(this, cb);
  }
  if (this._writing) {
    return;
  }
  if (this._bufs.length === 0) {
    this._bufs.push("");
  }
  this._actualWrite();
}
function flushBuffer(cb) {
  if (cb != null && typeof cb !== "function") {
    throw new Error("flush cb must be a function");
  }
  if (this.destroyed) {
    const error = new Error("SonicBoom destroyed");
    if (cb) {
      cb(error);
      return;
    }
    throw error;
  }
  if (this.minLength <= 0) {
    cb?.();
    return;
  }
  if (cb) {
    callFlushCallbackOnDrain.call(this, cb);
  }
  if (this._writing) {
    return;
  }
  if (this._bufs.length === 0) {
    this._bufs.push([]);
    this._lens.push(0);
  }
  this._actualWrite();
}
SonicBoom$1.prototype.reopen = function(file) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this._opening) {
    this.once("ready", () => {
      this.reopen(file);
    });
    return;
  }
  if (this._ending) {
    return;
  }
  if (!this.file) {
    throw new Error("Unable to reopen a file descriptor, you must pass a file to SonicBoom");
  }
  if (file) {
    this.file = file;
  }
  this._reopening = true;
  if (this._writing) {
    return;
  }
  const fd = this.fd;
  this.once("ready", () => {
    if (fd !== this.fd) {
      fs.close(fd, (err2) => {
        if (err2) {
          return this.emit("error", err2);
        }
      });
    }
  });
  openFile(this.file, this);
};
SonicBoom$1.prototype.end = function() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this._opening) {
    this.once("ready", () => {
      this.end();
    });
    return;
  }
  if (this._ending) {
    return;
  }
  this._ending = true;
  if (this._writing) {
    return;
  }
  if (this._len > 0 && this.fd >= 0) {
    this._actualWrite();
  } else {
    actualClose(this);
  }
};
function flushSync() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this.fd < 0) {
    throw new Error("sonic boom is not ready yet");
  }
  if (!this._writing && this._writingBuf.length > 0) {
    this._bufs.unshift(this._writingBuf);
    this._writingBuf = "";
  }
  let buf = "";
  while (this._bufs.length || buf.length) {
    if (buf.length <= 0) {
      buf = this._bufs[0];
    }
    try {
      const n = Buffer.isBuffer(buf) ? fs.writeSync(this.fd, buf) : fs.writeSync(this.fd, buf, "utf8");
      const releasedBufObj = releaseWritingBuf(buf, this._len, n);
      buf = releasedBufObj.writingBuf;
      this._len = releasedBufObj.len;
      if (buf.length <= 0) {
        this._bufs.shift();
      }
    } catch (err2) {
      const shouldRetry = err2.code === "EAGAIN" || err2.code === "EBUSY";
      if (shouldRetry && !this.retryEAGAIN(err2, buf.length, this._len - buf.length)) {
        throw err2;
      }
      sleep(BUSY_WRITE_TIMEOUT);
    }
  }
  try {
    fs.fsyncSync(this.fd);
  } catch {
  }
}
function flushBufferSync() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this.fd < 0) {
    throw new Error("sonic boom is not ready yet");
  }
  if (!this._writing && this._writingBuf.length > 0) {
    this._bufs.unshift([this._writingBuf]);
    this._writingBuf = kEmptyBuffer;
  }
  let buf = kEmptyBuffer;
  while (this._bufs.length || buf.length) {
    if (buf.length <= 0) {
      buf = mergeBuf(this._bufs[0], this._lens[0]);
    }
    try {
      const n = fs.writeSync(this.fd, buf);
      buf = buf.subarray(n);
      this._len = Math.max(this._len - n, 0);
      if (buf.length <= 0) {
        this._bufs.shift();
        this._lens.shift();
      }
    } catch (err2) {
      const shouldRetry = err2.code === "EAGAIN" || err2.code === "EBUSY";
      if (shouldRetry && !this.retryEAGAIN(err2, buf.length, this._len - buf.length)) {
        throw err2;
      }
      sleep(BUSY_WRITE_TIMEOUT);
    }
  }
}
SonicBoom$1.prototype.destroy = function() {
  if (this.destroyed) {
    return;
  }
  actualClose(this);
};
function actualWrite() {
  const release = this.release;
  this._writing = true;
  this._writingBuf = this._writingBuf.length ? this._writingBuf : this._bufs.shift() || "";
  if (this.sync) {
    try {
      const written = Buffer.isBuffer(this._writingBuf) ? fs.writeSync(this.fd, this._writingBuf) : fs.writeSync(this.fd, this._writingBuf, "utf8");
      release(null, written);
    } catch (err2) {
      release(err2);
    }
  } else {
    fs.write(this.fd, this._writingBuf, release);
  }
}
function actualWriteBuffer() {
  const release = this.release;
  this._writing = true;
  this._writingBuf = this._writingBuf.length ? this._writingBuf : mergeBuf(this._bufs.shift(), this._lens.shift());
  if (this.sync) {
    try {
      const written = fs.writeSync(this.fd, this._writingBuf);
      release(null, written);
    } catch (err2) {
      release(err2);
    }
  } else {
    if (kCopyBuffer) {
      this._writingBuf = Buffer.from(this._writingBuf);
    }
    fs.write(this.fd, this._writingBuf, release);
  }
}
function actualClose(sonic) {
  if (sonic.fd === -1) {
    sonic.once("ready", actualClose.bind(null, sonic));
    return;
  }
  if (sonic._periodicFlushTimer !== void 0) {
    clearInterval(sonic._periodicFlushTimer);
  }
  sonic.destroyed = true;
  sonic._bufs = [];
  sonic._lens = [];
  assert(typeof sonic.fd === "number", `sonic.fd must be a number, got ${typeof sonic.fd}`);
  try {
    fs.fsync(sonic.fd, closeWrapped);
  } catch {
  }
  function closeWrapped() {
    if (sonic.fd !== 1 && sonic.fd !== 2) {
      fs.close(sonic.fd, done);
    } else {
      done();
    }
  }
  function done(err2) {
    if (err2) {
      sonic.emit("error", err2);
      return;
    }
    if (sonic._ending && !sonic._writing) {
      sonic.emit("finish");
    }
    sonic.emit("close");
  }
}
SonicBoom$1.SonicBoom = SonicBoom$1;
SonicBoom$1.default = SonicBoom$1;
var sonicBoom = SonicBoom$1;
const refs = {
  exit: [],
  beforeExit: []
};
const functions = {
  exit: onExit$1,
  beforeExit: onBeforeExit
};
let registry;
function ensureRegistry() {
  if (registry === void 0) {
    registry = new FinalizationRegistry(clear);
  }
}
function install(event) {
  if (refs[event].length > 0) {
    return;
  }
  process.on(event, functions[event]);
}
function uninstall(event) {
  if (refs[event].length > 0) {
    return;
  }
  process.removeListener(event, functions[event]);
  if (refs.exit.length === 0 && refs.beforeExit.length === 0) {
    registry = void 0;
  }
}
function onExit$1() {
  callRefs("exit");
}
function onBeforeExit() {
  callRefs("beforeExit");
}
function callRefs(event) {
  for (const ref of refs[event]) {
    const obj = ref.deref();
    const fn = ref.fn;
    if (obj !== void 0) {
      fn(obj, event);
    }
  }
  refs[event] = [];
}
function clear(ref) {
  for (const event of ["exit", "beforeExit"]) {
    const index = refs[event].indexOf(ref);
    refs[event].splice(index, index + 1);
    uninstall(event);
  }
}
function _register(event, obj, fn) {
  if (obj === void 0) {
    throw new Error("the object can't be undefined");
  }
  install(event);
  const ref = new WeakRef(obj);
  ref.fn = fn;
  ensureRegistry();
  registry.register(obj, ref);
  refs[event].push(ref);
}
function register(obj, fn) {
  _register("exit", obj, fn);
}
function registerBeforeExit(obj, fn) {
  _register("beforeExit", obj, fn);
}
function unregister(obj) {
  if (registry === void 0) {
    return;
  }
  registry.unregister(obj);
  for (const event of ["exit", "beforeExit"]) {
    refs[event] = refs[event].filter((ref) => {
      const _obj = ref.deref();
      return _obj && _obj !== obj;
    });
    uninstall(event);
  }
}
var onExitLeakFree = {
  register,
  registerBeforeExit,
  unregister
};
const version$2 = "3.2.0";
const require$$0 = {
  version: version$2
};
var wait_1;
var hasRequiredWait;
function requireWait() {
  if (hasRequiredWait) return wait_1;
  hasRequiredWait = 1;
  const MAX_TIMEOUT = 1e3;
  function wait(state, index, expected, timeout, done) {
    const max = Date.now() + timeout;
    let current = Atomics.load(state, index);
    if (current === expected) {
      done(null, "ok");
      return;
    }
    let prior = current;
    const check = (backoff) => {
      if (Date.now() > max) {
        done(null, "timed-out");
      } else {
        setTimeout(() => {
          prior = current;
          current = Atomics.load(state, index);
          if (current === prior) {
            check(backoff >= MAX_TIMEOUT ? MAX_TIMEOUT : backoff * 2);
          } else {
            if (current === expected) done(null, "ok");
            else done(null, "not-equal");
          }
        }, backoff);
      }
    };
    check(1);
  }
  function waitDiff(state, index, expected, timeout, done) {
    const max = Date.now() + timeout;
    let current = Atomics.load(state, index);
    if (current !== expected) {
      done(null, "ok");
      return;
    }
    const check = (backoff) => {
      if (Date.now() > max) {
        done(null, "timed-out");
      } else {
        setTimeout(() => {
          current = Atomics.load(state, index);
          if (current !== expected) {
            done(null, "ok");
          } else {
            check(backoff >= MAX_TIMEOUT ? MAX_TIMEOUT : backoff * 2);
          }
        }, backoff);
      }
    };
    check(1);
  }
  wait_1 = { wait, waitDiff };
  return wait_1;
}
var indexes;
var hasRequiredIndexes;
function requireIndexes() {
  if (hasRequiredIndexes) return indexes;
  hasRequiredIndexes = 1;
  const SEQ_INDEX = 2;
  const WRITE_INDEX = 4;
  const READ_INDEX = 8;
  indexes = {
    WRITE_INDEX,
    READ_INDEX,
    SEQ_INDEX
  };
  return indexes;
}
var threadStream;
var hasRequiredThreadStream;
function requireThreadStream() {
  if (hasRequiredThreadStream) return threadStream;
  hasRequiredThreadStream = 1;
  const { version: version2 } = require$$0;
  const { EventEmitter: EventEmitter2 } = require$$1;
  const { Worker } = require$$2$1;
  const { join } = require$$3;
  const { pathToFileURL } = require$$4;
  const { wait } = requireWait();
  const {
    WRITE_INDEX,
    READ_INDEX,
    SEQ_INDEX
  } = requireIndexes();
  const buffer = require$$7;
  const assert2 = require$$5;
  const kImpl = Symbol("kImpl");
  const MAX_STRING = buffer.constants.MAX_STRING_LENGTH;
  function updateState(stream, fn) {
    Atomics.add(stream[kImpl].state, SEQ_INDEX, 1);
    fn();
    Atomics.add(stream[kImpl].state, SEQ_INDEX, 1);
    Atomics.notify(stream[kImpl].state, SEQ_INDEX);
  }
  class FakeWeakRef {
    constructor(value) {
      this._value = value;
    }
    deref() {
      return this._value;
    }
  }
  class FakeFinalizationRegistry {
    register() {
    }
    unregister() {
    }
  }
  const FinalizationRegistry2 = process.env.NODE_V8_COVERAGE ? FakeFinalizationRegistry : commonjsGlobal.FinalizationRegistry || FakeFinalizationRegistry;
  const WeakRef2 = process.env.NODE_V8_COVERAGE ? FakeWeakRef : commonjsGlobal.WeakRef || FakeWeakRef;
  const registry2 = new FinalizationRegistry2((worker) => {
    if (worker.exited) {
      return;
    }
    worker.terminate();
  });
  function createWorker(stream, opts) {
    const { filename, workerData } = opts;
    const bundlerOverrides = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
    const toExecute = bundlerOverrides["thread-stream-worker"] || join(__dirname, "lib", "worker.js");
    const worker = new Worker(toExecute, {
      ...opts.workerOpts,
      trackUnmanagedFds: false,
      workerData: {
        filename: filename.indexOf("file://") === 0 ? filename : pathToFileURL(filename).href,
        dataBuf: stream[kImpl].dataBuf,
        stateBuf: stream[kImpl].stateBuf,
        workerData: {
          $context: {
            threadStreamVersion: version2
          },
          ...workerData
        }
      }
    });
    worker.stream = new FakeWeakRef(stream);
    worker.on("message", onWorkerMessage);
    worker.on("exit", onWorkerExit);
    registry2.register(stream, worker);
    return worker;
  }
  function drain(stream) {
    assert2(!stream[kImpl].sync);
    if (stream[kImpl].needDrain) {
      stream[kImpl].needDrain = false;
      stream.emit("drain");
    }
  }
  function nextFlush(stream) {
    const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
    let leftover = stream[kImpl].data.length - writeIndex;
    if (leftover > 0) {
      if (stream[kImpl].buf.length === 0) {
        stream[kImpl].flushing = false;
        if (stream[kImpl].ending) {
          end(stream);
        } else if (stream[kImpl].needDrain) {
          process.nextTick(drain, stream);
        }
        return;
      }
      let toWrite = stream[kImpl].buf.slice(0, leftover);
      let toWriteBytes = Buffer.byteLength(toWrite);
      if (toWriteBytes <= leftover) {
        stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
        write2(stream, toWrite, nextFlush.bind(null, stream));
      } else {
        stream.flush(() => {
          if (stream.destroyed) {
            return;
          }
          updateState(stream, () => {
            Atomics.store(stream[kImpl].state, READ_INDEX, 0);
            Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
          });
          Atomics.notify(stream[kImpl].state, READ_INDEX);
          while (toWriteBytes > stream[kImpl].data.length) {
            leftover = leftover / 2;
            toWrite = stream[kImpl].buf.slice(0, leftover);
            toWriteBytes = Buffer.byteLength(toWrite);
          }
          stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
          write2(stream, toWrite, nextFlush.bind(null, stream));
        });
      }
    } else if (leftover === 0) {
      if (writeIndex === 0 && stream[kImpl].buf.length === 0) {
        return;
      }
      stream.flush(() => {
        updateState(stream, () => {
          Atomics.store(stream[kImpl].state, READ_INDEX, 0);
          Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
        });
        Atomics.notify(stream[kImpl].state, READ_INDEX);
        nextFlush(stream);
      });
    } else {
      destroy(stream, new Error("overwritten"));
    }
  }
  function onWorkerMessage(msg) {
    const stream = this.stream.deref();
    if (stream === void 0) {
      this.exited = true;
      this.terminate();
      return;
    }
    if (msg?.code == null) {
      return;
    }
    switch (msg.code) {
      case "READY":
        this.stream = new WeakRef2(stream);
        stream.flush(() => {
          stream[kImpl].ready = true;
          stream.emit("ready");
        });
        break;
      case "ERROR":
        destroy(stream, msg.err);
        break;
      case "EVENT":
        if (Array.isArray(msg.args)) {
          stream.emit(msg.name, ...msg.args);
        } else {
          stream.emit(msg.name, msg.args);
        }
        break;
      case "WARNING":
        process.emitWarning(msg.err);
        break;
      default:
        destroy(stream, new Error("this should not happen: " + msg.code));
    }
  }
  function onWorkerExit(code) {
    const stream = this.stream.deref();
    if (stream === void 0) {
      return;
    }
    registry2.unregister(stream);
    stream.worker.exited = true;
    stream.worker.off("exit", onWorkerExit);
    destroy(stream, code !== 0 ? new Error("the worker thread exited") : null);
  }
  class ThreadStream extends EventEmitter2 {
    constructor(opts = {}) {
      super();
      if (opts.bufferSize < 4) {
        throw new Error("bufferSize must at least fit a 4-byte utf-8 char");
      }
      this[kImpl] = {};
      this[kImpl].stateBuf = new SharedArrayBuffer(128);
      this[kImpl].state = new Int32Array(this[kImpl].stateBuf);
      this[kImpl].dataBuf = new SharedArrayBuffer(opts.bufferSize || 4 * 1024 * 1024);
      this[kImpl].data = Buffer.from(this[kImpl].dataBuf);
      this[kImpl].sync = opts.sync || false;
      this[kImpl].ending = false;
      this[kImpl].ended = false;
      this[kImpl].needDrain = false;
      this[kImpl].destroyed = false;
      this[kImpl].flushing = false;
      this[kImpl].ready = false;
      this[kImpl].finished = false;
      this[kImpl].errored = null;
      this[kImpl].closed = false;
      this[kImpl].buf = "";
      this.worker = createWorker(this, opts);
      this.on("message", (message, transferList) => {
        this.worker.postMessage(message, transferList);
      });
    }
    write(data) {
      if (this[kImpl].destroyed) {
        error(this, new Error("the worker has exited"));
        return false;
      }
      if (this[kImpl].ending) {
        error(this, new Error("the worker is ending"));
        return false;
      }
      if (this[kImpl].flushing && this[kImpl].buf.length + data.length >= MAX_STRING) {
        try {
          writeSync(this);
          this[kImpl].flushing = true;
        } catch (err2) {
          destroy(this, err2);
          return false;
        }
      }
      this[kImpl].buf += data;
      if (this[kImpl].sync) {
        try {
          writeSync(this);
          return true;
        } catch (err2) {
          destroy(this, err2);
          return false;
        }
      }
      if (!this[kImpl].flushing) {
        this[kImpl].flushing = true;
        setImmediate(nextFlush, this);
      }
      this[kImpl].needDrain = this[kImpl].data.length - this[kImpl].buf.length - Atomics.load(this[kImpl].state, WRITE_INDEX) <= 0;
      return !this[kImpl].needDrain;
    }
    end() {
      if (this[kImpl].destroyed) {
        return;
      }
      this[kImpl].ending = true;
      end(this);
    }
    flush(cb) {
      if (this[kImpl].destroyed) {
        if (typeof cb === "function") {
          process.nextTick(cb, new Error("the worker has exited"));
        }
        return;
      }
      const writeIndex = Atomics.load(this[kImpl].state, WRITE_INDEX);
      wait(this[kImpl].state, READ_INDEX, writeIndex, Infinity, (err2, res2) => {
        if (err2) {
          destroy(this, err2);
          process.nextTick(cb, err2);
          return;
        }
        if (res2 === "not-equal") {
          this.flush(cb);
          return;
        }
        process.nextTick(cb);
      });
    }
    flushSync() {
      if (this[kImpl].destroyed) {
        return;
      }
      writeSync(this);
      flushSync2(this);
    }
    unref() {
      this.worker.unref();
    }
    ref() {
      this.worker.ref();
    }
    get ready() {
      return this[kImpl].ready;
    }
    get destroyed() {
      return this[kImpl].destroyed;
    }
    get closed() {
      return this[kImpl].closed;
    }
    get writable() {
      return !this[kImpl].destroyed && !this[kImpl].ending;
    }
    get writableEnded() {
      return this[kImpl].ending;
    }
    get writableFinished() {
      return this[kImpl].finished;
    }
    get writableNeedDrain() {
      return this[kImpl].needDrain;
    }
    get writableObjectMode() {
      return false;
    }
    get writableErrored() {
      return this[kImpl].errored;
    }
  }
  function error(stream, err2) {
    setImmediate(() => {
      stream.emit("error", err2);
    });
  }
  function destroy(stream, err2) {
    if (stream[kImpl].destroyed) {
      return;
    }
    stream[kImpl].destroyed = true;
    if (err2) {
      stream[kImpl].errored = err2;
      error(stream, err2);
    }
    if (!stream.worker.exited) {
      stream.worker.terminate().catch(() => {
      }).then(() => {
        stream[kImpl].closed = true;
        stream.emit("close");
      });
    } else {
      setImmediate(() => {
        stream[kImpl].closed = true;
        stream.emit("close");
      });
    }
  }
  function write2(stream, data, cb) {
    const current = Atomics.load(stream[kImpl].state, WRITE_INDEX);
    const length = Buffer.byteLength(data);
    stream[kImpl].data.write(data, current);
    updateState(stream, () => {
      Atomics.store(stream[kImpl].state, WRITE_INDEX, current + length);
    });
    cb();
    return true;
  }
  function end(stream) {
    if (stream[kImpl].ended || !stream[kImpl].ending || stream[kImpl].flushing) {
      return;
    }
    stream[kImpl].ended = true;
    try {
      stream.flushSync();
      let readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
      updateState(stream, () => {
        Atomics.store(stream[kImpl].state, WRITE_INDEX, -1);
      });
      let spins = 0;
      while (readIndex !== -1) {
        Atomics.wait(stream[kImpl].state, READ_INDEX, readIndex, 1e3);
        readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
        if (readIndex === -2) {
          destroy(stream, new Error("end() failed"));
          return;
        }
        if (++spins === 10) {
          destroy(stream, new Error("end() took too long (10s)"));
          return;
        }
      }
      process.nextTick(() => {
        stream[kImpl].finished = true;
        stream.emit("finish");
      });
    } catch (err2) {
      destroy(stream, err2);
    }
  }
  function writeSync(stream) {
    const cb = () => {
      if (stream[kImpl].ending) {
        end(stream);
      } else if (stream[kImpl].needDrain) {
        process.nextTick(drain, stream);
      }
    };
    stream[kImpl].flushing = false;
    while (stream[kImpl].buf.length !== 0) {
      const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
      let leftover = stream[kImpl].data.length - writeIndex;
      if (leftover === 0) {
        flushSync2(stream);
        updateState(stream, () => {
          Atomics.store(stream[kImpl].state, READ_INDEX, 0);
          Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
        });
        Atomics.notify(stream[kImpl].state, READ_INDEX);
        continue;
      } else if (leftover < 0) {
        throw new Error("overwritten");
      }
      let toWrite = stream[kImpl].buf.slice(0, leftover);
      let toWriteBytes = Buffer.byteLength(toWrite);
      if (toWriteBytes <= leftover) {
        stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
        write2(stream, toWrite, cb);
      } else {
        flushSync2(stream);
        updateState(stream, () => {
          Atomics.store(stream[kImpl].state, READ_INDEX, 0);
          Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
        });
        Atomics.notify(stream[kImpl].state, READ_INDEX);
        while (toWriteBytes > stream[kImpl].buf.length) {
          leftover = leftover / 2;
          toWrite = stream[kImpl].buf.slice(0, leftover);
          toWriteBytes = Buffer.byteLength(toWrite);
        }
        stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
        write2(stream, toWrite, cb);
      }
    }
  }
  function flushSync2(stream) {
    if (stream[kImpl].flushing) {
      throw new Error("unable to flush while flushing");
    }
    const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
    let spins = 0;
    while (true) {
      const readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
      if (readIndex === -2) {
        throw Error("_flushSync failed");
      }
      if (readIndex !== writeIndex) {
        Atomics.wait(stream[kImpl].state, READ_INDEX, readIndex, 1e3);
      } else {
        break;
      }
      if (++spins === 10) {
        throw new Error("_flushSync took too long (10s)");
      }
    }
  }
  threadStream = ThreadStream;
  return threadStream;
}
var transport_1;
var hasRequiredTransport;
function requireTransport() {
  if (hasRequiredTransport) return transport_1;
  hasRequiredTransport = 1;
  const { createRequire } = require$$0$2;
  const getCallers2 = caller$1;
  const { join, isAbsolute, sep } = require$$2$2;
  const sleep2 = requireAtomicSleep();
  const onExit2 = onExitLeakFree;
  const ThreadStream = requireThreadStream();
  function setupOnExit(stream) {
    onExit2.register(stream, autoEnd2);
    onExit2.registerBeforeExit(stream, flush2);
    stream.on("close", function() {
      onExit2.unregister(stream);
    });
  }
  function buildStream(filename, workerData, workerOpts, sync) {
    const stream = new ThreadStream({
      filename,
      workerData,
      workerOpts,
      sync
    });
    stream.on("ready", onReady);
    stream.on("close", function() {
      process.removeListener("exit", onExit3);
    });
    process.on("exit", onExit3);
    function onReady() {
      process.removeListener("exit", onExit3);
      stream.unref();
      if (workerOpts.autoEnd !== false) {
        setupOnExit(stream);
      }
    }
    function onExit3() {
      if (stream.closed) {
        return;
      }
      stream.flushSync();
      sleep2(100);
      stream.end();
    }
    return stream;
  }
  function autoEnd2(stream) {
    stream.ref();
    stream.flushSync();
    stream.end();
    stream.once("close", function() {
      stream.unref();
    });
  }
  function flush2(stream) {
    stream.flushSync();
  }
  function transport2(fullOptions) {
    const { pipeline, targets, levels: levels2, dedupe, worker = {}, caller: caller2 = getCallers2(), sync = false } = fullOptions;
    const options = {
      ...fullOptions.options
    };
    const callers = typeof caller2 === "string" ? [caller2] : caller2;
    const bundlerOverrides = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
    let target = fullOptions.target;
    if (target && targets) {
      throw new Error("only one of target or targets can be specified");
    }
    if (targets) {
      target = bundlerOverrides["pino-worker"] || join(__dirname, "worker.js");
      options.targets = targets.filter((dest) => dest.target).map((dest) => {
        return {
          ...dest,
          target: fixTarget(dest.target)
        };
      });
      options.pipelines = targets.filter((dest) => dest.pipeline).map((dest) => {
        return dest.pipeline.map((t) => {
          return {
            ...t,
            level: dest.level,
            // duplicate the pipeline `level` property defined in the upper level
            target: fixTarget(t.target)
          };
        });
      });
    } else if (pipeline) {
      target = bundlerOverrides["pino-worker"] || join(__dirname, "worker.js");
      options.pipelines = [pipeline.map((dest) => {
        return {
          ...dest,
          target: fixTarget(dest.target)
        };
      })];
    }
    if (levels2) {
      options.levels = levels2;
    }
    if (dedupe) {
      options.dedupe = dedupe;
    }
    options.pinoWillSendConfig = true;
    return buildStream(fixTarget(target), options, worker, sync);
    function fixTarget(origin) {
      origin = bundlerOverrides[origin] || origin;
      if (isAbsolute(origin) || origin.indexOf("file://") === 0) {
        return origin;
      }
      if (origin === "pino/file") {
        return join(__dirname, "..", "file.js");
      }
      let fixTarget2;
      for (const filePath of callers) {
        try {
          const context = filePath === "node:repl" ? process.cwd() + sep : filePath;
          fixTarget2 = createRequire(context).resolve(origin);
          break;
        } catch (err2) {
          continue;
        }
      }
      if (!fixTarget2) {
        throw new Error(`unable to determine transport target for "${origin}"`);
      }
      return fixTarget2;
    }
  }
  transport_1 = transport2;
  return transport_1;
}
const diagChan = require$$0$3;
const format = quickFormatUnescaped;
const { mapHttpRequest, mapHttpResponse } = pinoStdSerializers;
const SonicBoom = sonicBoom;
const onExit = onExitLeakFree;
const {
  lsCacheSym: lsCacheSym$2,
  chindingsSym: chindingsSym$2,
  writeSym: writeSym$1,
  serializersSym: serializersSym$2,
  formatOptsSym: formatOptsSym$2,
  endSym: endSym$1,
  stringifiersSym: stringifiersSym$2,
  stringifySym: stringifySym$2,
  stringifySafeSym: stringifySafeSym$1,
  wildcardFirstSym,
  nestedKeySym: nestedKeySym$1,
  formattersSym: formattersSym$3,
  messageKeySym: messageKeySym$2,
  errorKeySym: errorKeySym$2,
  nestedKeyStrSym: nestedKeyStrSym$1,
  msgPrefixSym: msgPrefixSym$2
} = symbols$1;
const { isMainThread } = require$$2$1;
const transport = requireTransport();
let asJsonChan;
if (typeof diagChan.tracingChannel === "function") {
  asJsonChan = diagChan.tracingChannel("pino_asJson");
} else {
  asJsonChan = {
    hasSubscribers: false,
    traceSync(fn, store, thisArg, ...args) {
      return fn.call(thisArg, ...args);
    }
  };
}
function noop$3() {
}
function genLog$1(level, hook) {
  if (!hook) return LOG;
  return function hookWrappedLog(...args) {
    hook.call(this, args, LOG, level);
  };
  function LOG(o, ...n) {
    if (typeof o === "object") {
      let msg = o;
      if (o !== null) {
        if (o.method && o.headers && o.socket) {
          o = mapHttpRequest(o);
        } else if (typeof o.setHeader === "function") {
          o = mapHttpResponse(o);
        }
      }
      let formatParams;
      if (msg === null && n.length === 0) {
        formatParams = [null];
      } else {
        msg = n.shift();
        formatParams = n;
      }
      if (typeof this[msgPrefixSym$2] === "string" && msg !== void 0 && msg !== null) {
        msg = this[msgPrefixSym$2] + msg;
      }
      this[writeSym$1](o, format(msg, formatParams, this[formatOptsSym$2]), level);
    } else {
      let msg = o === void 0 ? n.shift() : o;
      if (typeof this[msgPrefixSym$2] === "string" && msg !== void 0 && msg !== null) {
        msg = this[msgPrefixSym$2] + msg;
      }
      this[writeSym$1](null, format(msg, n, this[formatOptsSym$2]), level);
    }
  }
}
function asString(str) {
  let result = "";
  let last = 0;
  let found = false;
  let point = 255;
  const l = str.length;
  if (l > 100) {
    return JSON.stringify(str);
  }
  for (var i = 0; i < l && point >= 32; i++) {
    point = str.charCodeAt(i);
    if (point === 34 || point === 92) {
      result += str.slice(last, i) + "\\";
      last = i;
      found = true;
    }
  }
  if (!found) {
    result = str;
  } else {
    result += str.slice(last);
  }
  return point < 32 ? JSON.stringify(str) : '"' + result + '"';
}
function asJson$1(obj, msg, num, time2) {
  if (asJsonChan.hasSubscribers === false) {
    return _asJson.call(this, obj, msg, num, time2);
  }
  const store = { instance: this, arguments };
  return asJsonChan.traceSync(_asJson, store, this, obj, msg, num, time2);
}
function _asJson(obj, msg, num, time2) {
  const stringify2 = this[stringifySym$2];
  const stringifySafe = this[stringifySafeSym$1];
  const stringifiers = this[stringifiersSym$2];
  const end = this[endSym$1];
  const chindings = this[chindingsSym$2];
  const serializers2 = this[serializersSym$2];
  const formatters = this[formattersSym$3];
  const messageKey = this[messageKeySym$2];
  const errorKey = this[errorKeySym$2];
  let data = this[lsCacheSym$2][num] + time2;
  data = data + chindings;
  let value;
  if (formatters.log) {
    obj = formatters.log(obj);
  }
  const wildcardStringifier = stringifiers[wildcardFirstSym];
  let propStr = "";
  for (const key in obj) {
    value = obj[key];
    if (Object.prototype.hasOwnProperty.call(obj, key) && value !== void 0) {
      if (serializers2[key]) {
        value = serializers2[key](value);
      } else if (key === errorKey && serializers2.err) {
        value = serializers2.err(value);
      }
      const stringifier = stringifiers[key] || wildcardStringifier;
      switch (typeof value) {
        case "undefined":
        case "function":
          continue;
        case "number":
          if (Number.isFinite(value) === false) {
            value = null;
          }
        case "boolean":
          if (stringifier) value = stringifier(value);
          break;
        case "string":
          value = (stringifier || asString)(value);
          break;
        default:
          value = (stringifier || stringify2)(value, stringifySafe);
      }
      if (value === void 0) continue;
      const strKey = asString(key);
      propStr += "," + strKey + ":" + value;
    }
  }
  let msgStr = "";
  if (msg !== void 0) {
    value = serializers2[messageKey] ? serializers2[messageKey](msg) : msg;
    const stringifier = stringifiers[messageKey] || wildcardStringifier;
    switch (typeof value) {
      case "function":
        break;
      case "number":
        if (Number.isFinite(value) === false) {
          value = null;
        }
      case "boolean":
        if (stringifier) value = stringifier(value);
        msgStr = ',"' + messageKey + '":' + value;
        break;
      case "string":
        value = (stringifier || asString)(value);
        msgStr = ',"' + messageKey + '":' + value;
        break;
      default:
        value = (stringifier || stringify2)(value, stringifySafe);
        msgStr = ',"' + messageKey + '":' + value;
    }
  }
  if (this[nestedKeySym$1] && propStr) {
    return data + this[nestedKeyStrSym$1] + propStr.slice(1) + "}" + msgStr + end;
  } else {
    return data + propStr + msgStr + end;
  }
}
function asChindings$2(instance, bindings2) {
  let value;
  let data = instance[chindingsSym$2];
  const stringify2 = instance[stringifySym$2];
  const stringifySafe = instance[stringifySafeSym$1];
  const stringifiers = instance[stringifiersSym$2];
  const wildcardStringifier = stringifiers[wildcardFirstSym];
  const serializers2 = instance[serializersSym$2];
  const formatter = instance[formattersSym$3].bindings;
  bindings2 = formatter(bindings2);
  for (const key in bindings2) {
    value = bindings2[key];
    const valid = (key.length < 5 || key !== "level" && key !== "serializers" && key !== "formatters" && key !== "customLevels") && bindings2.hasOwnProperty(key) && value !== void 0;
    if (valid === true) {
      value = serializers2[key] ? serializers2[key](value) : value;
      value = (stringifiers[key] || wildcardStringifier || stringify2)(value, stringifySafe);
      if (value === void 0) continue;
      data += ',"' + key + '":' + value;
    }
  }
  return data;
}
function hasBeenTampered(stream) {
  return stream.write !== stream.constructor.prototype.write;
}
function buildSafeSonicBoom$1(opts) {
  const stream = new SonicBoom(opts);
  stream.on("error", filterBrokenPipe);
  if (!opts.sync && isMainThread) {
    onExit.register(stream, autoEnd);
    stream.on("close", function() {
      onExit.unregister(stream);
    });
  }
  return stream;
  function filterBrokenPipe(err2) {
    if (err2.code === "EPIPE") {
      stream.write = noop$3;
      stream.end = noop$3;
      stream.flushSync = noop$3;
      stream.destroy = noop$3;
      return;
    }
    stream.removeListener("error", filterBrokenPipe);
    stream.emit("error", err2);
  }
}
function autoEnd(stream, eventName) {
  if (stream.destroyed) {
    return;
  }
  if (eventName === "beforeExit") {
    stream.flush();
    stream.on("drain", function() {
      stream.end();
    });
  } else {
    stream.flushSync();
  }
}
function createArgsNormalizer$1(defaultOptions2) {
  return function normalizeArgs(instance, caller2, opts = {}, stream) {
    if (typeof opts === "string") {
      stream = buildSafeSonicBoom$1({ dest: opts });
      opts = {};
    } else if (typeof stream === "string") {
      if (opts && opts.transport) {
        throw Error("only one of option.transport or stream can be specified");
      }
      stream = buildSafeSonicBoom$1({ dest: stream });
    } else if (opts instanceof SonicBoom || opts.writable || opts._writableState) {
      stream = opts;
      opts = {};
    } else if (opts.transport) {
      if (opts.transport instanceof SonicBoom || opts.transport.writable || opts.transport._writableState) {
        throw Error("option.transport do not allow stream, please pass to option directly. e.g. pino(transport)");
      }
      if (opts.transport.targets && opts.transport.targets.length && opts.formatters && typeof opts.formatters.level === "function") {
        throw Error("option.transport.targets do not allow custom level formatters");
      }
      let customLevels;
      if (opts.customLevels) {
        customLevels = opts.useOnlyCustomLevels ? opts.customLevels : Object.assign({}, opts.levels, opts.customLevels);
      }
      stream = transport({ caller: caller2, ...opts.transport, levels: customLevels });
    }
    opts = Object.assign({}, defaultOptions2, opts);
    opts.serializers = Object.assign({}, defaultOptions2.serializers, opts.serializers);
    opts.formatters = Object.assign({}, defaultOptions2.formatters, opts.formatters);
    if (opts.prettyPrint) {
      throw new Error("prettyPrint option is no longer supported, see the pino-pretty package (https://github.com/pinojs/pino-pretty)");
    }
    const { enabled, onChild } = opts;
    if (enabled === false) opts.level = "silent";
    if (!onChild) opts.onChild = noop$3;
    if (!stream) {
      if (!hasBeenTampered(process.stdout)) {
        stream = buildSafeSonicBoom$1({ fd: process.stdout.fd || 1 });
      } else {
        stream = process.stdout;
      }
    }
    return { opts, stream };
  };
}
function stringify$2(obj, stringifySafeFn) {
  try {
    return JSON.stringify(obj);
  } catch (_) {
    try {
      const stringify2 = stringifySafeFn || this[stringifySafeSym$1];
      return stringify2(obj);
    } catch (_2) {
      return '"[unable to serialize, circular reference is too complex to analyze]"';
    }
  }
}
function buildFormatters$2(level, bindings2, log) {
  return {
    level,
    bindings: bindings2,
    log
  };
}
function normalizeDestFileDescriptor$1(destination) {
  const fd = Number(destination);
  if (typeof destination === "string" && Number.isFinite(fd)) {
    return fd;
  }
  if (destination === void 0) {
    return 1;
  }
  return destination;
}
var tools = {
  noop: noop$3,
  buildSafeSonicBoom: buildSafeSonicBoom$1,
  asChindings: asChindings$2,
  asJson: asJson$1,
  genLog: genLog$1,
  createArgsNormalizer: createArgsNormalizer$1,
  stringify: stringify$2,
  buildFormatters: buildFormatters$2,
  normalizeDestFileDescriptor: normalizeDestFileDescriptor$1
};
const DEFAULT_LEVELS$2 = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};
const SORTING_ORDER$2 = {
  ASC: "ASC",
  DESC: "DESC"
};
var constants = {
  DEFAULT_LEVELS: DEFAULT_LEVELS$2,
  SORTING_ORDER: SORTING_ORDER$2
};
const {
  lsCacheSym: lsCacheSym$1,
  levelValSym: levelValSym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$2,
  streamSym: streamSym$2,
  formattersSym: formattersSym$2,
  hooksSym: hooksSym$2,
  levelCompSym: levelCompSym$1
} = symbols$1;
const { noop: noop$2, genLog } = tools;
const { DEFAULT_LEVELS: DEFAULT_LEVELS$1, SORTING_ORDER: SORTING_ORDER$1 } = constants;
const levelMethods = {
  fatal: (hook) => {
    const logFatal = genLog(DEFAULT_LEVELS$1.fatal, hook);
    return function(...args) {
      const stream = this[streamSym$2];
      logFatal.call(this, ...args);
      if (typeof stream.flushSync === "function") {
        try {
          stream.flushSync();
        } catch (e) {
        }
      }
    };
  },
  error: (hook) => genLog(DEFAULT_LEVELS$1.error, hook),
  warn: (hook) => genLog(DEFAULT_LEVELS$1.warn, hook),
  info: (hook) => genLog(DEFAULT_LEVELS$1.info, hook),
  debug: (hook) => genLog(DEFAULT_LEVELS$1.debug, hook),
  trace: (hook) => genLog(DEFAULT_LEVELS$1.trace, hook)
};
const nums = Object.keys(DEFAULT_LEVELS$1).reduce((o, k) => {
  o[DEFAULT_LEVELS$1[k]] = k;
  return o;
}, {});
const initialLsCache$1 = Object.keys(nums).reduce((o, k) => {
  o[k] = '{"level":' + Number(k);
  return o;
}, {});
function genLsCache$2(instance) {
  const formatter = instance[formattersSym$2].level;
  const { labels } = instance.levels;
  const cache = {};
  for (const label in labels) {
    const level = formatter(labels[label], Number(label));
    cache[label] = JSON.stringify(level).slice(0, -1);
  }
  instance[lsCacheSym$1] = cache;
  return instance;
}
function isStandardLevel(level, useOnlyCustomLevels) {
  if (useOnlyCustomLevels) {
    return false;
  }
  switch (level) {
    case "fatal":
    case "error":
    case "warn":
    case "info":
    case "debug":
    case "trace":
      return true;
    default:
      return false;
  }
}
function setLevel$1(level) {
  const { labels, values } = this.levels;
  if (typeof level === "number") {
    if (labels[level] === void 0) throw Error("unknown level value" + level);
    level = labels[level];
  }
  if (values[level] === void 0) throw Error("unknown level " + level);
  const preLevelVal = this[levelValSym$1];
  const levelVal = this[levelValSym$1] = values[level];
  const useOnlyCustomLevelsVal = this[useOnlyCustomLevelsSym$2];
  const levelComparison = this[levelCompSym$1];
  const hook = this[hooksSym$2].logMethod;
  for (const key in values) {
    if (levelComparison(values[key], levelVal) === false) {
      this[key] = noop$2;
      continue;
    }
    this[key] = isStandardLevel(key, useOnlyCustomLevelsVal) ? levelMethods[key](hook) : genLog(values[key], hook);
  }
  this.emit(
    "level-change",
    level,
    levelVal,
    labels[preLevelVal],
    preLevelVal,
    this
  );
}
function getLevel$1(level) {
  const { levels: levels2, levelVal } = this;
  return levels2 && levels2.labels ? levels2.labels[levelVal] : "";
}
function isLevelEnabled$1(logLevel) {
  const { values } = this.levels;
  const logLevelVal = values[logLevel];
  return logLevelVal !== void 0 && this[levelCompSym$1](logLevelVal, this[levelValSym$1]);
}
function compareLevel(direction, current, expected) {
  if (direction === SORTING_ORDER$1.DESC) {
    return current <= expected;
  }
  return current >= expected;
}
function genLevelComparison$1(levelComparison) {
  if (typeof levelComparison === "string") {
    return compareLevel.bind(null, levelComparison);
  }
  return levelComparison;
}
function mappings$2(customLevels = null, useOnlyCustomLevels = false) {
  const customNums = customLevels ? Object.keys(customLevels).reduce((o, k) => {
    o[customLevels[k]] = k;
    return o;
  }, {}) : null;
  const labels = Object.assign(
    Object.create(Object.prototype, { Infinity: { value: "silent" } }),
    useOnlyCustomLevels ? null : nums,
    customNums
  );
  const values = Object.assign(
    Object.create(Object.prototype, { silent: { value: Infinity } }),
    useOnlyCustomLevels ? null : DEFAULT_LEVELS$1,
    customLevels
  );
  return { labels, values };
}
function assertDefaultLevelFound$1(defaultLevel, customLevels, useOnlyCustomLevels) {
  if (typeof defaultLevel === "number") {
    const values = [].concat(
      Object.keys(customLevels || {}).map((key) => customLevels[key]),
      useOnlyCustomLevels ? [] : Object.keys(nums).map((level) => +level),
      Infinity
    );
    if (!values.includes(defaultLevel)) {
      throw Error(`default level:${defaultLevel} must be included in custom levels`);
    }
    return;
  }
  const labels = Object.assign(
    Object.create(Object.prototype, { silent: { value: Infinity } }),
    useOnlyCustomLevels ? null : DEFAULT_LEVELS$1,
    customLevels
  );
  if (!(defaultLevel in labels)) {
    throw Error(`default level:${defaultLevel} must be included in custom levels`);
  }
}
function assertNoLevelCollisions$1(levels2, customLevels) {
  const { labels, values } = levels2;
  for (const k in customLevels) {
    if (k in values) {
      throw Error("levels cannot be overridden");
    }
    if (customLevels[k] in labels) {
      throw Error("pre-existing level values cannot be used for new levels");
    }
  }
}
function assertLevelComparison$1(levelComparison) {
  if (typeof levelComparison === "function") {
    return;
  }
  if (typeof levelComparison === "string" && Object.values(SORTING_ORDER$1).includes(levelComparison)) {
    return;
  }
  throw new Error('Levels comparison should be one of "ASC", "DESC" or "function" type');
}
var levels = {
  initialLsCache: initialLsCache$1,
  genLsCache: genLsCache$2,
  getLevel: getLevel$1,
  setLevel: setLevel$1,
  isLevelEnabled: isLevelEnabled$1,
  mappings: mappings$2,
  assertNoLevelCollisions: assertNoLevelCollisions$1,
  assertDefaultLevelFound: assertDefaultLevelFound$1,
  genLevelComparison: genLevelComparison$1,
  assertLevelComparison: assertLevelComparison$1
};
var meta = { version: "9.14.0" };
const { EventEmitter } = require$$0$4;
const {
  lsCacheSym,
  levelValSym,
  setLevelSym: setLevelSym$1,
  getLevelSym,
  chindingsSym: chindingsSym$1,
  parsedChindingsSym,
  mixinSym: mixinSym$1,
  asJsonSym,
  writeSym,
  mixinMergeStrategySym: mixinMergeStrategySym$1,
  timeSym: timeSym$1,
  timeSliceIndexSym: timeSliceIndexSym$1,
  streamSym: streamSym$1,
  serializersSym: serializersSym$1,
  formattersSym: formattersSym$1,
  errorKeySym: errorKeySym$1,
  messageKeySym: messageKeySym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$1,
  needsMetadataGsym,
  redactFmtSym: redactFmtSym$1,
  stringifySym: stringifySym$1,
  formatOptsSym: formatOptsSym$1,
  stringifiersSym: stringifiersSym$1,
  msgPrefixSym: msgPrefixSym$1,
  hooksSym: hooksSym$1
} = symbols$1;
const {
  getLevel,
  setLevel,
  isLevelEnabled,
  mappings: mappings$1,
  initialLsCache,
  genLsCache: genLsCache$1,
  assertNoLevelCollisions
} = levels;
const {
  asChindings: asChindings$1,
  asJson,
  buildFormatters: buildFormatters$1,
  stringify: stringify$1,
  noop: noop$1
} = tools;
const {
  version: version$1
} = meta;
const redaction$1 = redaction_1;
const constructor = class Pino {
};
const prototype = {
  constructor,
  child,
  bindings,
  setBindings,
  flush,
  isLevelEnabled,
  version: version$1,
  get level() {
    return this[getLevelSym]();
  },
  set level(lvl) {
    this[setLevelSym$1](lvl);
  },
  get levelVal() {
    return this[levelValSym];
  },
  set levelVal(n) {
    throw Error("levelVal is read-only");
  },
  get msgPrefix() {
    return this[msgPrefixSym$1];
  },
  get [Symbol.toStringTag]() {
    return "Pino";
  },
  [lsCacheSym]: initialLsCache,
  [writeSym]: write,
  [asJsonSym]: asJson,
  [getLevelSym]: getLevel,
  [setLevelSym$1]: setLevel
};
Object.setPrototypeOf(prototype, EventEmitter.prototype);
var proto$1 = function() {
  return Object.create(prototype);
};
const resetChildingsFormatter = (bindings2) => bindings2;
function child(bindings2, options) {
  if (!bindings2) {
    throw Error("missing bindings for child Pino");
  }
  const serializers2 = this[serializersSym$1];
  const formatters = this[formattersSym$1];
  const instance = Object.create(this);
  if (options == null) {
    if (instance[formattersSym$1].bindings !== resetChildingsFormatter) {
      instance[formattersSym$1] = buildFormatters$1(
        formatters.level,
        resetChildingsFormatter,
        formatters.log
      );
    }
    instance[chindingsSym$1] = asChindings$1(instance, bindings2);
    instance[setLevelSym$1](this.level);
    if (this.onChild !== noop$1) {
      this.onChild(instance);
    }
    return instance;
  }
  if (options.hasOwnProperty("serializers") === true) {
    instance[serializersSym$1] = /* @__PURE__ */ Object.create(null);
    for (const k in serializers2) {
      instance[serializersSym$1][k] = serializers2[k];
    }
    const parentSymbols = Object.getOwnPropertySymbols(serializers2);
    for (var i = 0; i < parentSymbols.length; i++) {
      const ks = parentSymbols[i];
      instance[serializersSym$1][ks] = serializers2[ks];
    }
    for (const bk in options.serializers) {
      instance[serializersSym$1][bk] = options.serializers[bk];
    }
    const bindingsSymbols = Object.getOwnPropertySymbols(options.serializers);
    for (var bi = 0; bi < bindingsSymbols.length; bi++) {
      const bks = bindingsSymbols[bi];
      instance[serializersSym$1][bks] = options.serializers[bks];
    }
  } else instance[serializersSym$1] = serializers2;
  if (options.hasOwnProperty("formatters")) {
    const { level, bindings: chindings, log } = options.formatters;
    instance[formattersSym$1] = buildFormatters$1(
      level || formatters.level,
      chindings || resetChildingsFormatter,
      log || formatters.log
    );
  } else {
    instance[formattersSym$1] = buildFormatters$1(
      formatters.level,
      resetChildingsFormatter,
      formatters.log
    );
  }
  if (options.hasOwnProperty("customLevels") === true) {
    assertNoLevelCollisions(this.levels, options.customLevels);
    instance.levels = mappings$1(options.customLevels, instance[useOnlyCustomLevelsSym$1]);
    genLsCache$1(instance);
  }
  if (typeof options.redact === "object" && options.redact !== null || Array.isArray(options.redact)) {
    instance.redact = options.redact;
    const stringifiers = redaction$1(instance.redact, stringify$1);
    const formatOpts = { stringify: stringifiers[redactFmtSym$1] };
    instance[stringifySym$1] = stringify$1;
    instance[stringifiersSym$1] = stringifiers;
    instance[formatOptsSym$1] = formatOpts;
  }
  if (typeof options.msgPrefix === "string") {
    instance[msgPrefixSym$1] = (this[msgPrefixSym$1] || "") + options.msgPrefix;
  }
  instance[chindingsSym$1] = asChindings$1(instance, bindings2);
  const childLevel = options.level || this.level;
  instance[setLevelSym$1](childLevel);
  this.onChild(instance);
  return instance;
}
function bindings() {
  const chindings = this[chindingsSym$1];
  const chindingsJson = `{${chindings.substr(1)}}`;
  const bindingsFromJson = JSON.parse(chindingsJson);
  delete bindingsFromJson.pid;
  delete bindingsFromJson.hostname;
  return bindingsFromJson;
}
function setBindings(newBindings) {
  const chindings = asChindings$1(this, newBindings);
  this[chindingsSym$1] = chindings;
  delete this[parsedChindingsSym];
}
function defaultMixinMergeStrategy(mergeObject, mixinObject) {
  return Object.assign(mixinObject, mergeObject);
}
function write(_obj, msg, num) {
  const t = this[timeSym$1]();
  const mixin = this[mixinSym$1];
  const errorKey = this[errorKeySym$1];
  const messageKey = this[messageKeySym$1];
  const mixinMergeStrategy = this[mixinMergeStrategySym$1] || defaultMixinMergeStrategy;
  let obj;
  const streamWriteHook = this[hooksSym$1].streamWrite;
  if (_obj === void 0 || _obj === null) {
    obj = {};
  } else if (_obj instanceof Error) {
    obj = { [errorKey]: _obj };
    if (msg === void 0) {
      msg = _obj.message;
    }
  } else {
    obj = _obj;
    if (msg === void 0 && _obj[messageKey] === void 0 && _obj[errorKey]) {
      msg = _obj[errorKey].message;
    }
  }
  if (mixin) {
    obj = mixinMergeStrategy(obj, mixin(obj, num, this));
  }
  const s = this[asJsonSym](obj, msg, num, t);
  const stream = this[streamSym$1];
  if (stream[needsMetadataGsym] === true) {
    stream.lastLevel = num;
    stream.lastObj = obj;
    stream.lastMsg = msg;
    stream.lastTime = t.slice(this[timeSliceIndexSym$1]);
    stream.lastLogger = this;
  }
  stream.write(streamWriteHook ? streamWriteHook(s) : s);
}
function flush(cb) {
  if (cb != null && typeof cb !== "function") {
    throw Error("callback must be a function");
  }
  const stream = this[streamSym$1];
  if (typeof stream.flush === "function") {
    stream.flush(cb || noop$1);
  } else if (cb) cb();
}
var safeStableStringify = { exports: {} };
(function(module2, exports2) {
  const { hasOwnProperty } = Object.prototype;
  const stringify2 = configure2();
  stringify2.configure = configure2;
  stringify2.stringify = stringify2;
  stringify2.default = stringify2;
  exports2.stringify = stringify2;
  exports2.configure = configure2;
  module2.exports = stringify2;
  const strEscapeSequencesRegExp = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  function strEscape(str) {
    if (str.length < 5e3 && !strEscapeSequencesRegExp.test(str)) {
      return `"${str}"`;
    }
    return JSON.stringify(str);
  }
  function sort(array, comparator) {
    if (array.length > 200 || comparator) {
      return array.sort(comparator);
    }
    for (let i = 1; i < array.length; i++) {
      const currentValue = array[i];
      let position = i;
      while (position !== 0 && array[position - 1] > currentValue) {
        array[position] = array[position - 1];
        position--;
      }
      array[position] = currentValue;
    }
    return array;
  }
  const typedArrayPrototypeGetSymbolToStringTag = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        new Int8Array()
      )
    ),
    Symbol.toStringTag
  ).get;
  function isTypedArrayWithEntries(value) {
    return typedArrayPrototypeGetSymbolToStringTag.call(value) !== void 0 && value.length !== 0;
  }
  function stringifyTypedArray(array, separator, maximumBreadth) {
    if (array.length < maximumBreadth) {
      maximumBreadth = array.length;
    }
    const whitespace = separator === "," ? "" : " ";
    let res2 = `"0":${whitespace}${array[0]}`;
    for (let i = 1; i < maximumBreadth; i++) {
      res2 += `${separator}"${i}":${whitespace}${array[i]}`;
    }
    return res2;
  }
  function getCircularValueOption(options) {
    if (hasOwnProperty.call(options, "circularValue")) {
      const circularValue = options.circularValue;
      if (typeof circularValue === "string") {
        return `"${circularValue}"`;
      }
      if (circularValue == null) {
        return circularValue;
      }
      if (circularValue === Error || circularValue === TypeError) {
        return {
          toString() {
            throw new TypeError("Converting circular structure to JSON");
          }
        };
      }
      throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
    }
    return '"[Circular]"';
  }
  function getDeterministicOption(options) {
    let value;
    if (hasOwnProperty.call(options, "deterministic")) {
      value = options.deterministic;
      if (typeof value !== "boolean" && typeof value !== "function") {
        throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
      }
    }
    return value === void 0 ? true : value;
  }
  function getBooleanOption(options, key) {
    let value;
    if (hasOwnProperty.call(options, key)) {
      value = options[key];
      if (typeof value !== "boolean") {
        throw new TypeError(`The "${key}" argument must be of type boolean`);
      }
    }
    return value === void 0 ? true : value;
  }
  function getPositiveIntegerOption(options, key) {
    let value;
    if (hasOwnProperty.call(options, key)) {
      value = options[key];
      if (typeof value !== "number") {
        throw new TypeError(`The "${key}" argument must be of type number`);
      }
      if (!Number.isInteger(value)) {
        throw new TypeError(`The "${key}" argument must be an integer`);
      }
      if (value < 1) {
        throw new RangeError(`The "${key}" argument must be >= 1`);
      }
    }
    return value === void 0 ? Infinity : value;
  }
  function getItemCount(number) {
    if (number === 1) {
      return "1 item";
    }
    return `${number} items`;
  }
  function getUniqueReplacerSet(replacerArray) {
    const replacerSet = /* @__PURE__ */ new Set();
    for (const value of replacerArray) {
      if (typeof value === "string" || typeof value === "number") {
        replacerSet.add(String(value));
      }
    }
    return replacerSet;
  }
  function getStrictOption(options) {
    if (hasOwnProperty.call(options, "strict")) {
      const value = options.strict;
      if (typeof value !== "boolean") {
        throw new TypeError('The "strict" argument must be of type boolean');
      }
      if (value) {
        return (value2) => {
          let message = `Object can not safely be stringified. Received type ${typeof value2}`;
          if (typeof value2 !== "function") message += ` (${value2.toString()})`;
          throw new Error(message);
        };
      }
    }
  }
  function configure2(options) {
    options = { ...options };
    const fail = getStrictOption(options);
    if (fail) {
      if (options.bigint === void 0) {
        options.bigint = false;
      }
      if (!("circularValue" in options)) {
        options.circularValue = Error;
      }
    }
    const circularValue = getCircularValueOption(options);
    const bigint = getBooleanOption(options, "bigint");
    const deterministic = getDeterministicOption(options);
    const comparator = typeof deterministic === "function" ? deterministic : void 0;
    const maximumDepth = getPositiveIntegerOption(options, "maximumDepth");
    const maximumBreadth = getPositiveIntegerOption(options, "maximumBreadth");
    function stringifyFnReplacer(key, parent, stack, replacer, spacer, indentation) {
      let value = parent[key];
      if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
        value = value.toJSON(key);
      }
      value = replacer.call(parent, key, value);
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          let res2 = "";
          let join = ",";
          const originalIndentation = indentation;
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            if (spacer !== "") {
              indentation += spacer;
              res2 += `
${indentation}`;
              join = `,
${indentation}`;
            }
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += join;
            }
            const tmp = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            if (spacer !== "") {
              res2 += `
${originalIndentation}`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          let whitespace = "";
          let separator = "";
          if (spacer !== "") {
            indentation += spacer;
            join = `,
${indentation}`;
            whitespace = " ";
          }
          const maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (deterministic && !isTypedArrayWithEntries(value)) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifyFnReplacer(key2, value, stack, replacer, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
              separator = join;
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...":${whitespace}"${getItemCount(removedKeys)} not stringified"`;
            separator = join;
          }
          if (spacer !== "" && separator.length > 1) {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifyArrayReplacer(key, value, stack, replacer, spacer, indentation) {
      if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
        value = value.toJSON(key);
      }
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          const originalIndentation = indentation;
          let res2 = "";
          let join = ",";
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            if (spacer !== "") {
              indentation += spacer;
              res2 += `
${indentation}`;
              join = `,
${indentation}`;
            }
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += join;
            }
            const tmp = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `${join}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            if (spacer !== "") {
              res2 += `
${originalIndentation}`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          stack.push(value);
          let whitespace = "";
          if (spacer !== "") {
            indentation += spacer;
            join = `,
${indentation}`;
            whitespace = " ";
          }
          let separator = "";
          for (const key2 of replacer) {
            const tmp = stringifyArrayReplacer(key2, value[key2], stack, replacer, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
              separator = join;
            }
          }
          if (spacer !== "" && separator.length > 1) {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifyIndent(key, value, stack, spacer, indentation) {
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (typeof value.toJSON === "function") {
            value = value.toJSON(key);
            if (typeof value !== "object") {
              return stringifyIndent(key, value, stack, spacer, indentation);
            }
            if (value === null) {
              return "null";
            }
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          const originalIndentation = indentation;
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            indentation += spacer;
            let res3 = `
${indentation}`;
            const join2 = `,
${indentation}`;
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyIndent(String(i), value[i], stack, spacer, indentation);
              res3 += tmp2 !== void 0 ? tmp2 : "null";
              res3 += join2;
            }
            const tmp = stringifyIndent(String(i), value[i], stack, spacer, indentation);
            res3 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res3 += `${join2}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            res3 += `
${originalIndentation}`;
            stack.pop();
            return `[${res3}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          indentation += spacer;
          const join = `,
${indentation}`;
          let res2 = "";
          let separator = "";
          let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (isTypedArrayWithEntries(value)) {
            res2 += stringifyTypedArray(value, join, maximumBreadth);
            keys = keys.slice(value.length);
            maximumPropertiesToStringify -= value.length;
            separator = join;
          }
          if (deterministic) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifyIndent(key2, value[key2], stack, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}: ${tmp}`;
              separator = join;
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...": "${getItemCount(removedKeys)} not stringified"`;
            separator = join;
          }
          if (separator !== "") {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifySimple(key, value, stack) {
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (typeof value.toJSON === "function") {
            value = value.toJSON(key);
            if (typeof value !== "object") {
              return stringifySimple(key, value, stack);
            }
            if (value === null) {
              return "null";
            }
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          let res2 = "";
          const hasLength = value.length !== void 0;
          if (hasLength && Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifySimple(String(i), value[i], stack);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += ",";
            }
            const tmp = stringifySimple(String(i), value[i], stack);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `,"... ${getItemCount(removedKeys)} not stringified"`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          let separator = "";
          let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (hasLength && isTypedArrayWithEntries(value)) {
            res2 += stringifyTypedArray(value, ",", maximumBreadth);
            keys = keys.slice(value.length);
            maximumPropertiesToStringify -= value.length;
            separator = ",";
          }
          if (deterministic) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifySimple(key2, value[key2], stack);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${tmp}`;
              separator = ",";
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...":"${getItemCount(removedKeys)} not stringified"`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringify3(value, replacer, space) {
      if (arguments.length > 1) {
        let spacer = "";
        if (typeof space === "number") {
          spacer = " ".repeat(Math.min(space, 10));
        } else if (typeof space === "string") {
          spacer = space.slice(0, 10);
        }
        if (replacer != null) {
          if (typeof replacer === "function") {
            return stringifyFnReplacer("", { "": value }, [], replacer, spacer, "");
          }
          if (Array.isArray(replacer)) {
            return stringifyArrayReplacer("", value, [], getUniqueReplacerSet(replacer), spacer, "");
          }
        }
        if (spacer.length !== 0) {
          return stringifyIndent("", value, [], spacer, "");
        }
      }
      return stringifySimple("", value, []);
    }
    return stringify3;
  }
})(safeStableStringify, safeStableStringify.exports);
var safeStableStringifyExports = safeStableStringify.exports;
var multistream_1;
var hasRequiredMultistream;
function requireMultistream() {
  if (hasRequiredMultistream) return multistream_1;
  hasRequiredMultistream = 1;
  const metadata = Symbol.for("pino.metadata");
  const { DEFAULT_LEVELS: DEFAULT_LEVELS2 } = constants;
  const DEFAULT_INFO_LEVEL = DEFAULT_LEVELS2.info;
  function multistream(streamsArray, opts) {
    streamsArray = streamsArray || [];
    opts = opts || { dedupe: false };
    const streamLevels = Object.create(DEFAULT_LEVELS2);
    streamLevels.silent = Infinity;
    if (opts.levels && typeof opts.levels === "object") {
      Object.keys(opts.levels).forEach((i) => {
        streamLevels[i] = opts.levels[i];
      });
    }
    const res2 = {
      write: write2,
      add,
      remove,
      emit,
      flushSync: flushSync2,
      end,
      minLevel: 0,
      lastId: 0,
      streams: [],
      clone,
      [metadata]: true,
      streamLevels
    };
    if (Array.isArray(streamsArray)) {
      streamsArray.forEach(add, res2);
    } else {
      add.call(res2, streamsArray);
    }
    streamsArray = null;
    return res2;
    function write2(data) {
      let dest;
      const level = this.lastLevel;
      const { streams } = this;
      let recordedLevel = 0;
      let stream;
      for (let i = initLoopVar(streams.length, opts.dedupe); checkLoopVar(i, streams.length, opts.dedupe); i = adjustLoopVar(i, opts.dedupe)) {
        dest = streams[i];
        if (dest.level <= level) {
          if (recordedLevel !== 0 && recordedLevel !== dest.level) {
            break;
          }
          stream = dest.stream;
          if (stream[metadata]) {
            const { lastTime, lastMsg, lastObj, lastLogger } = this;
            stream.lastLevel = level;
            stream.lastTime = lastTime;
            stream.lastMsg = lastMsg;
            stream.lastObj = lastObj;
            stream.lastLogger = lastLogger;
          }
          stream.write(data);
          if (opts.dedupe) {
            recordedLevel = dest.level;
          }
        } else if (!opts.dedupe) {
          break;
        }
      }
    }
    function emit(...args) {
      for (const { stream } of this.streams) {
        if (typeof stream.emit === "function") {
          stream.emit(...args);
        }
      }
    }
    function flushSync2() {
      for (const { stream } of this.streams) {
        if (typeof stream.flushSync === "function") {
          stream.flushSync();
        }
      }
    }
    function add(dest) {
      if (!dest) {
        return res2;
      }
      const isStream = typeof dest.write === "function" || dest.stream;
      const stream_ = dest.write ? dest : dest.stream;
      if (!isStream) {
        throw Error("stream object needs to implement either StreamEntry or DestinationStream interface");
      }
      const { streams, streamLevels: streamLevels2 } = this;
      let level;
      if (typeof dest.levelVal === "number") {
        level = dest.levelVal;
      } else if (typeof dest.level === "string") {
        level = streamLevels2[dest.level];
      } else if (typeof dest.level === "number") {
        level = dest.level;
      } else {
        level = DEFAULT_INFO_LEVEL;
      }
      const dest_ = {
        stream: stream_,
        level,
        levelVal: void 0,
        id: ++res2.lastId
      };
      streams.unshift(dest_);
      streams.sort(compareByLevel);
      this.minLevel = streams[0].level;
      return res2;
    }
    function remove(id) {
      const { streams } = this;
      const index = streams.findIndex((s) => s.id === id);
      if (index >= 0) {
        streams.splice(index, 1);
        streams.sort(compareByLevel);
        this.minLevel = streams.length > 0 ? streams[0].level : -1;
      }
      return res2;
    }
    function end() {
      for (const { stream } of this.streams) {
        if (typeof stream.flushSync === "function") {
          stream.flushSync();
        }
        stream.end();
      }
    }
    function clone(level) {
      const streams = new Array(this.streams.length);
      for (let i = 0; i < streams.length; i++) {
        streams[i] = {
          level,
          stream: this.streams[i].stream
        };
      }
      return {
        write: write2,
        add,
        remove,
        minLevel: level,
        streams,
        clone,
        emit,
        flushSync: flushSync2,
        [metadata]: true
      };
    }
  }
  function compareByLevel(a, b) {
    return a.level - b.level;
  }
  function initLoopVar(length, dedupe) {
    return dedupe ? length - 1 : 0;
  }
  function adjustLoopVar(i, dedupe) {
    return dedupe ? i - 1 : i + 1;
  }
  function checkLoopVar(i, length, dedupe) {
    return dedupe ? i >= 0 : i < length;
  }
  multistream_1 = multistream;
  return multistream_1;
}
const os = require$$0$5;
const stdSerializers = pinoStdSerializers;
const caller = caller$1;
const redaction = redaction_1;
const time = time$1;
const proto = proto$1;
const symbols = symbols$1;
const { configure } = safeStableStringifyExports;
const { assertDefaultLevelFound, mappings, genLsCache, genLevelComparison, assertLevelComparison } = levels;
const { DEFAULT_LEVELS, SORTING_ORDER } = constants;
const {
  createArgsNormalizer,
  asChindings,
  buildSafeSonicBoom,
  buildFormatters,
  stringify,
  normalizeDestFileDescriptor,
  noop
} = tools;
const { version } = meta;
const {
  chindingsSym,
  redactFmtSym,
  serializersSym,
  timeSym,
  timeSliceIndexSym,
  streamSym,
  stringifySym,
  stringifySafeSym,
  stringifiersSym,
  setLevelSym,
  endSym,
  formatOptsSym,
  messageKeySym,
  errorKeySym,
  nestedKeySym,
  mixinSym,
  levelCompSym,
  useOnlyCustomLevelsSym,
  formattersSym,
  hooksSym,
  nestedKeyStrSym,
  mixinMergeStrategySym,
  msgPrefixSym
} = symbols;
const { epochTime, nullTime } = time;
const { pid } = process;
const hostname = os.hostname();
const defaultErrorSerializer = stdSerializers.err;
const defaultOptions = {
  level: "info",
  levelComparison: SORTING_ORDER.ASC,
  levels: DEFAULT_LEVELS,
  messageKey: "msg",
  errorKey: "err",
  nestedKey: null,
  enabled: true,
  base: { pid, hostname },
  serializers: Object.assign(/* @__PURE__ */ Object.create(null), {
    err: defaultErrorSerializer
  }),
  formatters: Object.assign(/* @__PURE__ */ Object.create(null), {
    bindings(bindings2) {
      return bindings2;
    },
    level(label, number) {
      return { level: number };
    }
  }),
  hooks: {
    logMethod: void 0,
    streamWrite: void 0
  },
  timestamp: epochTime,
  name: void 0,
  redact: null,
  customLevels: null,
  useOnlyCustomLevels: false,
  depthLimit: 5,
  edgeLimit: 100
};
const normalize = createArgsNormalizer(defaultOptions);
const serializers = Object.assign(/* @__PURE__ */ Object.create(null), stdSerializers);
function pino(...args) {
  const instance = {};
  const { opts, stream } = normalize(instance, caller(), ...args);
  if (opts.level && typeof opts.level === "string" && DEFAULT_LEVELS[opts.level.toLowerCase()] !== void 0) opts.level = opts.level.toLowerCase();
  const {
    redact: redact2,
    crlf,
    serializers: serializers2,
    timestamp,
    messageKey,
    errorKey,
    nestedKey,
    base,
    name,
    level,
    customLevels,
    levelComparison,
    mixin,
    mixinMergeStrategy,
    useOnlyCustomLevels,
    formatters,
    hooks,
    depthLimit,
    edgeLimit,
    onChild,
    msgPrefix
  } = opts;
  const stringifySafe = configure({
    maximumDepth: depthLimit,
    maximumBreadth: edgeLimit
  });
  const allFormatters = buildFormatters(
    formatters.level,
    formatters.bindings,
    formatters.log
  );
  const stringifyFn = stringify.bind({
    [stringifySafeSym]: stringifySafe
  });
  const stringifiers = redact2 ? redaction(redact2, stringifyFn) : {};
  const formatOpts = redact2 ? { stringify: stringifiers[redactFmtSym] } : { stringify: stringifyFn };
  const end = "}" + (crlf ? "\r\n" : "\n");
  const coreChindings = asChindings.bind(null, {
    [chindingsSym]: "",
    [serializersSym]: serializers2,
    [stringifiersSym]: stringifiers,
    [stringifySym]: stringify,
    [stringifySafeSym]: stringifySafe,
    [formattersSym]: allFormatters
  });
  let chindings = "";
  if (base !== null) {
    if (name === void 0) {
      chindings = coreChindings(base);
    } else {
      chindings = coreChindings(Object.assign({}, base, { name }));
    }
  }
  const time2 = timestamp instanceof Function ? timestamp : timestamp ? epochTime : nullTime;
  const timeSliceIndex = time2().indexOf(":") + 1;
  if (useOnlyCustomLevels && !customLevels) throw Error("customLevels is required if useOnlyCustomLevels is set true");
  if (mixin && typeof mixin !== "function") throw Error(`Unknown mixin type "${typeof mixin}" - expected "function"`);
  if (msgPrefix && typeof msgPrefix !== "string") throw Error(`Unknown msgPrefix type "${typeof msgPrefix}" - expected "string"`);
  assertDefaultLevelFound(level, customLevels, useOnlyCustomLevels);
  const levels2 = mappings(customLevels, useOnlyCustomLevels);
  if (typeof stream.emit === "function") {
    stream.emit("message", { code: "PINO_CONFIG", config: { levels: levels2, messageKey, errorKey } });
  }
  assertLevelComparison(levelComparison);
  const levelCompFunc = genLevelComparison(levelComparison);
  Object.assign(instance, {
    levels: levels2,
    [levelCompSym]: levelCompFunc,
    [useOnlyCustomLevelsSym]: useOnlyCustomLevels,
    [streamSym]: stream,
    [timeSym]: time2,
    [timeSliceIndexSym]: timeSliceIndex,
    [stringifySym]: stringify,
    [stringifySafeSym]: stringifySafe,
    [stringifiersSym]: stringifiers,
    [endSym]: end,
    [formatOptsSym]: formatOpts,
    [messageKeySym]: messageKey,
    [errorKeySym]: errorKey,
    [nestedKeySym]: nestedKey,
    // protect against injection
    [nestedKeyStrSym]: nestedKey ? `,${JSON.stringify(nestedKey)}:{` : "",
    [serializersSym]: serializers2,
    [mixinSym]: mixin,
    [mixinMergeStrategySym]: mixinMergeStrategy,
    [chindingsSym]: chindings,
    [formattersSym]: allFormatters,
    [hooksSym]: hooks,
    silent: noop,
    onChild,
    [msgPrefixSym]: msgPrefix
  });
  Object.setPrototypeOf(instance, proto());
  genLsCache(instance);
  instance[setLevelSym](level);
  return instance;
}
pino$2.exports = pino;
pino$2.exports.destination = (dest = process.stdout.fd) => {
  if (typeof dest === "object") {
    dest.dest = normalizeDestFileDescriptor(dest.dest || process.stdout.fd);
    return buildSafeSonicBoom(dest);
  } else {
    return buildSafeSonicBoom({ dest: normalizeDestFileDescriptor(dest), minLength: 0 });
  }
};
pino$2.exports.transport = requireTransport();
pino$2.exports.multistream = requireMultistream();
pino$2.exports.levels = mappings();
pino$2.exports.stdSerializers = serializers;
pino$2.exports.stdTimeFunctions = Object.assign({}, time);
pino$2.exports.symbols = symbols;
pino$2.exports.version = version;
pino$2.exports.default = pino;
pino$2.exports.pino = pino;
var pinoExports = pino$2.exports;
const pino$1 = /* @__PURE__ */ getDefaultExportFromCjs(pinoExports);
const logger = pino$1({ name: "main" });
const isDev = process.env.NODE_ENV === "development" || !electron.app.isPackaged;
let gatewayProcess = null;
let gatewayConfig;
let appConfig;
let mainWindow = null;
let isGatewayRunning = false;
let gatewayStartPromise = null;
const USER_SETTINGS = ["port", "redactToolPayloads", "logLevel"];
function pickUserSettings(source) {
  return Object.fromEntries(
    USER_SETTINGS.filter((key) => source[key] !== void 0).map((key) => [key, source[key]])
  );
}
function settingsPath() {
  return require$$2$2.join(electron.app.getPath("userData"), "settings.json");
}
function loadUserSettings() {
  try {
    return pickUserSettings(JSON.parse(node_fs.readFileSync(settingsPath(), "utf8")));
  } catch {
    return {};
  }
}
function initializeConfig() {
  const envConfig = loadConfigFromEnv();
  gatewayConfig = mergeConfig(DEFAULT_GATEWAY_CONFIG, loadUserSettings(), envConfig);
  appConfig = { ...DEFAULT_APP_CONFIG, gateway: gatewayConfig };
  logger.info({ gatewayConfig }, "Configuration loaded");
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: require$$2$2.join(__dirname, "../../frontend/preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(require$$2$2.join(__dirname, "../../frontend/renderer/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
}
function startGateway() {
  if (isGatewayRunning && gatewayProcess) return Promise.resolve();
  if (gatewayStartPromise) return gatewayStartPromise;
  gatewayStartPromise = startGatewayProcess().finally(() => {
    gatewayStartPromise = null;
  });
  return gatewayStartPromise;
}
[
  process.env["TEAM_MCP_NODE"],
  "/opt/homebrew/bin/node",
  // Homebrew (Apple Silicon)
  "/usr/local/bin/node",
  // Homebrew (Intel) / manual install
  "/usr/bin/node",
  // distro package (Linux)
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Program Files (x86)\\nodejs\\node.exe"
].filter((candidate) => Boolean(candidate));
function startGatewayProcess() {
  return new Promise((resolve, reject) => {
    if (gatewayProcess) {
      try {
        gatewayProcess.kill("SIGKILL");
      } catch {
      }
      gatewayProcess = null;
      isGatewayRunning = false;
    }
    logger.info("Starting gateway process...");
    const gatewayEntry = isDev ? require$$2$2.join(__dirname, "../../../src/backend/gateway/index.ts") : require$$2$2.join(__dirname, "../gateway/index.js").replace("app.asar", "app.asar.unpacked");
    const args = isDev ? ["--port", String(gatewayConfig.port), "--bind", gatewayConfig.bindAddr] : [];
    const child2 = node_child_process.spawn(
      "node",
      isDev ? ["--import", "tsx", gatewayEntry, ...args] : [gatewayEntry, ...args],
      {
        env: {
          ...process.env,
          GATEWAY_PORT: String(gatewayConfig.port),
          GATEWAY_BIND_ADDR: gatewayConfig.bindAddr,
          GATEWAY_DB_PATH: require$$2$2.join(electron.app.getPath("userData"), "gateway.db"),
          LOG_LEVEL: gatewayConfig.logLevel,
          REDACT_TOOL_PAYLOADS: String(gatewayConfig.redactToolPayloads),
          NODE_ENV: isDev ? "development" : "production"
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
      }
    );
    gatewayProcess = child2;
    child2.stdout?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line) {
          try {
            const parsed = JSON.parse(line);
            if (typeof parsed.level === "number") {
              const levelMap = {
                10: "trace",
                20: "debug",
                30: "info",
                40: "warn",
                50: "error",
                60: "fatal"
              };
              const level = levelMap[parsed.level] ?? "info";
              logger[level]({ gateway: true, ...parsed }, parsed.msg);
            } else {
              logger.info({ gateway: true }, line);
            }
          } catch {
            logger.info({ gateway: true }, line);
          }
          mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
            timestamp: Date.now(),
            message: line
          });
        }
      }
    });
    child2.stderr?.on("data", (data) => {
      logger.error({ gateway: true }, data.toString());
      mainWindow?.webContents.send(IPC_CHANNELS.GATEWAY_LOG, {
        timestamp: Date.now(),
        message: data.toString(),
        level: "error"
      });
    });
    let settled = false;
    let ready = false;
    const checkReady = setInterval(async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:${gatewayConfig.port}/health`
        );
        if (response.ok && !settled) {
          settled = true;
          ready = true;
          stopPolling();
          isGatewayRunning = true;
          mainWindow?.webContents.send(
            IPC_CHANNELS.GATEWAY_STATUS,
            getGatewayStatus()
          );
          resolve();
        }
      } catch {
      }
    }, 500);
    const timeout = setTimeout(() => {
      if (!ready) {
        fail(
          new Error(
            "Gateway failed to start within 10 seconds. Check the gateway logs for the bind error."
          )
        );
      }
    }, 1e4);
    const stopPolling = () => {
      clearInterval(checkReady);
      clearTimeout(timeout);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      stopPolling();
      if (gatewayProcess === child2) {
        gatewayProcess = null;
        isGatewayRunning = false;
        mainWindow?.webContents.send(
          IPC_CHANNELS.GATEWAY_STATUS,
          getGatewayStatus()
        );
      }
      try {
        child2.kill("SIGKILL");
      } catch {
      }
      reject(error);
    };
    child2.on("error", (error) => {
      logger.error({ error }, "Gateway process error");
      fail(error instanceof Error ? error : new Error(String(error)));
    });
    child2.on("exit", (code, signal) => {
      logger.info({ code, signal }, "Gateway process exited");
      stopPolling();
      if (gatewayProcess === child2) {
        gatewayProcess = null;
        isGatewayRunning = false;
        mainWindow?.webContents.send(
          IPC_CHANNELS.GATEWAY_STATUS,
          getGatewayStatus()
        );
      }
      if (!ready) {
        fail(
          new Error(
            `Gateway exited before becoming ready (code ${code ?? "?"}${signal ? `, signal ${signal}` : ""}). Check the gateway logs for the bind error.`
          )
        );
      }
    });
  });
}
function stopGateway() {
  return new Promise((resolve) => {
    const proc = gatewayProcess;
    if (!proc) {
      resolve();
      return;
    }
    logger.info("Stopping gateway process...");
    const finish = () => resolve();
    proc.once("exit", finish);
    proc.once("error", finish);
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (gatewayProcess === proc) proc.kill("SIGKILL");
    }, 5e3);
  });
}
function getGatewayStatus() {
  return {
    running: isGatewayRunning,
    startedAt: gatewayProcess ? Date.now() : void 0,
    uptimeMs: gatewayProcess ? Date.now() : 0,
    boundAddress: gatewayConfig.bindAddr,
    port: gatewayConfig.port,
    connectedPeers: 0,
    // Would need to query gateway
    totalRequests: 0,
    activeSessions: 0
  };
}
function gatewayBaseUrl() {
  return `http://127.0.0.1:${gatewayConfig.port}`;
}
async function gatewayFetch(path2, init) {
  const response = await fetch(`${gatewayBaseUrl()}${path2}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers || {} }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === "string") message = parsed.error;
    } catch {
    }
    throw new Error(message || `Gateway request failed (${response.status})`);
  }
  if (response.status === 204) return void 0;
  return await response.json();
}
async function ensureGatewayRunning() {
  if (isGatewayRunning) return;
  await startGateway();
}
async function gatewayFetchOr(path2, fallback, init) {
  if (!isGatewayRunning) return fallback;
  try {
    return await gatewayFetch(path2, init);
  } catch {
    return fallback;
  }
}
let prevCpus = require$$0$5.cpus();
function hostStats() {
  const now = require$$0$5.cpus();
  let busy = 0;
  let total = 0;
  now.forEach((c, i) => {
    const sum = (t) => t.user + t.nice + t.sys + t.irq + t.idle;
    const dt = sum(c.times) - sum(prevCpus[i].times);
    total += dt;
    busy += dt - (c.times.idle - prevCpus[i].times.idle);
  });
  prevCpus = now;
  return {
    cpu: total ? busy / total * 100 : 0,
    cores: now.length,
    memUsed: require$$0$5.totalmem() - require$$0$5.freemem(),
    memTotal: require$$0$5.totalmem(),
    load: require$$0$5.loadavg()[0]
  };
}
const TAILSCALE_CLI_CANDIDATES = [
  "tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "C:\\Program Files\\Tailscale\\tailscale.exe",
  "C:\\Program Files (x86)\\Tailscale\\tailscale.exe"
];
function getLocalTailnet() {
  const down = (state) => ({
    available: false,
    state,
    ip: null,
    hostname: null,
    dnsName: null
  });
  const attempt = (index) => new Promise((resolve) => {
    if (index >= TAILSCALE_CLI_CANDIDATES.length) {
      resolve(down(null));
      return;
    }
    node_child_process.execFile(
      TAILSCALE_CLI_CANDIDATES[index],
      ["status", "--json"],
      { timeout: 4e3 },
      (error, stdout) => {
        if (error) {
          resolve(attempt(index + 1));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const state = parsed?.BackendState ?? "Unknown";
          const ips = parsed?.Self?.TailscaleIPs ?? [];
          const up = state === "Running" && ips.length > 0;
          resolve({
            available: up,
            state,
            ip: up ? ips[0] : null,
            hostname: parsed?.Self?.HostName ?? null,
            dnsName: parsed?.Self?.DNSName ?? null
          });
        } catch {
          resolve(down(null));
        }
      }
    );
  });
  return attempt(0);
}
async function updateGatewaySettings(updates) {
  const allowed = pickUserSettings(updates);
  gatewayConfig = GatewayConfigSchema.parse({ ...gatewayConfig, ...allowed });
  appConfig = { ...appConfig, gateway: gatewayConfig };
  node_fs.writeFileSync(
    settingsPath(),
    JSON.stringify({ ...loadUserSettings(), ...allowed }, null, 2)
  );
  if (gatewayProcess) {
    await stopGateway();
    await startGateway();
  }
  return gatewayConfig;
}
function setupIpcHandlers() {
  registerGatewayLifecycleIpcHandlers({
    startGateway,
    stopGateway,
    getGatewayStatus,
    gatewayFetch,
    isGatewayRunning: () => isGatewayRunning,
    getGatewayProcess: () => gatewayProcess,
    getGatewayConfig: () => gatewayConfig,
    setGatewayConfig: (config) => {
      gatewayConfig = config;
      appConfig = { ...appConfig, gateway: config };
    },
    getLocalTailnet
  });
  registerServerIpcHandlers({
    gatewayFetch,
    gatewayFetchOr,
    ensureGatewayRunning
  });
  registerPolicyActivityIpcHandlers({ gatewayFetch, gatewayFetchOr, ensureGatewayRunning });
  registerSystemIpcHandlers({
    hostStats,
    gatewayFetchOr,
    getGatewayConfig: () => gatewayConfig,
    updateGatewaySettings
  });
  registerNetworkIpcHandlers({
    gatewayFetch,
    ensureGatewayRunning,
    isGatewayRunning: () => isGatewayRunning
  });
  registerApprovalIpcHandlers({ gatewayFetch, ensureGatewayRunning });
  electron.ipcMain.on(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, url) => {
    void electron.shell.openExternal(url);
  });
}
electron.app.whenReady().then(async () => {
  initializeConfig();
  createWindow();
  setupIpcHandlers();
  if (appConfig.autoStartGateway) {
    try {
      await startGateway();
    } catch (error) {
      logger.error({ error }, "Failed to auto-start gateway");
    }
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  void stopGateway();
});
electron.app.on("open-url", (event, url) => {
  event.preventDefault();
  mainWindow?.webContents.send(IPC_CHANNELS.PROTOCOL_URL, url);
});
exports.IPC_CHANNELS = IPC_CHANNELS;
exports.createWindow = createWindow;
exports.getGatewayStatus = getGatewayStatus;
exports.startGateway = startGateway;
exports.stopGateway = stopGateway;
