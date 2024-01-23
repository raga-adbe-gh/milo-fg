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
const openwhisk = require('openwhisk');
const {
    getAioLogger, logMemUsage, getInstanceKey, PROMOTE_ACTION
} = require('../utils');
const FgAction = require('../fgAction');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');
const AppConfig = require('../appConfig');
const FgPromoteActionHelper = require('../fgPromoteActionHelper');

const logger = getAioLogger();

/**
 * This createBatch has following functions
 * 1. Searches for the files to be promoted (using msal search api)
 * 2. Splits these files to be promoted into batches based on maxFilesPerBatch parameter
 * The batch information are stored across files
 * promoteAction/tracker.json - Tracker file that stores the batching instances that needs to be processed. e.g. milo_pink or cc_pink
 * promoteAction/instance<instance e.g. _milo_pink>/instance.json - This stores the information of the batches and respective activation ids
 * promoteAction/instance_milo_pink/batch_<n>>/batch_info.json - This stores the files that needs to be processed by the batch
 * promoteAction/instance_milo_pink/batch_<n>/results.json - After the batch is process is completed results are stored (e.g. failed promotes)
 * Following parameters are used and needs to be tweaked
 * 1. Number of files per batch - Assume 10k
 * 2. Number of activation per container - Assume 5
 * 3. Number of parallel copies - Assume 20
 * Assuming avg 5MB/file and assume that all parallel copies are loaded (i.e 20) total size is 100mb
 * and 5 container total is about 0.5gb and below treshold and can be tweaked.
 */
async function main(params) {
    logMemUsage();
    let respPayload;
    const valParams = {
        statParams: ['fgRootFolder'],
        actParams: ['adminPageUri', 'projectExcelPath'],
        checkUser: false,
        checkStatus: false,
        checkActivation: false
    };
    const ow = openwhisk();
    // Initialize action
    const appConfig = new AppConfig(params);
    const fgAction = new FgAction(PROMOTE_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });
    const { fgStatus } = fgAction.getActionParams();
    const siteFgRootPath = appConfig.getSiteFgRootPath();
    const batchManager = new BatchManager({ key: PROMOTE_ACTION, instanceKey: getInstanceKey({ fgRootFolder: siteFgRootPath }), batchConfig: appConfig.getBatchConfig() });
    await batchManager.init();
    // For current cleanup files before starting
    await batchManager.cleanupFiles();
    try {
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }
        const fgPromoteActionHelper = new FgPromoteActionHelper();

        respPayload = 'Getting all files to be promoted.';
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });
        logger.info(respPayload);
        respPayload = 'Creating batches.';
        logger.info(respPayload);
        respPayload = await fgPromoteActionHelper.createBatch(batchManager, appConfig);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload,
            batchesInfo: batchManager.getBatchesInfo()
        });
        logger.info(respPayload);

        // Finalize and Trigger N Track the batches
        await batchManager.finalizeInstance(appConfig.getPassthruParams());
        logger.info('Instance finalized and started');
    } catch (err) {
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR,
            statusMessage: err.message,
        });
        logger.error(err);
        respPayload = err;
    }

    return {
        body: respPayload,
    };
}

exports.main = main;
