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
const { getAioLogger, PROMOTE_ACTION } = require('../utils');
const appConfig = require('../appConfig');
const { isAuthorizedUser } = require('../sharepoint');
const sharepointAuth = require('../sharepointAuth');
const FgStatus = require('../fgStatus');

const logger = getAioLogger();

// Maintainance functions
async function main(args) {
    let payload = {};
    try {
        const params = {
            deleteFilePath: args.deleteFilePath,
            listFilePath: args.listFilePath,
            dataFile: args.dataFile,
            stateStoreKey: args.stateStoreKey,
            clearStateStore: args.clearStateStore,
            groups: args.groups
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
        if (params.listFilePath !== undefined) payload.fileList = await maintAction.listFiles(params.listFilePath);
        if (params.dataFile !== undefined) payload.fileData = await maintAction.dataFile(params.dataFile);
        if (params.stateStoreKey !== undefined) payload.stateStore = await maintAction.stateStoreKey(params.stateStoreKey);
        if (params.groups !== undefined) payload.groups = await maintAction.getGroupUsers(args.groups, args.spToken);

        // Admin function
        if (appConfig.isAdmin(args.adminKey) && params.deleteFilePath !== undefined) payload.deleteStatus = await maintAction.deleteFiles(params.deleteFilePath);
        if (appConfig.isAdmin(args.adminKey) && params.clearStateStore !== undefined) payload.stateStore = (await maintAction.clearStateStore(params.clearStateStore));
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
        // All files are json read the file
        let rawd; let jsond;
        try {
            rawd = await this.filesSdk.read(file);
            jsond = JSON.parse(rawd);
        } catch (err) {
            logger.info(`Error while reading/parsing ${file}`);
        }
        return jsond || rawd?.toString();
    }

    async stateStoreKey(key) {
        // Split by comma (action, statusKey)
        const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: key });
        const data = await fgStatus.getStatusFromStateLib();
        return data;
    }

    async clearStateStore(key) {
        // Split by comma (action, statusKey)
        const fgStatus = new FgStatus({ action: PROMOTE_ACTION, statusKey: key });
        await fgStatus.clearState(true);
        return {};
    }

    async getGroupUsers(grpId, tkn) {
        const at = tkn || await sharepointAuth.getAccessToken();
        return fetch(
            `https://graph.microsoft.com/v1.0/me/memberOf?$count=true&$filter=id eq '${grpId}'`,
            {
                headers: {
                    Authorization: `Bearer ${at}`
                }
            }
        ).then((resp) => resp.json());
    }
}

exports.main = main;
