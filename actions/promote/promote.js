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
const openwhisk = require('openwhisk');
const {
    getAioLogger, actInProgress, PROMOTE_ACTION
} = require('../utils');
const appConfig = require('../appConfig');
const { isAuthorizedUser } = require('../sharepoint');
const sharepointAuth = require('../sharepointAuth');
const FgStatus = require('../fgStatus');

// This returns the activation ID of the action that it called
async function main(args) {
    const logger = getAioLogger();
    let payload;
    const {
        spToken, adminPageUri, projectExcelPath, fgRootFolder
    } = args;
    appConfig.setAppConfig(args);
    const userDetails = sharepointAuth.getUserDetails(spToken);
    const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: fgRootFolder, userDetails });
    logger.info(`Promote action for ${fgRootFolder} triggered by ${JSON.stringify(userDetails)}`);
    try {
        if (!fgRootFolder) {
            payload = 'Required data is not available to proceed with FG Promote action.';
            logger.error(payload);
        } else if (!adminPageUri || !projectExcelPath) {
            payload = 'Required data is not available to proceed with FG Promote action.';
            logger.error(payload);
            payload = await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.FAILED,
                statusMessage: payload
            });
        } else {
            const ow = openwhisk();
            const storeValue = await fgStatus.getStatusFromStateLib();
            const svStatus = storeValue?.action?.status;

            // Get Activation Status
            const fgInProg = FgStatus.isInProgress(svStatus);
            const actId = storeValue?.action?.activationId;
            const actInProg = await actInProgress(ow, actId, fgInProg);

            // Get Tracker Status - If batch is completed then check tracker as well
            const trackerActId = storeValue?.action?.batches?.activationId;
            const trackerInProg = trackerActId && !actInProg ?
                await actInProgress(ow, trackerActId, fgInProg) : actInProg;

            const accountDtls = await isAuthorizedUser(spToken);
            if (!accountDtls) {
                payload = 'Could not determine the user.';
                logger.error(payload);
            } else if (!appConfig.getSkipInProgressCheck() && trackerInProg) {
                payload = `A promote action project with activationid: ${storeValue?.action?.activationId} is already in progress. 
                Not triggering this action. And the previous action can be retrieved by refreshing the console page`;
                storeValue.action.status = FgStatus.PROJECT_STATUS.FAILED;
                storeValue.action.message = payload;
                payload = storeValue;
            } else {
                payload = await fgStatus.updateStatusToStateLib({
                    status: FgStatus.PROJECT_STATUS.STARTED,
                    statusMessage: 'Triggering promote action',
                    batches: {}
                });
                return ow.actions.invoke({
                    name: 'milo-fg/promote-batch',
                    blocking: false, // this is the flag that instructs to execute the worker asynchronous
                    result: false,
                    params: args
                }).then(async (result) => {
                    logger.info(result);
                    //  attaching activation id to the status
                    payload = await fgStatus.updateStatusToStateLib({
                        status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                        activationId: result.activationId
                    });
                    return {
                        code: 200,
                        payload
                    };
                }).catch(async (err) => {
                    payload = await fgStatus.updateStatusToStateLib({
                        status: FgStatus.PROJECT_STATUS.FAILED,
                        statusMessage: `Failed to invoke actions ${err.message}`
                    });
                    return {
                        code: 500,
                        payload
                    };
                });
            }
            return {
                code: 500,
                payload
            };
        }
    } catch (err) {
        logger.error(err);
        payload = fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.FAILED,
            statusMessage: `Failed to invoke actions ${err.message}`
        });
    }

    return {
        code: 500,
        payload,
    };
}

exports.main = main;
