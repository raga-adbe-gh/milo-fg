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
    logMemUsage
} = require('./utils');
const Sharepoint = require('./sharepoint');

const DELAY_TIME_PROMOTE = 3000;
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
            fgFolders: (appConfig || appConfig.isDraftOnly()) ? ['/drafts'] : [''],
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
                            // eslint-disable-next-line no-await-in-loop
                            await batchManager.addFile({ fileDownloadUrl: downloadUrl, filePath: itemPath });
                        }
                    } else {
                        logger.info(`Ignored from promote: ${itemPath}`);
                    }
                }
            }
        }
    }

    /**
     * Copies the Floodgated files back to the main content tree.
     * Creates intermediate folders if needed.
     */
    async promoteCopy(srcPath, destinationFolder, { sharepoint, sp }) {
        const { baseURI } = sp.api.file.copy;
        const rootFolder = baseURI.split('/').pop();
        const payload = { ...sp.api.file.copy.payload, parentReference: { path: `${rootFolder}${destinationFolder}` } };
        const options = await sharepoint.getAuthorizedRequestOption({
            method: sp.api.file.copy.method,
            body: JSON.stringify(payload),
        });

        // copy source is the pink directory for promote
        const copyStatusInfo = await sharepoint.fetchWithRetry(`${sp.api.file.copy.fgBaseURI}${srcPath}:/copy?@microsoft.graph.conflictBehavior=replace`, options);
        const statusUrl = copyStatusInfo.headers.get('Location');
        let copySuccess = false;
        let copyStatusJson = {};
        while (statusUrl && !copySuccess && copyStatusJson.status !== 'failed') {
            // eslint-disable-next-line no-await-in-loop
            const status = await sharepoint.fetchWithRetry(statusUrl);
            if (status.ok) {
                // eslint-disable-next-line no-await-in-loop
                copyStatusJson = await status.json();
                copySuccess = copyStatusJson.status === 'completed';
            }
        }
        return copySuccess;
    }

    async promoteFloodgatedFiles(batchManager, appConfig) {
        const logger = getAioLogger();
        const sharepoint = new Sharepoint(appConfig);
        const sp = await appConfig.getSpConfig();

        async function promoteFile(batchItem) {
            const { fileDownloadUrl, filePath } = batchItem.file;
            const status = { success: false, srcPath: filePath };
            try {
                let promoteSuccess = false;
                const destinationFolder = `${filePath.substring(0, filePath.lastIndexOf('/'))}`;
                const copyFileStatus = await this.promoteCopy(filePath, destinationFolder, { sharepoint, sp });
                if (copyFileStatus) {
                    promoteSuccess = true;
                } else {
                    const file = await sharepoint.getFileUsingDownloadUrl(fileDownloadUrl);
                    const saveStatus = await sharepoint.saveFile(file, filePath);
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
        let stepMsg = 'Getting all floodgated files to promote.';
        // Get the batch files using the batchmanager for the assigned batch and process them
        const currentBatch = await batchManager.getCurrentBatch();
        const currBatchLbl = `Batch-${currentBatch.getBatchNumber()}`;
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

        stepMsg = `Completed promoting all documents in the batch ${currBatchLbl}`;
        logger.info(stepMsg);

        const failedPromotes = promoteStatuses.filter((status) => !status.success)
            .map((status) => status.srcPath || 'Path Info Not available');
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
        const prevPaths = promotedFiles.filter((item) => !failedPromotes.includes(item)).map((e) => handleExtension(e));
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
                publishStatuses = await helixUtils.bulkPreviewPublish(prevPaths, helixUtils.getOperations().LIVE);
                stepMsg = 'Completed Publishing for promoted files';
                logger.info(stepMsg);
            }
        }

        const failedPreviews = previewStatuses.filter((status) => !status.success)
            .map((status) => status.path);
        const failedPublishes = publishStatuses.filter((status) => !status.success)
            .map((status) => status.path);
        logger.info(`Post promote ${currBatchLbl}, Prm: ${failedPromotes?.length}, Prv: ${failedPreviews?.length}, Pub: ${failedPublishes?.length}`);

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
