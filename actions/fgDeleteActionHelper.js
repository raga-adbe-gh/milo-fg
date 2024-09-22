/* ***********************************************************************
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
const FgStatus = require('./fgStatus');
const { toUTCStr } = require('./utils');
const { getAioLogger } = require('./utils');
const HelixUtils = require('./helixUtils');

const logger = getAioLogger();

class FgDeleteActionHelper {
    async getBatch(batchManager, batchInstanceInfo) {
        batchManager.initBatch({ batchNumber: batchInstanceInfo.batchNumber });
        return batchManager.getCurrentBatch();
    }

    async processBatch(appConfig, batchManager, batchInstanceInfo) {
        const helixUtils = new HelixUtils(appConfig);
        const { fgColor } = appConfig.getPayload();
        const currentBatch = await this.getBatch(batchManager, batchInstanceInfo);
        const batchFilesContent = await currentBatch.getFiles();
        if (helixUtils.canBulkPreviewPublish(true, fgColor)) {
            const paths = batchFilesContent.map((e) => e.file.path);
            const unpublishStatuses = await helixUtils.bulkPreviewPublish(paths, helixUtils.getOperations().UNPUBLISH, { isFloodgate: true, fgColor });
            logger.debug(`Unpublish response is ${JSON.stringify(unpublishStatuses)}`);
            const failedUnpublishings = unpublishStatuses.filter((status) => !status.success)
                .map((status) => status.path);
            if (failedUnpublishings.length > 0) {
                currentBatch.writeResults({ failedUnpublishings });
            }
        }
        batchInstanceInfo.done = true;
    }

    async completeProcess(projectExcelPath, batchManager, batchesInfo, fgStatus, sharepoint) {
        const failedUnpublishings = [];
        let status = FgStatus.PROJECT_STATUS.COMPLETED;
        let statusMessage = 'Delete action was completed.';
        let excelStatusMessage = statusMessage;
        await batchesInfo.reduce(async (prev, curr) => {
            await prev;
            batchManager.initBatch({ batchNumber: curr.batchNumber });
            const batch = await batchManager.getCurrentBatch();
            const results = await batch.getResultsContent();
            if (results?.failedUnpublishings?.length > 0) {
                failedUnpublishings.push(...results.failedUnpublishings);
            }
        }, Promise.resolve());

        // Delete folder if all were unpublished
        if (failedUnpublishings.length) {
            status = FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR;
            statusMessage = 'Failed to unpublish files. Check excel for details.';
            excelStatusMessage = `${failedUnpublishings.join(' failed to publish.\n')} failed to publish.\n`;
        } else {
            const deleteStatus = await sharepoint.deleteFloodgateDir();
            if (!deleteStatus) {
                status = FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR;
                statusMessage = 'Files were unpublished but floodgate folder could not be deleted!';
                excelStatusMessage = statusMessage;
            }
        }

        await batchManager.markComplete(status !== FgStatus.PROJECT_STATUS.COMPLETED ? failedUnpublishings : [statusMessage]);

        await fgStatus.updateStatusToStateLib({ status, statusMessage });

        const { startTime: startDelete, endTime: endDelete } = fgStatus.getStartEndTime();

        const excelValues = [['DELETE', toUTCStr(startDelete), toUTCStr(endDelete), excelStatusMessage]];
        await sharepoint.updateExcelTable(projectExcelPath, 'DELETE_STATUS', excelValues);
    }
}

module.exports = FgDeleteActionHelper;
