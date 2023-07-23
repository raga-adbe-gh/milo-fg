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

const { getConfig } = require('../config');
const {
    getAuthorizedRequestOption, saveFile, getFileUsingDownloadUrl, fetchWithRetry
} = require('../sharepoint');
const {
    getAioLogger, simulatePreviewPublish, handleExtension, delay, logMemUsage, getInstanceKey, PREVIEW, PUBLISH, PROMOTE_ACTION, PROMOTE_BATCH
} = require('../utils');
const appConfig = require('../appConfig');
const urlInfo = require('../urlInfo');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');

const DELAY_TIME_PROMOTE = 3000;
const ENABLE_HLX_PREVIEW = false;

async function main(params) {
    const logger = getAioLogger();
    logMemUsage();
    let payload;
    const {
        adminPageUri, projectExcelPath, fgRootFolder, doPublish, batchNumber
    } = params;
    appConfig.setAppConfig(params);
    // Tracker uses the below hence change here might need change in tracker as well.
    const fgStatus = new FgStatus({ action: `${PROMOTE_BATCH}_${batchNumber}`, statusKey: `${fgRootFolder}~Batch_${batchNumber}` });
    const batchManager = new BatchManager({ key: PROMOTE_ACTION, instanceKey: getInstanceKey({ fgRootFolder }) });
    await batchManager.init({ batchNumber });
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
            payload = 'Getting all files to be promoted.';
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                statusMessage: payload
            });
            logger.info(payload);
            payload = await promoteFloodgatedFiles(projectExcelPath, doPublish, batchManager);
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.COMPLETED,
                statusMessage: payload
            });
        }
    } catch (err) {
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR,
            statusMessage: err.message,
        });
        logger.error(err);
        payload = err;
    }

    return {
        body: payload,
    };
}

/**
 * Copies the Floodgated files back to the main content tree.
 * Creates intermediate folders if needed.
 */
async function promoteCopy(srcPath, destinationFolder) {
    const { sp } = await getConfig();
    const { baseURI } = sp.api.file.copy;
    const rootFolder = baseURI.split('/').pop();
    const payload = { ...sp.api.file.copy.payload, parentReference: { path: `${rootFolder}${destinationFolder}` } };
    const options = await getAuthorizedRequestOption({
        method: sp.api.file.copy.method,
        body: JSON.stringify(payload),
    });

    // copy source is the pink directory for promote
    const copyStatusInfo = await fetchWithRetry(`${sp.api.file.copy.fgBaseURI}${srcPath}:/copy?@microsoft.graph.conflictBehavior=replace`, options);
    const statusUrl = copyStatusInfo.headers.get('Location');
    let copySuccess = false;
    let copyStatusJson = {};
    while (statusUrl && !copySuccess && copyStatusJson.status !== 'failed') {
        // eslint-disable-next-line no-await-in-loop
        const status = await fetchWithRetry(statusUrl);
        if (status.ok) {
            // eslint-disable-next-line no-await-in-loop
            copyStatusJson = await status.json();
            copySuccess = copyStatusJson.status === 'completed';
        }
    }
    return copySuccess;
}

async function promoteFloodgatedFiles(projectExcelPath, doPublish, batchManager) {
    const logger = getAioLogger();

    async function promoteFile(batchItem) {
        const { fileDownloadUrl, filePath } = batchItem.file;
        const status = { success: false, srcPath: filePath };
        try {
            let promoteSuccess = false;
            const destinationFolder = `${filePath.substring(0, filePath.lastIndexOf('/'))}`;
            const copyFileStatus = await promoteCopy(filePath, destinationFolder);
            if (copyFileStatus) {
                promoteSuccess = true;
            } else {
                const file = await getFileUsingDownloadUrl(fileDownloadUrl);
                const saveStatus = await saveFile(file, filePath);
                if (saveStatus.success) {
                    promoteSuccess = true;
                }
            }
            status.success = promoteSuccess;
        } catch (error) {
            const errorMessage = `Error promoting files ${fileDownloadUrl} at ${filePath} to main content tree ${error.message}`;
            logger.error(errorMessage);
            status.success = false;
        }
        return status;
    }

    let i = 0;
    let payload = 'Getting all floodgated files to promote.';
    // Get the batch files using the batchmanager for the assigned batch and process them
    const currentBatch = await batchManager.getCurrentBatch();
    const allFloodgatedFiles = await currentBatch?.getFiles();
    logger.info(`Files for the batch are ${allFloodgatedFiles.length}`);
    // create batches to process the data
    const batchArray = [];
    const numBulkReq = appConfig.getNumBulkReq();
    for (i = 0; i < allFloodgatedFiles.length; i += numBulkReq) {
        const arrayChunk = allFloodgatedFiles.slice(i, i + numBulkReq);
        batchArray.push(arrayChunk);
    }

    // process data in batches
    const promoteStatuses = [];
    for (i = 0; i < batchArray.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        promoteStatuses.push(...await Promise.all(
            batchArray[i].map((bi) => promoteFile(bi))
        ));
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await delay(DELAY_TIME_PROMOTE);
    }

    payload = 'Completed promoting all documents in the batch';
    logger.info(payload);

    logger.info('Previewing promoted files.');
    let previewStatuses = [];
    let publishStatuses = [];
    if (ENABLE_HLX_PREVIEW) {
        previewStatuses = await previewOrPublishPages(PREVIEW);
        payload = 'Completed generating Preview for promoted files.';
        logger.info(payload);

        if (doPublish) {
            payload = 'Publishing promoted files.';
            logger.info(payload);
            publishStatuses = await previewOrPublishPages(PUBLISH);
            payload = 'Completed Publishing for promoted files';
            logger.info(payload);
        }
    }

    const failedPromotes = promoteStatuses.filter((status) => !status.success)
        .map((status) => status.srcPath || 'Path Info Not available');
    const failedPreviews = previewStatuses.filter((status) => !status.success)
        .map((status) => status.path);
    const failedPublishes = publishStatuses.filter((status) => !status.success)
        .map((status) => status.path);
    logger.info(`Batch-${currentBatch.getBatchNumber()}, Prm: ${failedPromotes?.length}, Prv: ${failedPreviews?.length}, Pub: ${failedPublishes?.length}`);

    if (failedPromotes.length > 0 || failedPreviews.length > 0 || failedPublishes.length > 0) {
        payload = 'Error occurred when promoting floodgated content. Check project excel sheet for additional information.';
        logger.info(payload);
        // Write the information to batch manifest
        currentBatch.writeResults({ failedPromotes, failedPreviews, failedPublishes });
        throw new Error(payload);
    } else {
        payload = 'Promoted floodgate for batch successfully.';
        logger.info(payload);
    }
    logMemUsage();
    payload = 'All tasks for floodgate promote of batch is completed';
    return payload;

    async function previewOrPublishPages(operation) {
        const statuses = [];
        for (let ip = 0; ip < promoteStatuses.length; ip += 1) {
            if (promoteStatuses[ip].success) {
                // eslint-disable-next-line no-await-in-loop
                const result = await simulatePreviewPublish(handleExtension(promoteStatuses[ip].srcPath), operation, 1, false);
                statuses.push(result);
            }
            await delay();
        }
        return statuses;
    }
}

exports.main = main;
