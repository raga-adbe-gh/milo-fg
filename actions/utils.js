/* ************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2023 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
************************************************************************* */

const AioLogger = require('@adobe/aio-lib-core-logging');
const events = require('events');

const COPY_ACTION = 'copyAction';
const PROMOTE_ACTION = 'promoteAction';
const PROMOTE_BATCH = 'promoteBatch';
const DELETE_ACTION = 'deleteAction';

let eventEmitter = null;

function getAioLogger(loggerName = 'main', logLevel = 'info') {
    return AioLogger(loggerName, { level: logLevel });
}

function handleExtension(path) {
    const pidx = path.lastIndexOf('/');
    const fld = path.substring(0, pidx + 1);
    let fn = path.substring(pidx + 1);

    if (fn.endsWith('.xlsx')) {
        fn = fn.replace('.xlsx', '.json');
    }
    if (fn.toLowerCase() === 'index.docx') {
        fn = '';
    }
    if (fn.endsWith('.docx')) {
        fn = fn.substring(0, fn.lastIndexOf('.'));
    }

    fn = fn
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-|-$/g, '');

    return `${fld}${fn}`;
}

function getPathFromUrl(url) {
    return new URL(url).pathname;
}

function getDocPathFromUrl(url) {
    let path = getPathFromUrl(url);
    if (!path) {
        return undefined;
    }
    if (path.endsWith('.json')) {
        path = path.slice(0, -5);
        return `${path}.xlsx`;
    }
    if (path.endsWith('.svg') || path.endsWith('.pdf')) {
        return path;
    }
    if (path.endsWith('/')) {
        path += 'index';
    } else if (path.endsWith('.html')) {
        path = path.slice(0, -5);
    }

    return `${path}.docx`;
}

async function delay(milliseconds = 100) {
    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function actInProgress(ow, actId, svInProg = true) {
    const logger = getAioLogger();
    const finStatuses = ['success', 'failure', 'skipped', 'developer_error',
        'system_error', 'invocation_error', 'application_error', 'timeout',
        'action developer error', 'application error'];
    if (svInProg && actId) {
        let owAct = {};
        try {
            owAct = await ow.activations.get({
                activationId: actId
            });
            return owAct?.response?.status ? !finStatuses.includes(owAct.response.status) : svInProg;
        } catch (err) {
            logger.error(err?.stack);
            logger.error(`Job status of ${actId} failed response ${JSON.stringify(owAct)}`);
        }
    }
    return svInProg;
}

function logMemUsage() {
    const logger = getAioLogger();
    const memStr = JSON.stringify(process.memoryUsage());
    logger.info(`Memory Usage : ${memStr}`);
}

function logMemUsageIter() {
    logMemUsage();
    if (!eventEmitter) {
        eventEmitter = new events.EventEmitter();
        eventEmitter.on('logMemUsage', logMemUsage);
    }
    setTimeout(() => eventEmitter.emit('logMemUsage'), 400);
}

function getInstanceKey(siteKey) {
    return (siteKey?.replace(/[^a-zA-Z0-9_]/g, '_') || 'default').toLowerCase();
}

/**
 *
 * Returns an error response object and attempts to log.info the status code and error message
 *
 * @param {number} statusCode the error status code.
 *        e.g. 400
 * @param {string} message the error message.
 *        e.g. 'missing xyz parameter'
 *
 * @returns {object} the error object, ready to be returned from the action main's function.
 *
 */
function errorResponse(statusCode, message) {
    return {
        error: {
            statusCode,
            body: {
                error: message,
            },
        },
    };
}

const successResponse = (payload, statusCodeOverride = 200, additionalHeaders = {}) => ({
    body: {
        payload
    },
    statusCode: statusCodeOverride,
    headers: {
        'content-type': 'application/json',
        ...additionalHeaders,
    },
});

function strToArray(val) {
    if (val && typeof val === 'string') {
        return val.split(',').map((e) => e.trim()).filter((e) => e);
    }
    return val;
}

function strToBool(val) {
    if (val !== undefined && typeof val === 'string') {
        return val.trim().toLowerCase() === 'true';
    }
    return val;
}

function toUTCStr(dt) {
    const ret = new Date(dt);
    return Number.isNaN(ret.getTime()) ? dt : ret.toUTCString();
}

function isFilePathWithWildcard(filePath, pattern) {
    if (!filePath || !pattern) {
        return false;
    }
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wildcardToRegex = (wildcard) => escapeRegExp(wildcard).replace(/\\\*/g, '.*');
    const regexPattern = new RegExp(`^${wildcardToRegex(pattern)}$`);
    return regexPattern.test(filePath);
}

function isFilePatternMatched(filePath, patterns) {
    if (patterns && Array.isArray(patterns)) {
        return !!patterns.find((pattern) => isFilePathWithWildcard(filePath, pattern) || isFilePathWithWildcard(filePath, `${pattern}/*`));
    }
    return isFilePathWithWildcard(filePath, patterns);
}

function getJsonFromStr(str, def = {}) {
    try {
        return JSON.parse(str);
    } catch (err) {
        // Mostly bad string ignored
        getAioLogger().debug(`Error while parsing ${str}`);
    }
    return def;
}

async function inParallel(elements, processElement, logger, ignoreResults = true, passParameter = null, numParallel = 5) {
    const queue = [];
    queue.push(...elements);
    const workers = [];
    const workersLimit = Math.min(elements.length, numParallel);

    const processQueue = async () => {
        const result = [];
        let element = queue.pop();
        while (element) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const exec = await processElement(element, passParameter);
                if (!ignoreResults && exec) {
                    result.push(exec);
                }
            } catch (error) {
                logger.error(`Error processing element ${element}: ${error.message}\n`);
            }
            element = queue.pop();
        }
        return result;
    };

    for (let i = 0; i < workersLimit; i += 1) {
        workers.push(processQueue());
    }
    if (ignoreResults) {
        return Promise.all(workers);
    }
    const results = await Promise.all(workers);
    return results.reduce((prev, curr) => prev.concat(curr), []);
}

function extractMessages(results) {
    return Object.fromEntries(
        Object.entries(results).map(([key, value]) => [
            key,
            value.map((item) => `${item.path}${item.message ? ` (${item.message})` : ''}`)
        ])
    );
}

module.exports = {
    errorResponse,
    successResponse,
    getAioLogger,
    handleExtension,
    getDocPathFromUrl,
    delay,
    COPY_ACTION,
    PROMOTE_ACTION,
    PROMOTE_BATCH,
    DELETE_ACTION,
    logMemUsage,
    logMemUsageIter,
    actInProgress,
    getInstanceKey,
    strToArray,
    toUTCStr,
    isFilePathWithWildcard,
    isFilePatternMatched,
    strToBool,
    getJsonFromStr,
    inParallel,
    extractMessages,
};
