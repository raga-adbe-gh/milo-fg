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
    getAioLogger, logMemUsage, getInstanceKey, PROMOTE_ACTION, PROMOTE_BATCH
} = require('../utils');
const HelixUtils = require('../helixUtils');
const FgAction = require('../fgAction');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');
const AppConfig = require('../appConfig');
const FgPromoteActionHelper = require('../fgPromoteActionHelper');

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
    logger.info(`Post promote worker started for batch ${batchNumber}`);
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

        respPayload = 'Previewing/Publishing promoted content';
        logger.info(respPayload);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });
        const helixUtils = new HelixUtils(appConfig);
        const fgPromoteActionHelper = new FgPromoteActionHelper();
        respPayload = await fgPromoteActionHelper.previewPublish(appConfig.getDoPublish(), { batchManager, helixUtils });
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.COMPLETED,
            statusMessage: respPayload
        });
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

exports.main = main;
