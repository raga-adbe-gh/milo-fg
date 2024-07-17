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
const { delay, getAioLogger } = require('./utils');
const fetch = require('node-fetch');

const NUM_REQ_THRESHOLD = 5;

// fetch-with-retry added to check for Sharepoint RateLimit headers and 429 errors and to handle them accordingly.
noRetry = (statusCode, additionalNoRetryCodes) => statusCode < 400 || statusCode === 401 || statusCode === 403 || additionalNoRetryCodes?.includes(statusCode);

async function fetchWithTimeout(url, options, timeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            resolve({ ok: false, status: 600, statusText: 'Timed out!' });
        }, timeout);

        fetch(url, options)
            .then(response => resolve(response))
            .catch(err => resolve({ ok: false, status: 503, statusText: err.message }))
            .finally(() => clearTimeout(timer));
    });
}

async function executeRequest(url, options, retries = NUM_REQ_THRESHOLD, timeout = 60000, additionalNoRetryCodes = []) {
    const logger = getAioLogger();
    try {
        let waitInterval = 2;
        for (let r = 0; r < retries; r += 1) {
            waitInterval *= 2;

            // eslint-disable-next-line no-await-in-loop
            const response = await fetchWithTimeout(url, options, timeout);
            logger.debug(`Value url ${url} response ${response?.status}`);
            if (noRetry(response.status, additionalNoRetryCodes) || r === retries - 1) {
                return response;
            }
            const delayBy = response.headers.get('ratelimit-reset') || response.headers.get('retry-after') || waitInterval;

            // Handle 409 - conflig during upload, 423 file locked
            let responseText = '';
            const is409or423 = response.status === 409 || response.status === 423;
            if (is409or423) {
                // eslint-disable-next-line no-await-in-loop
                responseText = await response.text();
            }
            logger.warn(`${response.status} for ${url} response${is409or423 ? ` (${response.statusText})` : ''} - retrying (${r + 1}/${retries}) in ${delayBy}ms\n${responseText}`);
            // eslint-disable-next-line no-await-in-loop
            await delay(delayBy*1000);
        }
    } catch(err) {
        logger.error(`Error while executing ${url}`);
        logger.error(err);
    }
    return null;
};

module.exports = {
    executeRequest
}