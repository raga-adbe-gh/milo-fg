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
    getAioLogger, logMemUsage, getInstanceKey, DELETE_ACTION
} = require('../utils');
const FgStatus = require('../fgStatus');
const FgAction = require('../fgAction');
const AppConfig = require('../appConfig');
const BatchManager = require('../batchManager');
const HelixUtils = require('../helixUtils');
const FgDeleteActionHelper = require('../fgDeleteActionHelper');
const Sharepoint = require('../sharepoint');

async function main(params) {
    logMemUsage();

    const logger = getAioLogger();
    let respPayload;
    const valParams = {
        statParams: ['fgRootFolder', 'projectExcelPath'],
        actParams: ['adminPageUri'],
    };

    // Initialize action
    const ow = openwhisk();
    const appConfig = new AppConfig(params);
    const fgAction = new FgAction(DELETE_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });

    const { fgStatus } = fgAction.getActionParams();
    const { projectExcelPath, fgColor } = appConfig.getPayload();
    const fgDeleteActionHelper = new FgDeleteActionHelper();
    const sharepoint = new Sharepoint(appConfig);

    try {
        // Validations
        const vStat = await fgAction.validateAction(valParams);
        if (vStat?.code !== 200) {
            return vStat;
        }

        respPayload = 'Started deleting content';
        const batchManager = new BatchManager({
            key: DELETE_ACTION,
            instanceKey: getInstanceKey(appConfig.getFgSiteKey()),
            batchConfig: appConfig.getDeleteBatchConfig()
        });

        await batchManager.init();
        // Clean up files before starting
        await batchManager.cleanupFiles();

        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });

        const helixUtils = new HelixUtils(appConfig);
        const filesToUnpublish = await helixUtils.getFilesToUnpublish(fgColor);
        logger.info(`List of files to unpublish: ${filesToUnpublish?.length}`);

        if (!filesToUnpublish) {
            throw new Error('Unable to get items to unpublish! Please retry after some time.');
        } else if (filesToUnpublish.length > 0) {
            await filesToUnpublish.reduce(async (acc, curr) => {
                await acc;
                await batchManager.addFile(curr);
            }, Promise.resolve());

            logger.info('Finalize instance');
            await batchManager.finalizeInstance(appConfig.getPassthruParams());
        } else {
            await fgDeleteActionHelper.completeProcess(projectExcelPath, batchManager, [], fgStatus, sharepoint);
        }

        logger.info('Batching completed');
    } catch (err) {
        await fgDeleteActionHelper.completeProcess();
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR,
            statusMessage: err.message
        });

        logger.error(err);
        respPayload = err;
    }

    logMemUsage();
    return {
        body: respPayload,
    };
}

exports.main = main;
