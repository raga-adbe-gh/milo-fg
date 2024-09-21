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
const Sharepoint = require('../sharepoint');
const {
    delay, successResponse, getAioLogger, DELETE_ACTION,
} = require('../utils');
const AppConfig = require('../appConfig');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');
const FgAction = require('../fgAction');
const FgDeleteActionHelper = require('../fgDeleteActionHelper');

const logger = getAioLogger();

async function main(params) {
    let respPayload;

    const valParams = {
        statParams: ['fgRootFolder'],
        actParams: ['adminPageUri', 'projectExcelPath'],
        checkUser: false,
        checkStatus: false,
        checkActivation: false
    };
    const ow = openwhisk();

    let appConfig = new AppConfig(params);
    const fgDeleteActionHelper = new FgDeleteActionHelper();
    const batchManager = new BatchManager({ key: DELETE_ACTION, batchConfig: appConfig.getDeleteBatchConfig() });
    await batchManager.init();

    if (await batchManager.isInstanceRunning()) {
        return successResponse('Skipping, Instance is running!');
    }

    // Read instance_info.json
    const instanceContent = await batchManager.getInstanceData();
    if (!instanceContent?.dtls) {
        return successResponse('None to run!');
    }

    const { batchesInfo } = instanceContent.dtls;

    // Initialize action
    appConfig = new AppConfig({ ...params, ...instanceContent.dtls });
    const fgAction = new FgAction(DELETE_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });
    const { fgStatus } = fgAction.getActionParams();

    try {
        await batchManager.markInstanceRunning();
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }
        const { payload } = appConfig.getConfig();

        // Find the batch to be triggered.
        const total = batchesInfo.length;
        const nextBatch = batchesInfo.find((b) => !b.done);
        const batchNumber = nextBatch?.batchNumber;
        if (!batchNumber) {
            await fgStatus.updateStatusToStateLib({ status: FgStatus.PROJECT_STATUS.COMPLETED });
            return successResponse('None to be processed!');
        }

        respPayload = `Unpublishing batch ${batchNumber} / ${total}`;
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });

        logger.info(respPayload);
        await fgDeleteActionHelper.processBatch(appConfig, batchManager, nextBatch);
        await batchManager.writeToInstanceFile(instanceContent);

        // Complete the process when all batches are compelted
        const hasPendingBatches = batchesInfo.find((b) => !b.done);
        logger.info(`Has pending batches ${hasPendingBatches}`);
        if (!hasPendingBatches) {
            const sharepoint = new Sharepoint(appConfig);
            await fgDeleteActionHelper.completeProcess(payload.projectExcelPath, batchManager, batchesInfo, fgStatus, sharepoint);
            respPayload = 'Delete process completed.';
        }
        logger.info(respPayload);

        respPayload = 'Delete trigger and track completed.';
    } catch (err) {
        logger.error(err);
        respPayload = err;
        // In case of error log status with end time
        try {
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR,
                statusMessage: err.message,
            });
        } catch (err2) {
            logger.info('Error while updatnig failed status');
        }
    }
    await batchManager.markInstancePaused();
    return {
        body: respPayload,
    };
}

exports.main = main;
