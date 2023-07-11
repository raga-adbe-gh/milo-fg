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
    getAioLogger, PROMOTE_ACTION, PROMOTE_BATCH, actInProgress
} = require('../utils');
const appConfig = require('../appConfig');
const urlInfo = require('../urlInfo');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');

const logger = getAioLogger();

async function main(params) {
    let payload;
    const filesSdk = await filesLib.init();
    appConfig.setAppConfig(params);

    const batchManager = new BatchManager({ action: PROMOTE_ACTION, filesSdk });
    const intanceContent = await batchManager.resumeBatch();
    logger.info(`Instance data is ${JSON.stringify(intanceContent)}`);
    if (!intanceContent || !intanceContent.dtls) {
        return { body: 'None to run!' };
    }

    // Changes to dtls will get reflected back;
    const {
        adminPageUri,
        projectExcelPath,
        fgRootFolder,
        batchesInfo
    } = intanceContent.dtls;

    const ow = openwhisk();
    // Reset with inputs
    appConfig.setAppConfig({
        ...params, adminPageUri, projectExcelPath, fgRootFolder
    });

    const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: fgRootFolder });

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
            logger.info(`Activation to check ${JSON.stringify(batchesInfo)}`);

            // Check to see all batches are complete
            const batchCheckResp = await checkBatchesInProg(fgRootFolder, batchesInfo, ow);
            logger.info(`Batch check response ${JSON.stringify(batchCheckResp)}`);
            const { anyInProg, allDone } = batchCheckResp;
            // write to manifest
            await batchManager.writeToManifest(intanceContent);

            // Collect status and mark as complete
            if (allDone) {
                await completePromote(projectExcelPath, batchesInfo, batchManager, fgStatus);
            } else if (!anyInProg) {
                // Trigger next activation
                const nextItem = batchesInfo.find((b) => !b.activationId);
                const nextBatchNumber = nextItem?.batchNumber;
                if (nextBatchNumber) {
                    const newActDtls = await triggerActivation(ow,
                        { adminPageUri, projectExcelPath, fgRootFolder },
                        nextItem,
                        fgStatus);
                    nextItem.activationId = newActDtls?.activationId;
                }
            }
            // write to manifest
            await batchManager.writeToManifest(intanceContent);

            payload = 'Promoted trigger and track completed.';
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
 * Checks if activativation is in progress by inspecting state and activations
 * @param {*} fgRootFolder Root folder
 * @param {*} actDtls activation details like activation id
 * @param {*} ow Openwisk api interface
 * @returns flag if any activation is in progress
 */
async function checkBatchesInProg(fgRootFolder, actDtls, ow) {
    let fgStatus;
    let batchInProg = false;
    let allDone = true;
    let counter = 0;
    for (; counter < actDtls?.length && !batchInProg; counter += 1) {
        const { batchNumber, activationId, done } = actDtls[counter];
        if (activationId && !done) {
            fgStatus = new FgStatus({
                action: `${PROMOTE_BATCH}_${batchNumber}`,
                statusKey: `${fgRootFolder}~Batch_${batchNumber}`
            });
            batchInProg = await fgStatus?.getStatusFromStateLib().then((result) => {
                if (result.action && FgStatus.isInProgress(result.action.status)) {
                    return true;
                }
                return false;
            });
            if (batchInProg) batchInProg = await actInProgress(ow, activationId, batchInProg);
            actDtls[counter].done = !batchInProg;
            allDone &&= !batchInProg;
        } else {
            allDone &&= done;
        }
    }
    return { anyInProg: batchInProg, allDone };
}

/**
 * The batch for which the activation is triggered.
 * @param {*} ow Openwish interface instance
 * @param {*} args args the this action (e.g. projectPath)
 * @param {*} batch Batch for which activation is triggered
 * @param {*} fgStatus Floodgate status to store the fields
 * @returns status with details of activations
 * @returns status of activation
 */
async function triggerActivation2(ow, args, batchData, fgStatus) {
    logger.info('Dummy triggerActivation');
    return {
        batchNumber: batchData.batchNumber,
        activationId: `dummy_activation_${batchData.batchNumber}`
    };
}

async function triggerActivation(ow, args, batchData, fgStatus) {
    return ow.actions.invoke({
        name: 'milo-fg/promote-worker',
        blocking: false, // this is the flag that instructs to execute the worker asynchronous
        result: false,
        params: { batchNumber: batchData.batchNumber, ...args }
    }).then(async (result) => {
        // attaching activation id to the status
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            activationId: result.activationId
        });
        return {
            batchNumber: batchData.batchNumber,
            activationId: result.activationId
        };
    }).catch(async (err) => {
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: `Failed to invoke actions ${err.message} for batch ${batchData?.batchNumber}`
        });
        logger.error('Failed to invoke actions', err);
        return {
            batchNumber: batchData.batchNumber
        };
    });
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
    let results;
    const failedPromotes = [];
    const failedPreviews = [];
    const failedPublishes = [];
    for (let i = 0; i < actDtls?.length || 0; i += 1) {
        batchNumber = actDtls[i].batchNumber;
        logger.info(`Batch check is ${JSON.stringify(actDtls[i])}`);
        batchManager.setupCurrentBatch({ batchNumber });
        try {
            const batch = batchManager.getCurrentBatch();
            logger.info(`Batch is ${JSON.stringify(batch)}`);
            results = await batch.getResultsContent();
            if (results?.failedPromotes?.length > 0) {
                failedPromotes.push(...results.failedPromotes);
            }
            if (results?.failedPreviews?.length > 0) {
                failedPreviews.push(...results.failedPreviews);
            }
            if (results?.failedPublishes?.length > 0) {
                failedPublishes.push(...results.failedPublishes);
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

    await batchManager.markComplete();
    logger.info('Marked complete in batch manager.');
}

exports.main = main;
