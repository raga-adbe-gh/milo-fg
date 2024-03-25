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
const AppConfig = require('../appConfig');
const {
    getAioLogger, COPY_ACTION, PROMOTE_ACTION, DELETE_ACTION
} = require('../utils');
const FgStatus = require('../fgStatus');

const actionMap = {
    copy: COPY_ACTION,
    promote: PROMOTE_ACTION,
    delete: DELETE_ACTION
};

// This returns the activation ID of the action that it called
async function main(args) {
    const logger = getAioLogger();
    let payload;
    try {
        const appConfig = new AppConfig(args);
        const {
            type, shareUrl, fgShareUrl
        } = args;
        if (!type || !(shareUrl || fgShareUrl)) {
            payload = 'Status : Required data is not available to get the status.';
            logger.error(payload);
        } else {
            const fgStatus = new FgStatus({ action: actionMap[type], appConfig });
            payload = await fgStatus.getStatusFromStateLib();
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
