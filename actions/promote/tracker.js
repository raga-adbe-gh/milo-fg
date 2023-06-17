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
const filesLib = require('@adobe/aio-lib-files');
const { updateExcelTable } = require('../sharepoint');
const {
    getAioLogger, logMemUsage, delay, PROMOTE_ACTION, PROMOTE_BATCH, actInProgress
} = require('../utils');
const appConfig = require('../appConfig');
const urlInfo = require('../urlInfo');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');

const DELAY_IN_CHECKS = 60000; // Move to config later
const MAX_CHECKS = (60 * 60 * 1000) / DELAY_IN_CHECKS; // 60 mins is aio timeoout
const logger = getAioLogger();

/**
 * Initial version of tracker. More checks would be needed to cover few senarios
 * 1. Checks if the activations are in progress.
 * 2. If all activations are completed then manifest file is read to collect the failures.
 * Few of changes to be done
 * 1. Retry for few times if the activation is not present
 * 2. Retry for few time if the manifest is not present.
 */
async function main(params) {
    const ow = openwhisk();
    logMemUsage();
    let payload;
    const {
        adminPageUri, projectExcelPath, fgRootFolder, actDtls
    } = params;
    appConfig.setAppConfig(params);
    const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: fgRootFolder });
    const filesSdk = await filesLib.init();
    const batchManager = new BatchManager({ action: PROMOTE_ACTION, filesSdk });
    try {
        if (!fgRootFolder) {
            payload = 'Required data is not available to proceed with FG Promote action.';
            logger.error(payload);
        } else if (!adminPageUri || !projectExcelPath) {
            payload = 'Required data is not available to proceed with FG Promote action.';
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.FAILED,
                statusMessage: payload
            });
            logger.error(payload);
        } else {
            urlInfo.setUrlInfo(adminPageUri);
            payload = 'Getting status of all reference activation.';
            fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                statusMessage: payload
            });
            logger.info(`Activation to check ${JSON.stringify(actDtls)}`);

            // Check to see all batches are complete
            await checkBatches(fgRootFolder, actDtls, ow);
            logger.info('Batch check comopleted proceed to mark complete');

            // Collect status and mark as complete
            await completePromote(projectExcelPath, actDtls, batchManager, fgStatus);

            payload = 'Promoted floodgate tree successfully.';
            logger.info(payload);
        }
    } catch (err) {
        logger.error(err);
        payload = err;
        // In case of error log status with end time
        try {
            fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR,
                statusMessage: err.message,
            });
        } catch (err2) {
            logger.info('Error while updatnig failed status');
        }
    }

    return {
        body: payload,
    };
}

/**
 * Wrapper that waits for all batches to complete
 * @param {*} fgRootFolder Floodgatet folder path
 * @param {*} actDtls Acttivation details of all batches
 */
async function checkBatches(fgRootFolder, actDtls, ow) {
    let counter = 0;
    while (await checkBatchesInProg(fgRootFolder, actDtls, ow) && counter < MAX_CHECKS) {
        counter += 1;
        await delay(DELAY_IN_CHECKS);
    }
}

/**
 * Checks if activativation is in progress by inspecting state and activations
 * @param {*} fgRootFolder Root folder
 * @param {*} actDtls activation details like activation id
 * @param {*} ow Openwisk api interface
 * @returns flag if any activation is in progress
 */
async function checkBatchesInProg(fgRootFolder, actDtls, ow) {
    let fgStatus;
    let batchInProg = false;
    for (let i = 0; i < actDtls?.length && !batchInProg; i += 1) {
        const { batchNumber } = actDtls[i];
        fgStatus = new FgStatus({
            action: `${PROMOTE_BATCH}_${batchNumber}`,
            statusKey: `${fgRootFolder}~Batch_${batchNumber}`
        });
        batchInProg = await fgStatus?.getStatusFromStateLib().then((result) => {
            if (result.action && FgStatus.isInProgress(result.action.status)) {
                // logger.info(`${fgRootFolder}~Batch_${batchNumber} in progress!`);
                return true;
            }
            return false;
        });
        if (batchInProg) batchInProg = await actInProgress(ow, actDtls[i].activationId, batchInProg);
    }
    return batchInProg;
}

/**
 * Marks the proocess as complete and collects all errors and updates excel.
 * @param {*} projectExcelPath Project excel where status needs to be updated
 * @param {*} actDtls activation details like id
 * @param {*} batchManager BatchManager to get batch details like path
 * @param {*} fgStatus Floodgate status instance to update state
 */
async function completePromote(projectExcelPath, actDtls, batchManager, fgStatus) {
    let batchNumber;
    let manifest;
    const failedPromotes = [];
    const failedPreviews = [];
    const failedPublishes = [];
    for (let i = 0; i < actDtls?.length || 0; i += 1) {
        batchNumber = actDtls[i].batchNumber;
        batchManager.setupCurrentBatch({ batchNumber });
        try {
            manifest = await batchManager.getCurrentBatchManifestContent();
            if (manifest?.failedPromotes?.length > 0) {
                failedPromotes.push(...manifest.failedPromotes);
            }
            if (manifest?.failedPreviews?.length > 0) {
                failedPreviews.push(...manifest.failedPreviews);
            }
            if (manifest?.failedPublishes?.length > 0) {
                failedPublishes.push(...manifest.failedPublishes);
            }
        } catch (err) {
            logger.error(`Error while reading batch content in tracker ${err}`);
        }
    }

    const fgErrors = failedPromotes.length > 0 || failedPreviews.length > 0 ||
        failedPublishes.length > 0;

    // Write to Excel
    await fgStatus.updateStatusToStateLib({
        status: fgErrors ? FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR : FgStatus.PROJECT_STATUS.COMPLETED,
        statusMessage: fgErrors ?
            'Error occurred when promoting floodgated content. Check project excel sheet for additional information.' :
            'Promoted floodgate tree successfully.'
    });
    const { startTime: startPromote, endTime: endPromote } = fgStatus.getStartEndTime();
    const excelValues = [['PROMOTE', startPromote, endPromote, failedPromotes.join('\n'), failedPreviews.join('\n'), failedPublishes.join('\n')]];
    await updateExcelTable(projectExcelPath, 'PROMOTE_STATUS', excelValues);
    logger.info('Project excel file updated with promote status.');
}

exports.main = main;
