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

const fetch = require('node-fetch');
const { getAioLogger, delay } = require('./utils');

const MAX_RETRIES = 5;
const RETRY_DELAY = 5;
const JOB_STATUS_CODES = [200, 304];
const AUTH_ERRORS = [401, 403];
const PREVIEW = 'preview';
const PUBLISH = 'publish';
const LIVE = 'live';

const logger = getAioLogger();

class HelixUtils {
    constructor(appConfig) {
        this.appConfig = appConfig;
    }

    getOperations() {
        return { PREVIEW, LIVE };
    }

    getRepo(isFloodgate = false, fgColor = 'pink') {
        const urlInfo = this.appConfig.getUrlInfo();
        return isFloodgate ? `${urlInfo.getRepo()}-${fgColor}` : urlInfo.getRepo();
    }

    getAdminApiKey(isFloodgate = false, fgColor = 'pink') {
        const repo = this.getRepo(isFloodgate, fgColor);
        const { helixAdminApiKeys = {} } = this.appConfig.getConfig();
        return helixAdminApiKeys[repo];
    }

    /**
     * Checks if the preview is enabled for the main or floodgate site
     * @param {*} isFloodgate true for copy
     * @param {*} fgColor floodgate color for the current event
     * @returns true if preview is enabled
     */
    canBulkPreviewPublish(isFloodgate = false, fgColor = 'pink') {
        const repo = this.getRepo(isFloodgate, fgColor);
        const { enablePreviewPublish } = this.appConfig.getConfig();
        const repoRegexArr = enablePreviewPublish.map((ps) => new RegExp(`^${ps}$`));
        return true && repoRegexArr.find((rx) => rx.test(repo));
    }

    /**
     * Trigger a preview/publish of the files using the franklin bulk api. Franklin bulk api returns a job id/name which is used to
     * check back the completion of the preview/publish.
     * @param {*} paths Paths of the files that needs to be previewed.
     * @param {*} operation Preivew or Publish
     * @param {*} isFloodgate Flag indicating if the preview/publish is for regular or floodgate content
     * @param {*} retryAttempt Iteration number of the retry attempt (Default = 1)
     * @returns List of path with preview/pubish status e.g. [{path:'/draft/file1', success: true}..]
     */
    async bulkPreviewPublish(paths, operation, { isFloodgate = false, fgColor = 'pink' } = {}, retryAttempt = 1) {
        let prevPubStatuses = paths.filter((p) => p).map((path) => ({ success: false, path }));
        if (!prevPubStatuses.length) {
            return prevPubStatuses;
        }
        try {
            const repo = this.getRepo(isFloodgate, fgColor);
            const urlInfo = this.appConfig.getUrlInfo();
            const bulkUrl = `https://admin.hlx.page/${operation}/${urlInfo.getOwner()}/${repo}/${urlInfo.getBranch()}/*`;
            const options = {
                method: 'POST',
                body: JSON.stringify({ forceUpdate: true, paths }),
                headers: new fetch.Headers([['Accept', 'application/json'], ['Content-Type', 'application/json']])
            };

            const helixAdminApiKey = this.getAdminApiKey(isFloodgate, fgColor);
            if (helixAdminApiKey) {
                options.headers.append('Authorization', `token ${helixAdminApiKey}`);
            }

            const response = await fetch(bulkUrl, options);
            logger.info(`${operation} call response ${response.status} for ${bulkUrl}`);
            if (!response.ok && !AUTH_ERRORS.includes(response.status) && retryAttempt <= MAX_RETRIES) {
                await delay(RETRY_DELAY * 1000);
                prevPubStatuses = await this.bulkPreviewPublish(paths, operation, { isFloodgate, fgColor }, retryAttempt + 1);
            } else if (response.ok) {
                // Get job details
                const jobResp = await response.json();
                const jobName = jobResp.job?.name;
                logger.info(`Job details : ${jobName} / ${jobResp.messageId} / ${jobResp.job?.state}`);
                if (jobName) {
                    const jobStatus = await this.bulkJobStatus(jobName, operation, repo);
                    prevPubStatuses.forEach((e) => {
                        if (jobStatus[e.path]?.success) {
                            e.success = true;
                        }
                    });
                }
            }
        } catch (error) {
            logger.info(`Error in bulk ${operation} status: ${error.message}`);
            prevPubStatuses.forEach((e) => {
                e.success = false;
            });
        }
        return prevPubStatuses;
    }

    /**
     * Checks the preview/publish job status and returns the file statuses
     * @param {*} jobName Bulk job to be checked
     * @param {*} operation Job Type (preview/publish)
     * @param {*} repo Repo for which the job was triggered
     * @param {*} bulkPreviewStatus Accumulated status of the files (default is empty)
     * @param {*} retryAttempt Iteration number of the retry attempt (Default = 1)
     * @returns List of path with preview/pubish status e.g. ['/draft/file1': {success: true}..]
     */
    async bulkJobStatus(jobName, operation, repo, bulkPreviewStatus = {}, retryAttempt = 1) {
        logger.info(`Checking job status of ${jobName} for ${operation}`);
        try {
            const { helixAdminApiKeys } = this.appConfig.getConfig();
            const options = {};
            if (helixAdminApiKeys && helixAdminApiKeys[repo]) {
                options.headers = new fetch.Headers();
                options.headers.append('Authorization', `token ${helixAdminApiKeys[repo]}`);
            }
            const bulkOperation = operation === LIVE ? PUBLISH : operation;
            const urlInfo = this.appConfig.getUrlInfo();
            const statusUrl = `https://admin.hlx.page/job/${urlInfo.getOwner()}/${repo}/${urlInfo.getBranch()}/${bulkOperation}/${jobName}/details`;
            const response = await fetch(statusUrl, options);
            logger.info(`Status call response ${response.ok} with status ${response.status} `);
            if (!response.ok && retryAttempt <= this.appConfig.getConfig().maxBulkPreviewChecks) {
                await delay(this.appConfig.getConfig().bulkPreviewCheckInterval * 1000);
                await this.bulkJobStatus(jobName, operation, repo, bulkPreviewStatus, retryAttempt + 1);
            } else if (response.ok) {
                const jobStatusJson = await response.json();
                logger.info(`${operation} progress ${JSON.stringify(jobStatusJson.progress)}`);
                jobStatusJson.data?.resources?.forEach((rs) => {
                    bulkPreviewStatus[rs.path] = { success: JOB_STATUS_CODES.includes(rs.status) };
                });
                if (jobStatusJson.state !== 'stopped' && !jobStatusJson.cancelled &&
                    retryAttempt <= this.appConfig.getConfig().maxBulkPreviewChecks) {
                    await delay(this.appConfig.getConfig().bulkPreviewCheckInterval * 1000);
                    await this.bulkJobStatus(jobName, operation, repo, bulkPreviewStatus, retryAttempt + 1);
                }
            }
        } catch (error) {
            logger.info(`Error in checking status: ${error.message}`);
        }
        return bulkPreviewStatus;
    }
}

module.exports = HelixUtils;
