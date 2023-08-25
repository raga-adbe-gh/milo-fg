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
    getAioLogger, PROMOTE_ACTION
} = require('../utils');
const appConfig = require('../appConfig');
const sharepointAuth = require('../sharepointAuth');
const FgStatus = require('../fgStatus');
const FgUser = require('../fgUser');

// This returns the activation ID of the action that it called
async function main(args) {
    const logger = getAioLogger();
    appConfig.setAppConfig(args);
    let stepMsg;
    const payload = appConfig.getPayload();
    const userDetails = sharepointAuth.getUserDetails(payload.spToken);
    const fgStatus = new FgStatus({ action: PROMOTE_ACTION, userDetails });
    logger.info(`Promote action for ${payload.fgRootFolder} triggered by ${JSON.stringify(userDetails)}`);
    try {
        if (!payload.fgRootFolder) {
            stepMsg = 'Required data is not available to proceed with FG Promote action.';
            logger.error(stepMsg);
        } else if (!payload.adminPageUri || !payload.projectExcelPath) {
            stepMsg = 'Required data is not available to proceed with FG Promote action.';
            logger.error(stepMsg);
            stepMsg = await fgStatus.updateStatusToStateLib({
                status: FgStatus.PROJECT_STATUS.FAILED,
                statusMessage: stepMsg
            });
        } else {
            const ow = openwhisk();
            const storeValue = await fgStatus.getStatusFromStateLib();
            const svStatus = storeValue?.action?.status;
            const fgInProg = FgStatus.isInProgress(svStatus);
            const fgUser = new FgUser({ at: args.spToken });
            if (!await fgUser.isUser()) {
                stepMsg = 'Unauthorized Access! Please contact Floodgate Administrators.';
                storeValue.action.status = FgStatus.PROJECT_STATUS.FAILED;
                storeValue.action.message = stepMsg;
                stepMsg = storeValue;
            } else if (!appConfig.getSkipInProgressCheck() && fgInProg) {
                stepMsg = `A promote action project with activationid: ${storeValue?.action?.activationId} is already in progress. 
                Not triggering this action. And the previous action can be retrieved by refreshing the console page`;
                storeValue.action.status = FgStatus.PROJECT_STATUS.FAILED;
                storeValue.action.message = stepMsg;
                stepMsg = storeValue;
            } else {
                fgStatus.clearState();
                stepMsg = await fgStatus.updateStatusToStateLib({
                    status: FgStatus.PROJECT_STATUS.STARTED,
                    statusMessage: 'Triggering promote action',
                    batches: {}
                });
                logger.info(`FGStatus store ${await fgStatus.getStatusFromStateLib()}`);

                return ow.actions.invoke({
                    name: 'milo-fg/promote-create-batch',
                    blocking: false, // this is the flag that instructs to execute the worker asynchronous
                    result: false,
                    params: appConfig.getPassthruParams()
                }).then(async (result) => {
                    //  attaching activation id to the status
                    stepMsg = await fgStatus.updateStatusToStateLib({
                        status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                        activationId: result.activationId
                    });
                    return {
                        code: 200,
                        payload: stepMsg
                    };
                }).catch(async (err) => {
                    stepMsg = await fgStatus.updateStatusToStateLib({
                        status: FgStatus.PROJECT_STATUS.FAILED,
                        statusMessage: `Failed to invoke actions ${err.message}`
                    });
                    return {
                        code: 500,
                        payload: stepMsg
                    };
                });
            }
            return {
                code: 500,
                payload: stepMsg
            };
        }
    } catch (err) {
        logger.error(err);
        stepMsg = await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.FAILED,
            statusMessage: `Failed to invoke actions ${err.message}`
        });
    }

    return {
        code: 500,
        payload: stepMsg,
    };
}

exports.main = main;
