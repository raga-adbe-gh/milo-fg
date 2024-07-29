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
    toUTCStr, getAioLogger, PROMOTE_ACTION: DELETE_ACTION, PROMOTE_BATCH, actInProgress
} = require('../utils');
const AppConfig = require('../appConfig');
const FgStatus = require('../fgStatus');
const BatchManager = require('../batchManager');
const FgAction = require('../fgAction');

const logger = getAioLogger();

async function main(params) {

    const valParams = {
        statParams: ['fgRootFolder'],
        actParams: ['adminPageUri', 'projectExcelPath'],
        checkUser: false,
        checkStatus: false,
        checkActivation: false
    };
    const ow = openwhisk();

    let appConfig = new AppConfig(params);
    const batchManager = new BatchManager({ key: DELETE_ACTION, batchConfig: appConfig.getBatchConfig() });
    await batchManager.init();
    // Read instance_info.json
    const instanceContent = await batchManager.getInstanceData();
    if (!instanceContent || !instanceContent.dtls) {
        return { body: 'None to run!' };
    }

    const { batchesInfo } = instanceContent.dtls;

    // Initialize action
    appConfig = new AppConfig({ ...params, ...instanceContent.dtls });
    const fgAction = new FgAction(DELETE_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });
    const { fgStatus } = fgAction.getActionParams();
    const { payload } = appConfig.getConfig();

    try {
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }

        // Checks how many batches are in progress and the total batch count
        const promoteProg = batchesInfo.reduce((acc, item) => {
            acc.total += 1;
            acc.prog += item.done || item.activationId ? 1 : 0;
            return acc;
        }, { total: 0, prog: 0 });

        respPayload = promoteProg.prog ? `Promoting batch ${promoteProg.prog} / ${promoteProg.total}.` : 'Promoting files.';
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });
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
    return {
        body: respPayload,
    };
}

exports.main = main;
