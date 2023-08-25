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

// eslint-disable-next-line import/no-extraneous-dependencies
const appConfig = require('../appConfig');
const { getAioLogger, COPY_ACTION } = require('../utils');
const FgStatus = require('../fgStatus');

// This returns the activation ID of the action that it called
async function main(args) {
    const logger = getAioLogger();
    let payload;
    try {
        appConfig.setAppConfig(args);
        const { projectExcelPath, projectRoot, action } = args;
        if (!projectExcelPath && !projectRoot) {
            payload = 'Status : Required data is not available to get the status.';
            logger.error(payload);
        } else {
            const fgStatus = new FgStatus({ action });
            logger.info(`Status key -- ${fgStatus.getStoreKey()}`);
            payload = await fgStatus.getStatusFromStateLib();

            logger.info(`Status here -- ${JSON.stringify(payload)}`);
        }
    } catch (err) {
        logger.error(err);
        payload = err;
    }

    return {
        payload,
    };
}

exports.main = main;
