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
const { getConfig } = require('../config');
const {
    getAuthorizedRequestOption, fetchWithRetry
} = require('../sharepoint');
const {
    getAioLogger, logMemUsage, getInstanceKey, PROMOTE_ACTION
} = require('../utils');
const appConfig = require('../appConfig');
const urlInfo = require('../urlInfo');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');

const logger = getAioLogger();
const MAX_CHILDREN = 5000;

/**
 * This is action interfacing method. The worker is split into two promoteBatch and worker.
 * This promoteBatch has following
 * 1. Searches for the files to be promoted (using msal search api)
 * 2. Using the batchmanger adds the files and this batchmanager splits into batches.
 * The batch information is also stored in manifest files and the actions are triggered
 * Following parameters are used and needs to be tweaked
 * 1. Number of files per batch - Assume 10k
 * 2. Number of activation per container - Assume 5
 * 3. Number of parallel copies - Assume 20
 * Assuming avg 5MB/file and assume that all parallel copies are loaded (i.e 20) total size is 100mb
 * and 5 container total is about 0.5gb and below treshold and can be tweaked.
 */
async function main(params) {
    const ow = openwhisk();
    logMemUsage();
    let payload;
    const {
        adminPageUri, projectExcelPath, fgRootFolder, doPublish
    } = params;
    appConfig.setAppConfig(params);
    const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: fgRootFolder });
    const batchManager = new BatchManager({ key: PROMOTE_ACTION, instanceKey: getInstanceKey({ fgRootFolder }) });
    await batchManager.init();
    // For current cleanup files before starting
    await batchManager.cleanupFiles();
    fgStatus.reset();
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
        } else {
            urlInfo.setUrlInfo(adminPageUri);
            payload = 'Getting all files to be promoted.';
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                statusMessage: payload
            });
            logger.info(payload);
            payload = 'Creating batches.';
            payload = await createBatch(batchManager);
            await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                statusMessage: payload,
                batchesInfo: batchManager.getBatchesInfo()
            });
            logger.info(payload);

            // Finalize and Trigger N Track the batches
            await batchManager.finalizeInstance({
                adminPageUri, projectExcelPath, fgRootFolder, doPublish
            });
            logger.info('Instance finalized and started');
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
 * Find all files in the pink tree to promote.
 */
async function findAllFiles() {
    const { sp } = await getConfig();
    const baseURI = `${sp.api.excel.update.fgBaseURI}`;
    const rootFolder = baseURI.split('/').pop();
    const options = await getAuthorizedRequestOption({ method: 'GET' });
    // Temporarily restricting the iteration for promote to under /drafts folder only
    return findAllFloodgatedFiles(baseURI, options, rootFolder, [], ['/drafts']);
}

/**
 * Iteratively finds all files under a specified root folder.
 */
async function findAllFloodgatedFiles(baseURI, options, rootFolder, fgFiles, fgFolders) {
    while (fgFolders.length !== 0) {
        const uri = `${baseURI}${fgFolders.shift()}:/children?$top=${MAX_CHILDREN}`;
        // eslint-disable-next-line no-await-in-loop
        const res = await fetchWithRetry(uri, options);
        if (res.ok) {
            // eslint-disable-next-line no-await-in-loop
            const json = await res.json();
            // eslint-disable-next-line no-await-in-loop
            const driveItems = json.value;
            driveItems?.forEach((item) => {
                const itemPath = `${item.parentReference.path.replace(`/drive/root:/${rootFolder}`, '')}/${item.name}`;
                if (item.folder) {
                    // it is a folder
                    fgFolders.push(itemPath);
                } else {
                    const downloadUrl = item['@microsoft.graph.downloadUrl'];
                    fgFiles.push({ fileDownloadUrl: downloadUrl, filePath: itemPath });
                }
            });
        }
    }

    return fgFiles;
}

/**
 * Create batches based on configs and files to process
 * @param {*} batchManager BatchManager for creating batches.
 */
async function createBatch(batchManager) {
    let payload = 'Getting all floodgated files to promote.';
    // Iterate the floodgate tree and get all files to promote
    const allFgFiles = await findAllFiles();
    logger.info(`Total files to process ${allFgFiles?.length}`);
    // create batches to process the data
    for (let i = 0; i < allFgFiles.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await batchManager.addFile(allFgFiles[i]);
    }
    payload = 'Completed creating batches';
    return payload;
}

exports.main = main;
