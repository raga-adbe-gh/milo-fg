/* eslint-disable no-await-in-loop */
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
    getAioLogger, delay, logMemUsage, getInstanceKey, PROMOTE_ACTION, PROMOTE_BATCH
} = require('../utils');
const FgAction = require('../fgAction');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');
const AppConfig = require('../appConfig');
const FgPromoteActionHelper = require('../fgPromoteActionHelper');

const DELAY_TIME_PROMOTE = 3000;

async function main(params) {
    const logger = getAioLogger();
    logMemUsage();
    const { batchNumber } = params;
    const valParams = {
        statParams: ['fgRootFolder', 'projectExcelPath'],
        actParams: ['adminPageUri'],
        checkUser: false,
        checkStatus: false,
        checkActivation: false
    };
    const ow = openwhisk();
    // Initialize action
    logger.info(`Promote started for ${batchNumber}`);
    const appConfig = new AppConfig(params);
    const fgAction = new FgAction(`${PROMOTE_BATCH}_${batchNumber}`, appConfig);
    fgAction.init({ ow, skipUserDetails: true, fgStatusParams: { keySuffix: `Batch_${batchNumber}` } });
    const { fgStatus } = fgAction.getActionParams();
    const fgRootFolder = appConfig.getSiteFgRootPath();

    let respPayload;
    const batchManager = new BatchManager({ key: PROMOTE_ACTION, instanceKey: getInstanceKey({ fgRootFolder }), batchConfig: appConfig.getBatchConfig() });
    await batchManager.init({ batchNumber });
    try {
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }
        const fgPromoteActionHelper = new FgPromoteActionHelper();

        await fgStatus.clearState();

        respPayload = 'Getting all files to be promoted.';
        logger.info(respPayload);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.STARTED,
            statusMessage: respPayload,
            details: {
                [FgStatus.PROJECT_STAGE.PROMOTE_COPY_STATUS]: FgStatus.PROJECT_STATUS.IN_PROGRESS
            }

        });
        respPayload = 'Promote files';
        logger.info(respPayload);
        respPayload = await fgPromoteActionHelper.promoteFloodgatedFiles(batchManager, appConfig);
        respPayload = `Promoted files ${JSON.stringify(respPayload)}`;
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload,
            details: {
                [FgStatus.PROJECT_STAGE.PROMOTE_COPY_STATUS]: FgStatus.PROJECT_STATUS.COMPLETED
            }
        });
        // A small delay before trigger
        await delay(DELAY_TIME_PROMOTE);
        await triggerPostCopy(ow, { ...appConfig.getPassthruParams(), batchNumber }, fgStatus);
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

async function triggerPostCopy(ow, params, fgStatus) {
    return ow.actions.invoke({
        name: 'milo-fg/post-copy-worker',
        blocking: false, // this is the flag that instructs to execute the worker asynchronous
        result: false,
        params
    }).then(async (result) => {
        // attaching activation id to the status
        // Its possible status is updated in post copy action before this callback is called.
        await fgStatus.updateStatusToStateLib({
            postPromoteActivationId: result.activationId
        });
        return {
            postPromoteActivationId: result.activationId
        };
    }).catch(async (err) => {
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.FAILED,
            statusMessage: `Failed to invoke actions ${err.message}`
        });
        getAioLogger().error(`Failed to invoke actions for batch ${params.batchNumber}`, err);
        return {};
    });
}

exports.main = main;
