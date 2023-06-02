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
const { projectInProgress, PROJECT_STATUS } = require('../project');
const {
    getAioLogger, updateStatusToStateLib, COPY_ACTION, getStatusFromStateLib, actInProgress
} = require('../utils');
const appConfig = require('../appConfig');
const { isAuthorizedUser } = require('../sharepoint');

// This returns the activation ID of the action that it called
async function main(args) {
    const logger = getAioLogger();
    let payload;
    const {
        spToken, adminPageUri, projectExcelPath, rootFolder
    } = args;
    appConfig.setAppConfig(args);
    const projectPath = `${rootFolder}${projectExcelPath}`;
    try {
        if (!rootFolder || !projectExcelPath) {
            payload = 'Could not determine the project path. Try reloading the page and trigger the action again.';
            logger.error(payload);
        } else if (!adminPageUri) {
            payload = 'Required data is not available to proceed with FG Copy action.';
            logger.error(payload);
            payload = await updateStatusToStateLib(projectPath, PROJECT_STATUS.FAILED, payload, undefined, COPY_ACTION);
        } else {
            const ow = openwhisk();
            const storeValue = await getStatusFromStateLib(projectPath);
            const actId = storeValue?.action?.activationId;
            const svStatus = storeValue?.action?.status;
            const accountDtls = await isAuthorizedUser(spToken);
            if (!accountDtls) {
                payload = 'Could not determine the user.';
                logger.error(payload);
            } else if (!appConfig.getSkipInProgressCheck() && await actInProgress(ow, actId, projectInProgress(svStatus))) {
                payload = `A copy action project with activationid: ${storeValue?.action?.activationId} is already in progress. 
                Not triggering this action. And the previous action can be retrieved by refreshing the console page`;
                storeValue.action.status = PROJECT_STATUS.FAILED;
                storeValue.action.message = payload;
                payload = storeValue;
            } else {
                payload = await updateStatusToStateLib(projectPath, PROJECT_STATUS.STARTED, 'Triggering copy action', '', COPY_ACTION);
                return ow.actions.invoke({
                    name: 'milo-fg/copy-worker',
                    blocking: false, // this is the flag that instructs to execute the worker asynchronous
                    result: false,
                    params: { ...args, accountDtls: {oid: accountDtls?.oid} }
                }).then(async (result) => {
                    logger.info(result);
                    //  attaching activation id to the status
                    payload = await updateStatusToStateLib(projectPath, PROJECT_STATUS.IN_PROGRESS, undefined, result.activationId, COPY_ACTION);
                    return {
                        code: 200,
                        payload
                    };
                }).catch(async (err) => {
                    payload = await updateStatusToStateLib(projectPath, PROJECT_STATUS.FAILED, `Failed to invoke actions ${err.message}`, undefined, COPY_ACTION);
                    logger.error('Failed to invoke actions', err);
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
        payload = updateStatusToStateLib(projectPath, PROJECT_STATUS.FAILED, `Failed to invoke actions ${err.message}`, undefined, COPY_ACTION);
        logger.error(err);
    }

    return {
        code: 500,
        payload,
    };
}

exports.main = main;
