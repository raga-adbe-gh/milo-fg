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
    toUTCStr, getAioLogger, logMemUsage, DELETE_ACTION
} = require('../utils');
const FgStatus = require('../fgStatus');
const FgAction = require('../fgAction');
const AppConfig = require('../appConfig');

async function main(params) {
    logMemUsage();

    const logger = getAioLogger();
    let respPayload;
    const valParams = {
        statParams: ['fgRootFolder', 'projectExcelPath'],
        actParams: ['adminPageUri'],
    };
    const ow = openwhisk();

    // Initialize action
    const appConfig = new AppConfig(params);
    const fgAction = new FgAction(DELETE_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });
    const { fgStatus } = fgAction.getActionParams();
    const { projectExcelPath } = appConfig.getPayload();

    try {
        // Validations
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }

        respPayload = 'Started deleting content';
        logger.info(respPayload);

        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });

        const sharepoint = new Sharepoint(appConfig);
        const deleteStatus = await sharepoint.deleteFloodgateDir();
        respPayload = deleteStatus === false ?
            'Error occurred when deleting content. Check project excel sheet for additional information.' :
            'Delete action was completed';

        await fgStatus.updateStatusToStateLib({
            status: deleteStatus === false ? FgStatus.PROJECT_STATUS.COMPLETED_WITH_ERROR : FgStatus.PROJECT_STATUS.COMPLETED,
            statusMessage: respPayload
        });

        const { startTime: startDelete, endTime: endDelete } = fgStatus.getStartEndTime();
        const excelValues = [['DELETE', toUTCStr(startDelete), toUTCStr(endDelete), respPayload]];

        await sharepoint.updateExcelTable(projectExcelPath, 'DELETE_STATUS', excelValues);
        logger.info('Project excel file updated with delete status.');
    } catch (err) {
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
