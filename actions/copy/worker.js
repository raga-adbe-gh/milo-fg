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
const Project = require('../project');
const {
    getAioLogger, logMemUsage, COPY_ACTION
} = require('../utils');
const HelixUtils = require('../helixUtils');
const FgStatus = require('../fgStatus');
const FgAction = require('../fgAction');
const AppConfig = require('../appConfig');
const FgCopyActionHelper = require('../fgCopyActionHelper');

async function main(params) {
    logMemUsage();
    const logger = getAioLogger();
    let respPayload;
    const valParams = {
        statParams: ['rootFolder', 'projectExcelPath'],
        actParams: ['adminPageUri'],
    };
    const ow = openwhisk();
    // Initialize action
    const appConfig = new AppConfig(params);
    const fgAction = new FgAction(COPY_ACTION, appConfig);
    fgAction.init({ ow, skipUserDetails: true });
    const { fgStatus } = fgAction.getActionParams();
    const { projectExcelPath, fgColor } = appConfig.getPayload();
    try {
        // Validations
        const vStat = await fgAction.validateAction(valParams);
        if (vStat && vStat.code !== 200) {
            return vStat;
        }

        respPayload = 'Getting all files to be floodgated from the project excel file';
        logger.info(respPayload);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });

        const sharepoint = new Sharepoint(appConfig);
        const project = new Project({ sharepoint });
        const fgCopyActionHelper = new FgCopyActionHelper();
        const helixUtils = new HelixUtils(appConfig);
        const projectDetail = await project.getProjectDetails(projectExcelPath);

        respPayload = 'Injecting sharepoint data';
        logger.info(respPayload);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });
        await project.updateProjectWithDocs(projectDetail);

        respPayload = 'Start floodgating content';
        logger.info(respPayload);
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
            statusMessage: respPayload
        });

        respPayload = await fgCopyActionHelper.floodgateContent(projectExcelPath, projectDetail, fgStatus, fgColor, { sharepoint, helixUtils });
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
