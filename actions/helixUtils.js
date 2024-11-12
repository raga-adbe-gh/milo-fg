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
const JOB_STATUS_CODES = [200, 204, 304];
const AUTH_ERRORS = [401, 403];
const PREVIEW = 'preview';
const PUBLISH = 'publish';
const UNPUBLISH = 'unpublish';
const LIVE = 'live';

const logger = getAioLogger();

class HelixUtils {
    constructor(appConfig) {
        this.appConfig = appConfig;
    }

    getOperations() {
        return { PREVIEW, PUBLISH, UNPUBLISH };
    }

    getHelixApi(operation) {
        return operation === PREVIEW ? PREVIEW : LIVE;
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
     * @param {*} operation Preivew or Publish or Unpublish
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
            const payload = { forceUpdate: true, paths };
            if (operation === UNPUBLISH) payload.delete = true;
            const bulkUrl = `https://admin.hlx.page/${this.getHelixApi(operation)}/${urlInfo.getOwner()}/${repo}/${urlInfo.getBranch()}/*`;
            const options = {
                method: 'POST',
                body: JSON.stringify(payload),
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
                const jobStatusUrl = jobResp.links?.self;
                logger.info(`Job details : ${jobName} / ${jobResp.messageId} / ${jobResp.job?.state} with link ${jobStatusUrl}`);
                if (jobName) {
                    const jobStatus = await this.bulkJobStatus(jobStatusUrl, repo);
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
     * @param {*} jobStatusUrl Job status fetch url
     * @param {*} repo Repo for which the job was triggered
     * @param {*} bulkStatus Accumulated status of the files (default is empty)
     * @param {*} retryAttempt Iteration number of the retry attempt (Default = 1)
     * @returns List of path with preview/pubish status e.g. ['/draft/file1': {success: true}..]
     */
    async bulkJobStatus(jobStatusUrl, repo, bulkStatus = {}, retryAttempt = 1) {
        logger.info(`Checking job status for ${repo} using ${jobStatusUrl}`);
        try {
            const { helixAdminApiKeys } = this.appConfig.getConfig();
            const options = {};
            if (helixAdminApiKeys && helixAdminApiKeys[repo]) {
                options.headers = new fetch.Headers();
                options.headers.append('Authorization', `token ${helixAdminApiKeys[repo]}`);
            }
            const statusUrl = `${jobStatusUrl}/details`;
            const response = await fetch(statusUrl, options);
            logger.info(`Status call response ${response.ok} with status ${response.status} `);
            if (!response.ok && retryAttempt <= this.appConfig.getConfig().maxBulkPreviewChecks) {
                await delay(this.appConfig.getConfig().bulkPreviewCheckInterval * 1000);
                await this.bulkJobStatus(jobStatusUrl, repo, bulkStatus, retryAttempt + 1);
            } else if (response.ok) {
                const jobStatusJson = await response.json();
                if (jobStatusJson.topic === 'status') {
                    bulkStatus.resources = jobStatusJson.data?.resources;
                } else {
                    jobStatusJson.data?.resources?.forEach((rs) => {
                        bulkStatus[rs.path] = { success: JOB_STATUS_CODES.includes(rs.status) };
                    });
                }
                if (jobStatusJson.state !== 'stopped' && !jobStatusJson.cancelled &&
                    retryAttempt <= this.appConfig.getConfig().maxBulkPreviewChecks) {
                    await delay(this.appConfig.getConfig().bulkPreviewCheckInterval * 1000);
                    await this.bulkJobStatus(jobStatusUrl, repo, bulkStatus, retryAttempt + 1);
                }
            }
        } catch (error) {
            logger.info(`Error in checking status: ${error.message}`);
        }
        return bulkStatus;
    }

    async getFilesToUnpublish(fgColor, retryAttempt = 1) {
        let filesToUnPublish = null;
        logger.info('Get files to unpublish.');
        const { suffix } = this.appConfig.getFgFolderToDelete();
        const payload = { select: ['live'], paths: [`${suffix}/*`] };
        try {
            const repo = this.getRepo(true, fgColor);
            const urlInfo = this.appConfig.getUrlInfo();
            const statusUrl = `https://admin.hlx.page/status/${urlInfo.getOwner()}/${repo}/${urlInfo.getBranch()}/*`;
            const options = {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: new fetch.Headers([['Accept', 'application/json'], ['Content-Type', 'application/json']])
            };

            const helixAdminApiKey = this.getAdminApiKey(true, fgColor);
            if (helixAdminApiKey) {
                options.headers.append('Authorization', `token ${helixAdminApiKey}`);
            }

            const response = await fetch(statusUrl, options);
            logger.info(`status call response ${response.status} for ${statusUrl}`);
            if (!response.ok && !AUTH_ERRORS.includes(response.status) && retryAttempt <= MAX_RETRIES) {
                await delay(RETRY_DELAY * 1000);
                filesToUnPublish = await this.getFilesToUnpublish(fgColor, retryAttempt + 1);
            } else if (response.ok) {
                // Get job details
                const jobResp = await response.json();
                const jobName = jobResp.job?.name;
                const jobStatusUrl = jobResp.links?.self;
                logger.info(`Job details : ${jobName} / ${jobResp.messageId} / ${jobResp.job?.state} with link ${jobStatusUrl}`);
                if (jobStatusUrl) {
                    const jobStatus = await this.bulkJobStatus(jobStatusUrl, repo);
                    filesToUnPublish = jobStatus?.resources || [];
                }
            }
        } catch (error) {
            logger.info(`Error in checking status: ${error.message}`);
        }
        // Filter ignore paths
        return filesToUnPublish;
    }
}

module.exports = HelixUtils;
