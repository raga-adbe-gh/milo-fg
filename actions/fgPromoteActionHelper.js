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
const {
    handleExtension,
    delay,
    isFilePatternMatched,
    getAioLogger,
    logMemUsage,
    inParallel,
} = require('./utils');
const Sharepoint = require('./sharepoint');

const DELAY_TIME_PROMOTE = 100;
const MAX_CHILDREN = 5000;

class FgPromoteActionHelper {
    /**
     * Find all files in the FG tree to promote. Add to batches.
     * @param {BatchManager} batchManager - Instead of BatchManager
     * @param {AppConfig} appConfig - Application config with payload
     * @returns N/A
     */
    async createBatch(batchManager, appConfig) {
        const logger = getAioLogger();
        const sp = appConfig.getSpConfig();
        const sharepoint = new Sharepoint(appConfig);
        const options = await sharepoint.getAuthorizedRequestOption({ method: 'GET' });
        const promoteIgnoreList = appConfig.getPromoteIgnorePaths();
        logger.info(`Promote ignore list: ${promoteIgnoreList}`);

        // Temporarily restricting the iteration for promote to under /drafts folder only
        return this.findAndBatchFGFiles({
            baseURI: sp.api.file.get.fgBaseURI,
            options,
            fgFolders: appConfig.isDraftOnly() ? ['/drafts/raga/a'] : ['/drafts/raga/a'],
            promoteIgnoreList,
            downloadBaseURI: sp.api.file.download.baseURI,
            sharepoint
        }, batchManager);
    }

    /**
     * Iteratively finds all files under a specified root folder. Add them to batches
     */
    async findAndBatchFGFiles(
        {
            baseURI, options, fgFolders, promoteIgnoreList, downloadBaseURI, sharepoint
        }, batchManager
    ) {
        const logger = getAioLogger();
        const fgRoot = baseURI.split(':').pop();
        const pPathRegExp = new RegExp(`.*:${fgRoot}`);
        while (fgFolders.length !== 0) {
            const uri = `${baseURI}${fgFolders.shift()}:/children?$top=${MAX_CHILDREN}`;
            // eslint-disable-next-line no-await-in-loop
            const res = await sharepoint.fetchWithRetry(uri, options);
            if (res.ok) {
                // eslint-disable-next-line no-await-in-loop
                const json = await res.json();
                // eslint-disable-next-line no-await-in-loop
                const driveItems = json.value;
                for (let di = 0; di < driveItems?.length; di += 1) {
                    const item = driveItems[di];
                    const itemPath = `${item.parentReference.path.replace(pPathRegExp, '')}/${item.name}`;
                    if (!isFilePatternMatched(itemPath, promoteIgnoreList)) {
                        if (item.folder) {
                            // it is a folder
                            fgFolders.push(itemPath);
                        } else {
                            const downloadUrl = `${downloadBaseURI}/${item.id}/content`;
                            const mimeType = item.file?.mimeType;
                            // eslint-disable-next-line no-await-in-loop
                            await batchManager.addFile({ fileDownloadUrl: downloadUrl, filePath: itemPath, mimeType });
                        }
                    } else {
                        logger.info(`Ignored from promote: ${itemPath}`);
                    }
                }
            }
        }
    }

    async promoteFile(batchItem, { appConfig, sharepoint }) {
        const logger = getAioLogger();
        const spConfig = await appConfig.getSpConfig();
        const { fileDownloadUrl, filePath, mimeType } = batchItem.file;
        const status = { success: false, srcPath: filePath };
        try {
            const content = await sharepoint.getFileUsingDownloadUrl(fileDownloadUrl);
            const uploadStatus = await sharepoint.uploadFileByPath(spConfig, filePath, { content, mimeType });
            status.success = uploadStatus.success;
            status.locked = uploadStatus.locked;
        } catch (error) {
            logger.error(`Error promoting files ${fileDownloadUrl} at ${filePath} to main content tree ${error.message}`);
        }
        return status;
    }

    async promoteFloodgatedFiles(batchManager, appConfig) {
        const logger = getAioLogger();
        const sharepoint = new Sharepoint(appConfig);
        // Pre check Access Token
        await sharepoint.getSharepointAuth().getAccessToken();
        await delay(DELAY_TIME_PROMOTE);

        let stepMsg = 'Getting all floodgated files to promote.';
        // Get the batch files using the batchmanager for the assigned batch and process them
        const currentBatch = await batchManager.getCurrentBatch();
        const currBatchLbl = `Batch-${currentBatch.getBatchNumber()}`;
        const allFloodgatedFiles = await currentBatch?.getFiles();
        const numBulkReq = appConfig.getNumBulkReq();
        logger.info(`Files for the batch are ${allFloodgatedFiles.length}`);

        const promoteStatuses = await inParallel(allFloodgatedFiles, this.promoteFile, logger, false, { appConfig, sharepoint }, numBulkReq);

        stepMsg = `Completed promoting all documents in the batch ${currBatchLbl}`;
        logger.info(stepMsg);

        const failedPromotes = promoteStatuses.filter((status) => !status.success)
            .map((status) => ({path: status.srcPath || 'Path Info Not available', message: `${status.locked ? 'locked': ''}`}));
        logger.info(`Promote ${currBatchLbl}, Prm: ${failedPromotes?.length}`);

        if (failedPromotes.length > 0) {
            stepMsg = 'Error occurred when promoting floodgated content. Check project excel sheet for additional information.';
            logger.info(stepMsg);
            // Write the information to batch manifest
            await currentBatch.writeResults({ failedPromotes });
        } else {
            stepMsg = `Promoted floodgate for ${currBatchLbl} successfully`;
            logger.info(stepMsg);
        }
        logMemUsage();
        stepMsg = `Floodgate promote (copy) of ${currBatchLbl} is completed`;
        return stepMsg;
    }

    async previewPublish(doPublish, { batchManager, helixUtils }) {
        const logger = getAioLogger();

        let stepMsg = 'Getting all batch files.';
        // Get the batch files using the batchmanager for the assigned batch and process them
        const currentBatch = await batchManager.getCurrentBatch();
        const currBatchLbl = `Batch-${currentBatch.getBatchNumber()}`;
        const allFloodgatedFiles = await currentBatch.getFiles();
        const promotedFiles = allFloodgatedFiles.map((e) => e.file.filePath);
        const resultsContent = await currentBatch.getResultsContent() || {};
        const failedPromotes = resultsContent.failedPromotes || [];
        const prevPaths = promotedFiles.filter((item) => !failedPromotes.find(fpItem => fpItem.path === item)).map((e) => handleExtension(e));
        logger.info(`Post promote files for ${currBatchLbl} are ${prevPaths?.length}`);

        logger.info('Previewing promoted files.');
        let previewStatuses = [];
        let publishStatuses = [];
        if (helixUtils.canBulkPreviewPublish()) {
            previewStatuses = await helixUtils.bulkPreviewPublish(prevPaths, helixUtils.getOperations().PREVIEW);
            stepMsg = 'Completed generating Preview for promoted files.';
            logger.info(stepMsg);

            if (doPublish) {
                stepMsg = 'Publishing promoted files.';
                logger.info(stepMsg);
                publishStatuses = await helixUtils.bulkPreviewPublish(prevPaths, helixUtils.getOperations().PUBLISH);
                stepMsg = 'Completed Publishing for promoted files';
                logger.info(stepMsg);
            }
        }

        const failedPreviews = previewStatuses.filter((status) => !status.success)
            .map((status) => ({path: status.path}));
        const failedPublishes = publishStatuses.filter((status) => !status.success)
            .map((status) => ({path: status.path}));
        logger.info(`Post promote ${currBatchLbl}, Prm: ${failedPromotes?.length}, Prv: ${failedPreviews?.length}, Pub: ${failedPublishes?.length}`)

        if (failedPromotes.length > 0 || failedPreviews.length > 0 || failedPublishes.length > 0) {
            stepMsg = 'Error occurred when promoting floodgated content. Check project excel sheet for additional information.';
            logger.info(stepMsg);
            // Write the information to batch manifest
            currentBatch.writeResults({ failedPromotes, failedPreviews, failedPublishes });
            throw new Error(stepMsg);
        }
        logMemUsage();
        logger.info(`All tasks for promote ${currBatchLbl} is completed`);
        stepMsg = 'All tasks for floodgate promote is completed';
        return stepMsg;
    }
}

module.exports = FgPromoteActionHelper;
