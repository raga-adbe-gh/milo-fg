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
const filesLib = require('@adobe/aio-lib-files');
const { getAioLogger } = require('../utils');
const appConfig = require('../appConfig');
const { isAuthorizedUser } = require('../sharepoint');
const sharepointAuth = require('../sharepointAuth');

const ENABLE = true;
const logger = getAioLogger();

// Maintainance functions
async function main(args) {
    let payload = {};
    try {
        if (!ENABLE) throw new Error('Permission Denied');
        const params = {
            deleteFilePath: args.deleteFilePath,
            listFilePath: args.listFilePath,
            dataFile: args.dataFile
        };
        appConfig.setAppConfig(args);
        const accountDtls = await isAuthorizedUser(args.spToken);
        if (!accountDtls) {
            payload = 'Could not determine the user.';
            logger.error(payload);
        }
        const userDetails = sharepointAuth.getUserDetails(args.spToken);

        logger.info(`maint action ${JSON.stringify(params)} by ${JSON.stringify(userDetails)}`);
        const filesSdk = await filesLib.init();
        const maintAction = new MaintAction();
        maintAction.setFilesSdk(filesSdk);
        if (params.deleteFilePath !== undefined) payload.deleteStatus = await maintAction.deleteFiles(params.deleteFilePath);
        if (params.listFilePath !== undefined) payload.fileList = await maintAction.listFiles(params.listFilePath);
        if (params.dataFile !== undefined) payload.fileData = (await maintAction.dataFile(params.dataFile))?.toString();
    } catch (err) {
        logger.error(err);
        payload.error = err;
    }

    return {
        payload,
    };
}

class MaintAction {
    setFilesSdk(filesSdk) {
        this.filesSdk = filesSdk;
        this.filesSdkPath = appConfig.getBatchConfig().batchFilesPath;
        return this;
    }

    async deleteFiles(filePath) {
        // e.g file - /milo-floodgate/batching/promoteAction/batch_2/bfile_901.json
        // pass promoteAction/batch_2/bfile_901.json
        // For a complete cleanup use promoteAction/
        const deletePath = `${this.filesSdkPath}/${filePath || ''}`;
        logger.info(`Delete files from ${deletePath}`);
        return this.filesSdk.delete(deletePath);
    }

    async listFiles(filePath) {
        const searchPath = `${this.filesSdkPath}/${filePath || ''}/`;
        logger.info(`List files from ${searchPath}`);
        return this.filesSdk.list(searchPath);
    }

    async dataFile(dataFile) {
        const file = `${this.filesSdkPath}/${dataFile}`;
        logger.info(`Contents for data file ${file}`);
        return this.filesSdk.read(file);
    }
}

exports.main = main;
